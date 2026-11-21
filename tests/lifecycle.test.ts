import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { acceptChallenge } from "../lib/account-mail";
import { id, query } from "../lib/db";
import { hash, matches, session } from "../lib/security";
import { createTask, tick, cancel } from "../lib/engine";
import { pickTier } from "../lib/routing";
let dir: string;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "scarlet-lifecycle-"));
  delete process.env.DATABASE_URL;
  process.env.PUBLIC_DEPLOYMENT = "0";
  process.env.SCARLET_DATA_DIR = dir;
  process.env.SCARLET_MASTER_KEY = randomBytes(32).toString("base64");
});
after(async () => {
  await rm(dir, { recursive: true, force: true });
});
test("verification and reset links expire, are consumed once, and reset revokes sessions", async () => {
  const uid = id();
  await query("INSERT INTO users(id,name,email) VALUES($1,$2,$3)", [
    uid,
    "Test operator",
    uid + "@example.test",
  ]);
  async function issue(purpose: string, expires: Date) {
    const t = randomBytes(32).toString("hex");
    await query(
      "INSERT INTO identity_challenges(digest,user_id,purpose,expires) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,purpose) DO UPDATE SET digest=excluded.digest,expires=excluded.expires",
      [hash(t), uid, purpose, expires.toISOString()],
    );
    return t;
  }
  const future = new Date(Date.now() + 100000);
  const expired = await issue("verify", new Date(0));
  await assert.rejects(acceptChallenge(expired, "verify"));
  const verify = await issue("verify", future);
  await acceptChallenge(verify, "verify");
  await assert.rejects(acceptChallenge(verify, "verify"));
  assert.equal(
    (await query("SELECT email_verified FROM users WHERE id=$1", [uid]))[0]
      .email_verified,
    true,
  );
  await session(uid);
  const reset = await issue("reset", future);
  await acceptChallenge(
    reset,
    "reset",
    " example password that includes spaces ",
  );
  const [u] = await query("SELECT passhash FROM users WHERE id=$1", [uid]);
  assert.ok(
    await matches(" example password that includes spaces ", u.passhash),
  );
  assert.equal(
    (await query("SELECT hash FROM sessions WHERE user_id=$1", [uid])).length,
    0,
  );
});
test("repeating reminders atomically schedule one bounded successor", async () => {
  const uid = id();
  await query("INSERT INTO users(id,name) VALUES($1,$2)", [
    uid,
    "Test operator",
  ]);
  await createTask(uid, "reminder", "Review schedule", {
    repeat: "daily",
    remaining: 2,
  });
  await tick();
  await tick();
  const t = await query("SELECT id,state,payload FROM tasks WHERE user_id=$1", [
    uid,
  ]);
  assert.equal(t.length, 2);
  const next = t.find((v) => v.state === "QUEUED")!;
  assert.equal(next.payload.remaining, 1);
  await cancel(uid, next.id);
  await tick();
  assert.equal(
    (
      await query("SELECT id FROM tasks WHERE user_id=$1 AND state='QUEUED'", [
        uid,
      ])
    ).length,
    0,
  );
});
test("model routing separates coding and vision requests", () => {
  assert.equal(
    pickTier([{ role: "user", content: "Explain this Python function" }]),
    "coding",
  );
  assert.equal(
    pickTier([
      {
        role: "user",
        content: "Describe",
        image: { mimeType: "image/png", data: "AA==" },
      },
    ]),
    "vision",
  );
});
