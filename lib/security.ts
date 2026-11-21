import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { authenticator } from "otplib";
import type { PrismaClient } from "@prisma/client";
import { database, dataDir, id, query, must, Problem, type Row } from "./db";
export const hash = (x: string) => createHash("sha256").update(x).digest("hex");
const derive = promisify(scrypt);
export async function password(
  value: string,
  salt = randomBytes(16).toString("hex"),
) {
  return (
    salt + ":" + ((await derive(value, salt, 64)) as Buffer).toString("hex")
  );
}
export async function matches(value: string, stored: string | null) {
  const reference = stored || "0".repeat(32) + ":" + "0".repeat(128);
  const result = await password(value, reference.split(":")[0]);
  return (
    timingSafeEqual(Buffer.from(result), Buffer.from(reference)) && !!stored
  );
}
async function key() {
  if (process.env.SCARLET_MASTER_KEY) {
    const k = Buffer.from(process.env.SCARLET_MASTER_KEY, "base64");
    must(k.length === 32, "Server encryption key must be 32 bytes.", 503);
    return k;
  }
  must(
    process.env.PUBLIC_DEPLOYMENT !== "1",
    "Server encryption key is required.",
    503,
  );
  await mkdir(dataDir(), { recursive: true, mode: 0o700 });
  const path = join(dataDir(), "local.key");
  try {
    await writeFile(path, randomBytes(32), { flag: "wx", mode: 0o600 });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
  const k = await readFile(path);
  must(k.length === 32, "Local encryption key unavailable.", 503);
  return k;
}
export async function seal(value: unknown) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", await key(), iv);
  const enc = Buffer.concat([
    c.update(JSON.stringify(value), "utf8"),
    c.final(),
  ]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}
export async function unseal<T = any>(value: string): Promise<T> {
  const data = Buffer.from(value, "base64");
  const d = createDecipheriv("aes-256-gcm", await key(), data.subarray(0, 12));
  d.setAuthTag(data.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([d.update(data.subarray(28)), d.final()]).toString("utf8"),
  );
}
export const publicMode = () => process.env.PUBLIC_DEPLOYMENT === "1";
export function origin(req: Request) {
  if (process.env.APP_ORIGIN) return new URL(process.env.APP_ORIGIN).origin;
  must(!publicMode(), "Set APP_ORIGIN to the public HTTPS origin.", 503);
  const host = req.headers.get("host");
  if (host && /^(127\.0\.0\.1|localhost|\[::1\])(:[0-9]{1,5})?$/.test(host))
    return "http://" + host;
  return new URL(req.url).origin;
}
export function csrf(req: Request) {
  must(
    req.headers.get("origin") === origin(req),
    "This action requires a same-origin session.",
    403,
  );
}
export const tokenOf = (req: Request) =>
  req.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)scarlet_session=([a-f0-9]{64})(?:;|$)/)?.[1] || "";
const ormGlobal = globalThis as typeof globalThis & {
  scarletOrm?: PrismaClient;
};
export async function identity(req: Request): Promise<Row> {
  const hashed = hash(tokenOf(req));
  let user: Row | undefined;
  if (process.env.DATABASE_URL) {
    await database();
    const { PrismaClient } = await import("@prisma/client");
    const orm = (ormGlobal.scarletOrm ??= new PrismaClient());
    user = (
      await orm.sessions.findFirst({
        where: { hash: hashed, expires: { gt: new Date() } },
        include: { users: true },
      })
    )?.users;
  } else {
    [user] = await query(
      "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.hash=$1 AND s.expires>now()",
      [hashed],
    );
  }
  if (!user || (publicMode() && (user.guest || !user.email_verified)))
    throw new Problem(401, "Sign in to open your workspace.");
  return user;
}
export function publicUser(u: Row) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    guest: u.guest,
    settings: u.settings,
    mfa: !!u.mfa,
  };
}
export function mfaValid(secret: string, code: string) {
  return /^\d{6}$/.test(code) && authenticator.check(code, secret);
}
export const mfaSecret = () => authenticator.generateSecret();
export async function session(uid: string, guest = false) {
  const t = randomBytes(32).toString("hex"),
    secs = (guest ? 1 : 14) * 86400;
  await query("INSERT INTO sessions(hash,user_id,expires) VALUES($1,$2,$3)", [
    hash(t),
    uid,
    new Date(Date.now() + secs * 1000).toISOString(),
  ]);
  return (
    "scarlet_session=" +
    t +
    "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" +
    secs +
    (publicMode() ? "; Secure" : "")
  );
}
export async function connection(uid: string, kind: string) {
  const [c] = await query(
    "SELECT secret FROM connections WHERE user_id=$1 AND kind=$2",
    [uid, kind],
  );
  if (!c) throw new Problem(409, "Connect " + kind + " in Integrations first.");
  return unseal(c.secret);
}
export async function putConnection(
  uid: string,
  kind: string,
  secret: unknown,
  label: string,
  external: string | null = null,
) {
  await query(
    "INSERT INTO connections(user_id,kind,secret,label,external_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,kind) DO UPDATE SET secret=excluded.secret,label=excluded.label,external_id=excluded.external_id,updated_at=now()",
    [uid, kind, await seal(secret), label, external],
  );
}
export async function newGuest() {
  const uid = id();
  await query(
    "INSERT INTO users(id,name,guest) VALUES($1,'Local operator',true)",
    [uid],
  );
  return uid;
}
