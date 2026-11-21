import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { authenticator } from "otplib";
import { GET, POST } from "../app/api/[...path]/route";
import { database, query } from "../lib/db";
import { tick } from "../lib/engine";
import { indexDocument, searchPassages } from "../lib/document-search";
import { putConnection } from "../lib/security";

const origin = "https://scarlet.test";
let directory = "";

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "scarlet-api-test-"));
  delete process.env.DATABASE_URL;
  delete process.env.CLAMAV_SOCKET;
  process.env.SCARLET_DATA_DIR = directory;
  process.env.SCARLET_MASTER_KEY = randomBytes(32).toString("base64");
  process.env.PUBLIC_DEPLOYMENT = "0";
  process.env.LOCAL_MODEL_DISCOVERY = "0";
  process.env.APP_ORIGIN = origin;
  // Disables automatic timers. Tests advance the queue explicitly, without a Redis connection.
  process.env.REDIS_URL = "redis://127.0.0.1:1";
  await database();
});

after(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function request(
  path: string,
  cookie = "",
  body?: unknown,
  options: {
    origin?: string | null;
    headers?: Record<string, string>;
    raw?: string;
  } = {},
) {
  const post = body !== undefined || options.raw !== undefined;
  const headers = new Headers(options.headers);
  if (cookie) headers.set("cookie", cookie);
  if (post) {
    if (options.origin !== null)
      headers.set("origin", options.origin ?? origin);
    if (!headers.has("content-type"))
      headers.set("content-type", "application/json");
  }
  const req = new Request(`${origin}/api/${path}`, {
    method: post ? "POST" : "GET",
    headers,
    ...(post ? { body: options.raw ?? JSON.stringify(body) } : {}),
  });
  const response = await (post ? POST : GET)(req, {
    params: Promise.resolve({ path: path.split("?")[0].split("/") }),
  });
  return {
    status: response.status,
    headers: response.headers,
    data: await response.json(),
  };
}

type Reply = Awaited<ReturnType<typeof request>>;
function success(r: Reply) {
  assert.equal(r.status, 200, r.data?.error);
  return r.data;
}
function cookie(r: Reply) {
  success(r);
  const header = r.headers.get("set-cookie") ?? "";
  assert.match(header, /^scarlet_session=[0-9a-f]{64};/);
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
  assert.match(header, /Path=\//);
  return header.split(";")[0];
}
function credentials() {
  return {
    email: `${randomUUID()}@example.test`,
    password: randomBytes(24).toString("base64url"),
    name: "Test operator",
  };
}
async function account() {
  const creds = credentials();
  return {
    ...creds,
    cookie: cookie(await request("auth/register", "", creds)),
  };
}
function upload(auth: string, text: string, name = "brief.txt") {
  return request("files/upload", auth, undefined, {
    raw: text,
    headers: {
      "x-file-name": encodeURIComponent(name),
      "content-type": "text/plain",
    },
  });
}

test("auth requires a same-origin mutation and a valid HttpOnly session", async () => {
  assert.equal((await request("state")).status, 401);
  const creds = credentials();
  for (const source of [null, "https://other.test"]) {
    assert.equal(
      (await request("auth/register", "", creds, { origin: source })).status,
      403,
    );
  }
  const session = cookie(await request("auth/register", "", creds));
  assert.equal(
    success(await request("state", session)).user.email,
    creds.email,
  );
  assert.equal((await request("admin", session)).status, 403);
  assert.equal((await request("auth/register", "", creds)).status, 409);
  assert.equal(
    (await request("auth/login", "", { ...creds, password: "incorrect" }))
      .status,
    401,
  );
  const otherSession = cookie(await request("auth/login", "", creds));
  assert.notEqual(session, otherSession);
  assert.equal(
    (
      await request(
        "auth/logout",
        session,
        {},
        { origin: "https://other.test" },
      )
    ).status,
    403,
  );
  success(await request("auth/logout", session, {}));
  assert.equal((await request("state", session)).status, 401);
  assert.equal((await request("state", otherSession)).status, 200);
});

test("upgrading a guest keeps owned data and rotates its session", async () => {
  const guest = cookie(await request("auth/guest", "", {}));
  assert.equal(
    (
      await request("models", guest, {
        provider: "openai",
        key: "test-fixture",
      })
    ).status,
    403,
  );
  const m = success(
    await request("memory", guest, {
      title: "Guest note",
      category: "Project",
      body: "Preserve my guest workspace",
    }),
  );
  const signed = cookie(await request("auth/register", guest, credentials()));
  assert.notEqual(signed, guest);
  assert.equal((await request("state", guest)).status, 401);
  const state = success(await request("state", signed));
  assert.equal(state.user.guest, false);
  assert.equal(state.memories[0].id, m.id);
});

test("public registration verifies a one-time link before issuing a Secure session", async (t) => {
  const creds = credentials();
  let token = "";
  // Only the mail transport is stubbed. Registration, challenge hashing, redemption and login are real.
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      assert.equal(req.url, "https://api.resend.com/emails");
      const message = await req.json();
      assert.deepEqual(message.to, [creds.email]);
      const link = new URL(message.text.match(/https:\/\/[^\s]+/)[0]);
      token = new URLSearchParams(link.hash.slice(1)).get("token") || "";
      return Response.json({ id: "test-mail" });
    },
  );
  process.env.RESEND_API_KEY = "test-fixture";
  process.env.AUTH_EMAIL_FROM = "accounts@example.test";
  process.env.PUBLIC_DEPLOYMENT = "1";
  try {
    assert.equal(success(await request("config")).guest, false);
    assert.equal((await request("auth/guest", "", {})).status, 403);
    const registered = await request("auth/register", "", creds);
    assert.equal(success(registered).needsVerification, true);
    assert.equal(registered.headers.get("set-cookie"), null);
    assert.equal((await request("auth/login", "", creds)).status, 403);
    assert.match(token, /^[a-f0-9]{64}$/);
    success(await request("auth/confirm", "", { purpose: "verify", token }));
    assert.equal(
      (await request("auth/confirm", "", { purpose: "verify", token })).status,
      400,
    );
    const signedIn = await request("auth/login", "", creds);
    cookie(signedIn);
    assert.match(signedIn.headers.get("set-cookie") ?? "", /; Secure(?:;|$)/);
  } finally {
    process.env.PUBLIC_DEPLOYMENT = "0";
    delete process.env.RESEND_API_KEY;
    delete process.env.AUTH_EMAIL_FROM;
  }
});

