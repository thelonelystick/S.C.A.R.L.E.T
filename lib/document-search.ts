import { audit, database, query } from "./db";
import { tenantEmbedding } from "./semantic";

export interface Passage {
  documentId: string;
  name: string;
  part: number;
  body: string;
}
const RESULTS = 6;
const sourceLimit = 120000;
const stop = new Set(
  "a an and any are as at be by can did do does file find for from how in is it me my of on or please that the there this to was were what when where which who why with would you".split(
    " ",
  ),
);

/** The 64-part cap covers the full maximum normalized upload, including the final paragraph. */
export function splitPassages(source: string): string[] {
  const text = source.slice(0, sourceLimit);
  const passages: string[] = [];
  let start = 0;
  while (start < text.length && passages.length < 64) {
    let end = Math.min(text.length, start + 2400);
    if (end < text.length) {
      // Prefer a whitespace boundary in the last 260 characters, including for long code lines.
      const tail = text.slice(end - 260, end);
      const boundary = Math.max(tail.lastIndexOf("\n"), tail.lastIndexOf(" "));
      if (boundary >= 0) end -= 259 - boundary;
      if (/[\uD800-\uDBFF]/.test(text.charAt(end - 1))) end--;
    }
    const body = text.slice(start, end).trim();
    if (body) passages.push(body);
    if (end === text.length) break;
    start = end - 140;
    if (/[\uDC00-\uDFFF]/.test(text.charAt(start))) start++;
  }
  return passages;
}
function evenly<T>(rows: T[], count: number) {
  return rows.length <= count
    ? rows
    : Array.from(
        { length: count },
        (_, i) => rows[Math.round((i * (rows.length - 1)) / (count - 1))],
      );
}
function terms(text: string) {
  const tokens = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [
    ...new Set(tokens.filter((t) => t.length <= 80 && !stop.has(t))),
  ].slice(0, 24);
}

export async function indexDocument(uid: string, docId: string) {
  // Read from the committed, owned document. An already indexed upload never starts another vector pass.
  const [doc] = await query(
    "SELECT body FROM documents WHERE user_id=$1 AND id=$2",
    [uid, docId],
  );
  if (!doc?.body) return;
  const input = splitPassages(doc.body);
  const inserted = await (
    await database()
  ).tx((q) =>
    q<{ part: number; body: string }>(
      `
    INSERT INTO document_passages(user_id,document_id,part,body)
    SELECT $1,$2,ordinality::integer,body FROM unnest($3::text[]) WITH ORDINALITY AS p(body,ordinality)
    ON CONFLICT DO NOTHING RETURNING part,body`,
      [uid, docId, input],
    ),
  );
  if (!inserted.length || !process.env.EMBEDDING_MODEL) return;
  // Use at most three provider requests per file. Other passages retain complete local text indexing.
  try {
    for (const p of evenly(
      inserted.sort((a, b) => a.part - b.part),
      3,
    )) {
      const vector = await tenantEmbedding(uid, p.body);
      if (!vector) break;
      await query(
        "UPDATE document_passages SET vec=$4::vector,vector_model=$5 WHERE user_id=$1 AND document_id=$2 AND part=$3",
        [uid, docId, p.part, JSON.stringify(vector.embedding), vector.model],
      );
    }
  } catch {
    await audit(
      uid,
      "Document embedding unavailable",
      "warning",
      "File remains searchable by terms.",
    );
  }
}

const columns = 'p.document_id AS "documentId",d.name,p.part,p.body';
const owned =
  "FROM document_passages p JOIN documents d ON d.user_id=p.user_id AND d.id=p.document_id WHERE p.user_id=$1 AND ($2::text IS NULL OR p.document_id=$2)";

export async function searchPassages(
  uid: string,
  question: string,
  docId?: string,
): Promise<Passage[]> {
  const words = terms(question),
    scope = [uid, docId ?? null];
  const expression = words.map((w) => `'${w}'`).join(" | ");
  const lexical: Passage[] = expression
    ? await query<Passage>(
        `SELECT ${columns} ${owned} AND p.terms @@ to_tsquery('simple',$3)
    ORDER BY ts_rank_cd(p.terms,to_tsquery('simple',$3)) DESC,p.document_id,p.part LIMIT 16`,
        [...scope, expression],
      )
    : [];
  // Old or interrupted uploads remain searchable without silently creating a paid index.
  const legacy = await query<{ id: string; name: string; body: string }>(
    `SELECT d.id,d.name,d.body FROM documents d
    WHERE d.user_id=$1 AND ($2::text IS NULL OR d.id=$2) AND d.body<>''
    AND NOT EXISTS (SELECT 1 FROM document_passages p WHERE p.user_id=d.user_id AND p.document_id=d.id)
    AND ($2::text IS NOT NULL OR ($3<>'' AND to_tsvector('simple',d.body) @@ to_tsquery('simple',nullif($3,''))))
    ORDER BY d.created_at DESC,d.id LIMIT 6`,
    [...scope, expression],
  );
  const old: Passage[] = legacy.flatMap((d) =>
    splitPassages(d.body).map((body, i) => ({
      documentId: d.id,
      name: d.name,
      part: i + 1,
      body,
    })),
  );
  const wanted = new Set(words);
  const rankedOld = old
    .map((p) => ({
      p,
      score: new Set(
        (p.body.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) =>
          wanted.has(w),
        ),
      ).size,
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.p);
  let semantic: Passage[] = [];
  if (process.env.EMBEDDING_MODEL) {
    const model = process.env.EMBEDDING_MODEL;
    const [indexed] = await query(
      `SELECT 1 ${owned} AND p.vec IS NOT NULL AND p.vector_model=$3 LIMIT 1`,
      [...scope, model],
    );
    if (indexed)
      try {
        const v = await tenantEmbedding(uid, question.slice(0, 1400));
        if (v)
          semantic = await query<Passage>(
            `SELECT ${columns} ${owned} AND p.vector_model=$4 AND p.vec IS NOT NULL AND (p.vec <=> $3::vector)<0.55
        ORDER BY p.vec <=> $3::vector,p.document_id,p.part LIMIT 12`,
            [...scope, JSON.stringify(v.embedding), v.model],
          );
      } catch {
        /* Local keyword matches remain available when quota or provider is unavailable. */
      }
  }
  const hits = new Map<string, { p: Passage; score: number }>();
  for (const list of [lexical, rankedOld.slice(0, 16), semantic]) {
    list.forEach((p, i) => {
      const key = p.documentId + "/" + p.part;
      const previous = hits.get(key);
      hits.set(key, { p, score: (previous?.score ?? 0) + 1 / (10 + i) });
    });
  }
  const result = [...hits.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, RESULTS)
    .map((s) => s.p);
  if (result.length || !docId) return result;
  // General requests such as summaries need coverage across the document, including its end.
  const all = old.length
    ? old
    : await query<Passage>(
        `SELECT ${columns} ${owned} ORDER BY p.part LIMIT 64`,
        scope,
      );
  return evenly(all, RESULTS);
}
