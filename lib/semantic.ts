import { query, quota, audit, type Row } from "./db";
import { embedText } from "./connectors";
import { connection } from "./security";
export async function tenantEmbedding(uid: string, text: string) {
  if (!process.env.EMBEDDING_MODEL) return;
  const [linked] = await query(
    "SELECT kind FROM connections WHERE user_id=$1 AND kind='model'",
    [uid],
  );
  if (!linked) return;
  const c = await connection(uid, "model");
  if (c.provider !== "openai") return;
  await quota("embeddings:" + uid, 80, 86400);
  return embedText(c.apiKey, text);
}
export async function indexMemory(uid: string, mid: string, text: string) {
  try {
    const v = await tenantEmbedding(uid, text);
    if (v)
      await query(
        "UPDATE memories SET vec=$3::vector,vector_model=$4 WHERE id=$1 AND user_id=$2 AND body=$5",
        [mid, uid, JSON.stringify(v.embedding), v.model, text],
      );
  } catch {
    await audit(
      uid,
      "Semantic index unavailable",
      "warning",
      "Memory remains available by keyword.",
    );
  }
}
export async function semanticMemories(
  uid: string,
  text: string,
): Promise<Row[]> {
  try {
    const v = await tenantEmbedding(uid, text);
    if (v)
      return query(
        "SELECT title,body FROM memories WHERE user_id=$1 AND (expires IS NULL OR expires>now()) AND vec IS NOT NULL AND vector_model=$3 AND (vec <=> $2::vector)<0.55 ORDER BY vec <=> $2::vector LIMIT 5",
        [uid, JSON.stringify(v.embedding), v.model],
      );
  } catch {}
  return [];
}
