import { mkdir, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import type { Pool, PoolClient } from "pg";

export const dataDir = () =>
  resolve(process.env.SCARLET_DATA_DIR || ".scarlet");
export const id = randomUUID;
export type Row = Record<string, any>;
type Runner = <T extends Row = Row>(sql: string, args?: any[]) => Promise<T[]>;
type DB = { q: Runner; tx: <T>(fn: (q: Runner) => Promise<T>) => Promise<T> };
const shared = globalThis as typeof globalThis & { scarletStore?: Promise<DB> };
async function open(): Promise<DB> {
  let embedded: PGlite | undefined, pool: Pool | undefined;
  if (process.env.DATABASE_URL) {
    const { Pool } = await import("pg");
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 8,
      connectionTimeoutMillis: 8000,
    });
  } else {
    if (process.env.PUBLIC_DEPLOYMENT === "1")
      throw Error("DATABASE_URL is required in public mode.");
    const { PGlite } = await import("@electric-sql/pglite");
    await mkdir(dataDir(), { recursive: true, mode: 0o700 });
    const { vector } = await import("@electric-sql/pglite/vector");
    embedded = new PGlite(join(dataDir(), "postgres"), {
      extensions: { vector },
    });
    await embedded.waitReady;
  }
  function runner(client: Pool | PoolClient | PGlite | any): Runner {
    return async (sql, args = []) => (await client.query(sql, args)).rows;
  }
  const q: Runner = runner(pool || embedded);
  const tx: DB["tx"] = async (fn) => {
    if (embedded) return embedded.transaction((t) => fn(runner(t)));
    const c = await pool!.connect();
    try {
      await c.query("BEGIN");
      const result = await fn(runner(c));
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  };
  if (
    (process.env.PUBLIC_DEPLOYMENT === "1" ||
      process.env.SCARLET_SKIP_MIGRATIONS === "1") &&
    process.env.SCARLET_RUN_MIGRATIONS !== "1"
  )
    return { q, tx };
  await tx(async (run) => {
    if (pool) await run("SELECT pg_advisory_xact_lock(730221)");
    await run(
      "CREATE TABLE IF NOT EXISTS migrations(name text PRIMARY KEY,applied_at timestamptz DEFAULT now())",
    );
    for (const name of (await readdir("migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      if (
        (await run("SELECT name FROM migrations WHERE name=$1", [name])).length
      )
        continue;
      const ddl = await readFile(join("migrations", name), "utf8");
      for (const statement of ddl
        .split(";")
        .map((x) => x.trim())
        .filter(Boolean))
        await run(statement);
      await run("INSERT INTO migrations(name) VALUES($1)", [name]);
    }
  });
  return { q, tx };
}
export function database() {
  return (shared.scarletStore ??= open().catch((e) => {
    delete shared.scarletStore;
    throw e;
  }));
}
export const query: Runner = async (sql, args = []) =>
  (await database()).q(sql, args);
export async function audit(
  user: string,
  title: string,
  kind = "system",
  detail = "",
  run: Runner = query,
) {
  await run(
    "INSERT INTO audits(id,user_id,title,kind,detail) VALUES($1,$2,$3,$4,$5)",
    [id(), user, title, kind, detail],
  );
}
export class Problem extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function must(
  value: unknown,
  message: string,
  status = 400,
): asserts value {
  if (!value) throw new Problem(status, message);
}
export async function quota(bucket: string, max: number, seconds: number) {
  const period = Math.floor(Date.now() / (seconds * 1000));
  const [row] = await query(
    "INSERT INTO usage(bucket,n,expires) VALUES($1,1,$2) ON CONFLICT(bucket) DO UPDATE SET n=usage.n+1 RETURNING n",
    [
      bucket + ":" + period,
      new Date((period + 1) * seconds * 1000).toISOString(),
    ],
  );
  must(
    row.n <= max,
    "Usage limit reached. Try again after the current window.",
    429,
  );
}