test("workspace state, mutation endpoints and exports are confined to the signed-in owner", async () => {
  const owner = await account(),
    other = await account();
  const privateText = `Project ${randomUUID()}`;
  const memory = success(
    await request("memory", owner.cookie, {
      title: privateText,
      body: "Owner note",
      category: "Project",
    }),
  );
  const doc = success(await upload(owner.cookie, privateText));
  const chat = success(
    await request("command", owner.cookie, { text: "System status" }),
  );
  const future = new Date(Date.now() + 86400000).toISOString();
  const task = success(
    await request("task", owner.cookie, {
      kind: "reminder",
      title: privateText,
      runAt: future,
    }),
  );
  const event = success(
    await request("event", owner.cookie, {
      title: privateText,
      start: future,
      end: new Date(Date.now() + 90000000).toISOString(),
    }),
  );
  assert.equal(
    success(await request(`files/${doc.id}`, owner.cookie)).body,
    privateText,
  );
  assert.equal(
    success(await request(`tasks/${task.id}`, owner.cookie)).payload.query,
    privateText,
  );
  assert.equal(
    success(await request(`chats/${chat.conversationId}`, owner.cookie)).length,
    2,
  );
  assert.equal((await request(`files/${doc.id}`, other.cookie)).status, 404);
  assert.equal((await request(`tasks/${task.id}`, other.cookie)).status, 404);
  assert.deepEqual(
    success(await request(`chats/${chat.conversationId}`, other.cookie)),
    [],
  );
  assert.equal(
    (
      await request("command", other.cookie, {
        text: "System status",
        conversationId: chat.conversationId,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request("memory", other.cookie, {
        id: memory.id,
        title: "Other",
        body: "Other",
        category: "Project",
      })
    ).status,
    404,
  );
  assert.equal(
    (await request("cancel", other.cookie, { id: task.id })).status,
    409,
  );
  for (const [kind, id] of [
    ["memory", memory.id],
    ["file", doc.id],
    ["event", event.id],
    ["conversation", chat.conversationId],
  ]) {
    assert.equal(
      (await request("delete", other.cookie, { kind, id })).status,
      404,
    );
  }
  const otherState = success(await request("state", other.cookie));
  for (const list of ["memories", "files", "tasks", "events", "conversations"])
    assert.equal(otherState[list].length, 0);
  assert.deepEqual(success(await request("memory/export", other.cookie)), []);
  assert.ok(
    !JSON.stringify(success(await request("export", other.cookie))).includes(
      privateText,
    ),
  );
  const exported = await request("export", owner.cookie);
  assert.match(exported.headers.get("content-disposition") || "", /attachment/);
  assert.equal(
    Buffer.from(success(exported).documents[0].original, "base64").toString(
      "utf8",
    ),
    privateText,
  );
  assert.equal(exported.data.approvals.length, 0);
  assert.equal(exported.data.user.passhash, undefined);
  assert.equal(exported.data.sessions, undefined);
  assert.equal(
    success(await request("memory/export", owner.cookie))[0].title,
    privateText,
  );
});

test("rejects malformed mutations, file type mismatches and overlapping local events", async () => {
  const user = await account();
  assert.equal(
    (await request("memory", user.cookie, {}, { raw: "{" })).status,
    400,
  );
  assert.equal(
    (
      await request(
        "memory",
        user.cookie,
        {},
        { headers: { "content-type": "text/plain" } },
      )
    ).status,
    415,
  );
  assert.equal(
    (
      await request("memory", user.cookie, {
        title: "",
        category: "Project",
        body: "Note",
      })
    ).status,
    400,
  );
  assert.equal(
    (await upload(user.cookie, "plain bytes", "incorrect.pdf")).status,
    422,
  );
  assert.equal(
    (
      await request("task", user.cookie, {
        kind: "unsupported",
        title: "Bad type",
      })
    ).status,
    400,
  );
  const event = {
    title: "Code review",
    start: "2030-10-08T12:00:00.000Z",
    end: "2030-10-08T13:00:00.000Z",
  };
  success(await request("event", user.cookie, event));
  assert.equal((await request("event", user.cookie, event)).status, 409);
  success(
    await request("event", user.cookie, { ...event, allowConflict: true }),
  );
  assert.equal(
    (
      await request("event", user.cookie, {
        ...event,
        start: event.end,
        end: event.start,
      })
    ).status,
    400,
  );
  success(
    await request("event", user.cookie, {
      title: "Offset-aware meeting",
      start: "2030-11-15T18:00:00+05:30",
      end: "2030-11-15T13:30:00Z",
    }),
  );
});

test("external drafts remain pending until their owner approves the final content exactly once", async () => {
  const owner = await account(),
    other = await account();
  const draft = success(
    await request("draft", owner.cookie, {
      kind: "email.send",
      to: "reader@example.test",
      subject: "Delivery notes",
      body: "First version",
    }),
  );
  const detail = () => request("tasks/" + draft.id, owner.cookie).then(success);
  const original = await detail();
  assert.equal(original.state, "WAITING_FOR_APPROVAL");
  assert.equal(original.revision, "1");
  const listed = success(await request("state", owner.cookie)).tasks.find(
    (row: { id: string }) => row.id === draft.id,
  );
  assert.equal(listed.revision, original.revision);
  const first = { id: draft.id, revision: original.revision };
  assert.equal(
    (await request("approve", owner.cookie, { id: draft.id })).status,
    400,
  );
  assert.equal(
    (
      await request("draft/edit", owner.cookie, {
        id: draft.id,
        body: "No revision",
      })
    ).status,
    400,
  );
  assert.equal((await request("approve", other.cookie, first)).status, 409);
  assert.equal(
    (
      await request("draft/edit", other.cookie, {
        ...first,
        body: "Other text",
      })
    ).status,
    409,
  );
  const updated = success(
    await request("draft/edit", owner.cookie, {
      ...first,
      body: "Final version",
    }),
  );
  assert.equal(updated.revision, "2");
  assert.equal(
    (
      await request("draft/edit", owner.cookie, {
        ...first,
        body: "Outdated edit",
      })
    ).status,
    409,
  );
  assert.equal((await request("approve", owner.cookie, first)).status, 409);
  const reviewed = await detail();
  assert.equal(reviewed.state, "WAITING_FOR_APPROVAL");
  assert.equal(reviewed.payload.body, "Final version");
  const current = { id: draft.id, revision: reviewed.revision };
  const approvals = await Promise.all([
    request("approve", owner.cookie, current),
    request("approve", owner.cookie, current),
  ]);
  assert.deepEqual(approvals.map((a) => a.status).sort(), [200, 409]);
  const queued = await detail();
  assert.equal(queued.state, "QUEUED");
  assert.equal(queued.payload.to, "reader@example.test");
  assert.equal(queued.payload.body, "Final version");
  assert.equal(
    (
      await request("draft/edit", owner.cookie, {
        ...current,
        body: "Late edit",
      })
    ).status,
    409,
  );
  success(await request("cancel", owner.cookie, { id: draft.id }));
  assert.equal((await detail()).state, "CANCELLED");
  const exportData = success(await request("export", owner.cookie));
  assert.equal(
    exportData.audits.filter(
      (a: { title: string }) => a.title === "Approved external action",
    ).length,
    1,
  );
});

test("completed local workflow exposes its results, progress and a single notification", async () => {
  const owner = await account();
  const task = success(
    await request("task", owner.cookie, {
      kind: "task",
      title: "Review the brief",
    }),
  );
  await tick();
  await tick();
  const detail = success(await request("tasks/" + task.id, owner.cookie));
  assert.equal(detail.state, "COMPLETED");
  assert.equal(detail.result.text, "Review the brief");
  assert.ok(detail.steps.length >= 2);
  const state = success(await request("state", owner.cookie));
  assert.equal(
    state.notifications.filter(
      (n: { body: string }) => n.body === "Review the brief",
    ).length,
    1,
  );
});

test("MFA enrollment revokes other sessions and account deletion requires current credentials", async () => {
  const user = await account();
  const otherSession = cookie(
    await request("auth/login", "", {
      email: user.email,
      password: user.password,
    }),
  );
  const secret = success(
    await request("mfa/start", user.cookie, { password: user.password }),
  ).secret;
  assert.equal(
    (
      await request("mfa/enable", user.cookie, {
        password: user.password,
        code: "invalid",
      })
    ).status,
    400,
  );
  success(
    await request("mfa/enable", user.cookie, {
      password: user.password,
      code: authenticator.generate(secret),
    }),
  );
  assert.equal((await request("state", otherSession)).status, 401);
  assert.equal(
    (
      await request("auth/login", "", {
        email: user.email,
        password: user.password,
      })
    ).status,
    401,
  );
  const valid = cookie(
    await request("auth/login", "", {
      email: user.email,
      password: user.password,
      code: authenticator.generate(secret),
    }),
  );
  assert.equal(success(await request("state", valid)).user.mfa, true);
  assert.equal(
    (
      await request("account/delete", valid, {
        password: "incorrect",
        code: authenticator.generate(secret),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("account/delete", valid, {
        password: user.password,
        code: "invalid",
      })
    ).status,
    403,
  );
  const note = success(
    await request("memory", valid, {
      title: "Removal test",
      body: "Erase with account.",
      category: "Project",
    }),
  );
  success(
    await request("account/delete", valid, {
      password: user.password,
      code: authenticator.generate(secret),
    }),
  );
  assert.equal((await request("state", valid)).status, 401);
  assert.equal((await request("state", user.cookie)).status, 401);
  assert.equal(
    (
      await request("auth/login", "", {
        email: user.email,
        password: user.password,
        code: authenticator.generate(secret),
      })
    ).status,
    401,
  );
  assert.deepEqual(
    await query("SELECT id FROM memories WHERE id=$1", [note.id]),
    [],
  );
});

test("file search and Q&A retrieve a late passage without exposing another workspace, including legacy files", async (t) => {
  const owner = await account(),
    other = await account();
  const uid = success(await request("state", owner.cookie)).user.id;
  const text =
    "Routine daily notes for the project. ".repeat(2800) +
    "\nThe geothermal bypass valve turns clockwise.";
  const doc = success(await upload(owner.cookie, text));
  const endpoint =
    "files/search?q=" + encodeURIComponent("geothermal bypass valve");
  const found = success(await request(endpoint, owner.cookie));
  assert.ok(found.length > 0 && found.length <= 6);
  assert.equal(found[0].documentId, doc.id);
  assert.ok(found[0].part > 20);
  assert.match(found[0].body, /turns clockwise/);
  assert.deepEqual(success(await request(endpoint, other.cookie)), []);
  assert.ok(
    (
      await query(
        "SELECT part FROM document_passages WHERE user_id=$1 AND document_id=$2",
        [uid, doc.id],
      )
    ).length > 20,
  );
  await putConnection(
    uid,
    "model",
    { provider: "anthropic", apiKey: "test-fixture", model: "test-model" },
    "Test model",
  );
  let modelSawDocument = false;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      assert.equal(new URL(req.url).hostname, "api.anthropic.com");
      const sent = await req.json();
      const evidence = JSON.parse(sent.messages[0].content);
      assert.equal(evidence.filename, "brief.txt");
      assert.ok(evidence.passages.length <= 6);
      assert.ok(
        evidence.passages.some(
          (p: { part: number; text: string }) =>
            p.part > 20 && p.text.includes("turns clockwise"),
        ),
      );
      modelSawDocument = true;
      return Response.json({
        content: [
          { type: "text", text: "Test response from supplied evidence." },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      });
    },
  );
  const answer = success(
    await request("command", owner.cookie, {
      text: "How does the geothermal bypass valve turn?",
      documentId: doc.id,
    }),
  );
  assert.equal(answer.intent, "document", answer.text);
  assert.ok(modelSawDocument);
  await query(
    "DELETE FROM document_passages WHERE user_id=$1 AND document_id=$2",
    [uid, doc.id],
  );
  assert.match(
    success(await request(endpoint, owner.cookie))[0].body,
    /turns clockwise/,
  );
  assert.match(
    (await searchPassages(uid, "bypass valve", doc.id))[0].body,
    /turns clockwise/,
  );
  assert.deepEqual(success(await request(endpoint, other.cookie)), []);
});

test("vector passage search uses the tenant model, caps upload cost, deduplicates indexing and falls back on provider failure", async (t) => {
  const owner = await account(),
    other = await account();
  const uid = success(await request("state", owner.cookie)).user.id;
  await putConnection(
    uid,
    "model",
    { provider: "openai", apiKey: "test-fixture", model: "test-chat" },
    "Test OpenAI",
  );
  const previous = process.env.EMBEDDING_MODEL;
  process.env.EMBEDDING_MODEL = "test-embedding";
  let count = 0,
    unavailable = false;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init),
        url = new URL(req.url);
      assert.equal(url.hostname, "api.openai.com");
      if (unavailable)
        return Response.json(
          { error: { message: "Test service unavailable" } },
          { status: 503 },
        );
      if (url.pathname.includes("/models/"))
        return Response.json({ id: "test-embedding", object: "model" });
      assert.ok(url.pathname.endsWith("/embeddings"));
      count++;
      const vector = new Array(1536).fill(0);
      vector[0] = 1;
      return Response.json({
        object: "list",
        data: [{ index: 0, object: "embedding", embedding: vector }],
        model: "test-embedding",
        usage: { prompt_tokens: 2, total_tokens: 2 },
      });
    },
  );
  try {
    const file = success(
      await upload(
        owner.cookie,
        "A thermal conduit cools the habitat. ".repeat(500),
      ),
    );
    assert.equal(count, 3);
    await indexDocument(uid, file.id);
    assert.equal(count, 3);
    const found = success(
      await request("files/search?q=temperature", owner.cookie),
    );
    assert.equal(found[0].documentId, file.id);
    assert.equal(count, 4);
    assert.deepEqual(
      success(await request("files/search?q=temperature", other.cookie)),
      [],
    );
    assert.equal(count, 4);
    unavailable = true;
    assert.match(
      success(await request("files/search?q=conduit", owner.cookie))[0].body,
      /conduit/,
    );
    success(
      await request("delete", owner.cookie, { id: file.id, kind: "file" }),
    );
    assert.deepEqual(
      await query(
        "SELECT part FROM document_passages WHERE user_id=$1 AND document_id=$2",
        [uid, file.id],
      ),
      [],
    );
  } finally {
    if (previous === undefined) delete process.env.EMBEDDING_MODEL;
    else process.env.EMBEDDING_MODEL = previous;
  }
});
