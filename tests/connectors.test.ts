import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { test, type TestContext } from "node:test";
import {
  beginGoogleOAuth,
  canAutoReply,
  chatModel,
  createEvent,
  discoverModels,
  embedText,
  exchangeGoogleCode,
  googleScopes,
  hasWhatsAppWindow,
  listEmail,
  planModelTools,
  readWhatsAppInbound,
  revokeGoogleToken,
  searchWeb,
  sendEmail,
  sendWhatsApp,
  sendWhatsAppTemplate,
  validateToolPlan,
  verifyWhatsAppChallenge,
  verifyWhatsAppPhone,
  verifyWhatsAppSignature,
  type AutoReplyPolicy,
} from "../lib/connectors";

function env(t: TestContext, entries: Record<string, string>) {
  for (const [key, value] of Object.entries(entries)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
}

function intercept(
  t: TestContext,
  handler: (request: Request) => Response | Promise<Response>,
) {
  const calls: Request[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      calls.push(request);
      return handler(request);
    },
  );
  return calls;
}

test("Google consent binds a high-entropy state, S256 challenge and restricted scopes", async (t) => {
  env(t, {
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-secret",
    GOOGLE_REDIRECT_URI: "http://localhost:3000/api/oauth/google/callback",
  });
  const auth = beginGoogleOAuth(["gmail.read"]);
  const second = beginGoogleOAuth(["gmail.read"]);
  const url = new URL(auth.url);
  assert.notEqual(auth.state, second.state);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("state"), auth.state);
  assert.equal(url.searchParams.get("scope"), googleScopes["gmail.read"]);
  assert.equal(
    url.searchParams.get("code_challenge"),
    createHash("sha256").update(auth.verifier).digest("base64url"),
  );
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(
    !auth.url.includes("test-secret") && !auth.url.includes(auth.verifier),
  );
  intercept(t, async (r) => {
    assert.equal(r.url, "https://oauth2.googleapis.com/token");
    const form = new URLSearchParams(await r.text());
    assert.equal(form.get("code_verifier"), auth.verifier);
    return Response.json({
      access_token: "test-access",
      refresh_token: "test-refresh",
      expires_in: 3600,
      scope: googleScopes["gmail.read"],
    });
  });
  const grant = await exchangeGoogleCode("test-code", auth.verifier);
  assert.equal(grant.accessToken, "test-access");
  assert.deepEqual(grant.scopes, [googleScopes["gmail.read"]]);
  assert.ok(grant.expiresAt > Date.now());
});

test("Google grant revocation accepts an empty HTTP success", async (t) => {
  intercept(t, () => new Response(null, { status: 200 }));
  await revokeGoogleToken("test-grant");
});

test("Gmail validates single recipients, encodes Unicode subjects and preserves original approved body", async (t) => {
  const calls = intercept(t, async (r) => {
    const data = (await r.json()) as { raw: string };
    assert.equal(r.method, "POST");
    const mime = Buffer.from(data.raw, "base64url").toString();
    assert.ok(mime.includes("To: recipient@example.org\r\n"));
    assert.ok(mime.includes("=?UTF-8?B?"));
    assert.ok(
      mime.includes(Buffer.from("A reviewed message").toString("base64")),
    );
    return Response.json({ id: "m1", threadId: "t1" });
  });
  await assert.rejects(
    sendEmail("test", {
      to: "recipient@example.org\r\nBcc: injected@example.org",
      subject: "Hi",
      body: "Body",
    }),
  );
  await assert.rejects(
    sendEmail("test", {
      to: "recipient@example.org",
      subject: "Hi\nBcc: a@example.org",
      body: "Body",
    }),
  );
  assert.equal(calls.length, 0);
  assert.deepEqual(
    await sendEmail("test", {
      to: "recipient@example.org",
      subject: "Projet été",
      body: "A reviewed message",
    }),
    { id: "m1", threadId: "t1" },
  );
  assert.equal(calls.length, 1);
});

test("Gmail reads a bounded search page and retrieves matched metadata", async (t) => {
  const calls = intercept(t, (r) => {
    const u = new URL(r.url);
    assert.equal(r.headers.get("authorization"), "Bearer test");
    if (u.pathname.endsWith("/messages")) {
      assert.equal(u.searchParams.get("q"), "is:unread");
      return Response.json({ messages: [{ id: "m1" }] });
    }
    return Response.json({
      id: "m1",
      threadId: "t1",
      snippet: "Message preview",
      labelIds: ["UNREAD"],
      payload: { headers: [{ name: "Subject", value: "Agenda" }] },
    });
  });
  const items = await listEmail("test", "is:unread");
  assert.equal(calls.length, 2);
  assert.equal(items[0].unread, true);
  assert.equal(items[0].subject, "Agenda");
});

test("Calendar refuses an overlapping busy event before any provider mutation", async (t) => {
  const calls = intercept(t, () =>
    Response.json({
      items: [
        {
          id: "e",
          summary: "Meeting",
          start: { dateTime: "2026-01-10T10:00:00Z" },
          end: { dateTime: "2026-01-10T11:00:00Z" },
        },
      ],
    }),
  );
  await assert.rejects(
    createEvent("test", {
      summary: "Collision",
      start: "2026-01-10T10:30:00Z",
      end: "2026-01-10T11:30:00Z",
    }),
    /overlaps/,
  );
  assert.deepEqual(
    calls.map((r) => r.method),
    ["GET"],
  );
});

test("WhatsApp verifies exact webhook bytes and normalizes only inbound text", () => {
  const object = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "123" },
              messages: [
                {
                  type: "text",
                  from: "15551112222",
                  id: "wamid.1",
                  timestamp: "1700000000",
                  text: { body: "STOP" },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const raw = JSON.stringify(object);
  const signature =
    "sha256=" + createHmac("sha256", "test-secret").update(raw).digest("hex");
  assert.equal(verifyWhatsAppSignature(raw, signature, "test-secret"), true);
  assert.equal(
    verifyWhatsAppSignature(raw + " ", signature, "test-secret"),
    false,
  );
  assert.equal(verifyWhatsAppSignature(raw, "sha256=00", "test-secret"), false);
  assert.deepEqual(readWhatsAppInbound(object), [
    {
      phoneId: "123",
      id: "wamid.1",
      from: "15551112222",
      timestamp: 1700000000000,
      text: "STOP",
      optedOut: true,
      requestedHandoff: false,
    },
  ]);
  const params = new URLSearchParams({
    "hub.mode": "subscribe",
    "hub.verify_token": "token",
    "hub.challenge": "54",
  });
  assert.equal(verifyWhatsAppChallenge(params, "token"), "54");
  assert.equal(verifyWhatsAppChallenge(params, "wrong"), null);
});

test("WhatsApp rejects expired customer windows and template sends without opt-in", async (t) => {
  env(t, { META_GRAPH_VERSION: "v27.0" });
  const calls = intercept(t, () =>
    Response.json({ messages: [{ id: "wamid.accepted" }] }),
  );
  const input = {
    phoneId: "123",
    token: "test",
    to: "15551234567",
    text: "Approved text",
    lastInboundAt: Date.now() - 24 * 3_600_000,
  };
  assert.equal(hasWhatsAppWindow(input.lastInboundAt), false);
  await assert.rejects(sendWhatsApp(input), /closed/);
  await assert.rejects(
    sendWhatsAppTemplate({
      ...input,
      name: "welcome",
      language: "en_US",
      optedIn: false,
    }),
    /opt-in/,
  );
  assert.equal(calls.length, 0);
  assert.deepEqual(
    await sendWhatsApp({ ...input, lastInboundAt: Date.now() }),
    { id: "wamid.accepted" },
  );
  assert.equal(calls.length, 1);
});

test("WhatsApp connection refuses a different provider phone ID", async (t) => {
  env(t, { META_GRAPH_VERSION: "v27.0" });
  intercept(t, () => Response.json({ id: "456" }));
  await assert.rejects(
    verifyWhatsAppPhone("test", "123"),
    /does not authorize/,
  );
});

test("Auto-reply checks business-local overnight hours, audience, pause, opt-outs, handoff and budget", () => {
  const now = Date.parse("2026-11-22T04:00:00Z"); // Saturday 23:00 in New York.
  const policy: AutoReplyPolicy = {
    mode: "auto",
    paused: false,
    excluded: [],
    allowlist: ["+15551234567"],
    days: [6],
    timezone: "America/New_York",
    startHour: 22,
    endHour: 2,
    maxPerHour: 5,
  };
  const context = {
    from: "15551234567",
    lastInboundAt: now - 60_000,
    optedOut: false,
    handoff: false,
    sentLastHour: 4,
  };
  assert.equal(canAutoReply(policy, context, now).allowed, true);
  assert.equal(
    canAutoReply(policy, context, now + 2 * 3_600_000).allowed,
    true,
  );
  assert.equal(
    canAutoReply(policy, context, now + 3 * 3_600_000).allowed,
    false,
  );
  for (const override of [
    { paused: true },
    { mode: "manual" as const },
    { allowlist: [] },
    { excluded: [context.from] },
    { timezone: "Invalid/Zone" },
  ]) {
    assert.equal(
      canAutoReply({ ...policy, ...override }, context, now).allowed,
      false,
    );
  }
  for (const override of [
    { handoff: true },
    { optedOut: true },
    { sentLastHour: 5 },
    { lastInboundAt: now - 86_400_000 },
  ]) {
    assert.equal(
      canAutoReply(policy, { ...context, ...override }, now).allowed,
      false,
    );
  }
});

test("Model discovery filters Gemini capabilities and paginates", async (t) => {
  intercept(t, (r) => {
    assert.equal(r.headers.get("x-goog-api-key"), "test");
    return new URL(r.url).searchParams.get("pageToken") === "next"
      ? Response.json({
          models: [
            {
              name: "models/b",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        })
      : Response.json({
          models: [
            { name: "models/a", supportedGenerationMethods: ["embedContent"] },
          ],
          nextPageToken: "next",
        });
  });
  assert.deepEqual(await discoverModels("google", "test"), ["b"]);
});

test("Gemini displays answer text and omits thought segments", async (t) => {
  intercept(t, () =>
    Response.json({
      candidates: [
        {
          content: {
            parts: [{ text: "private", thought: true }, { text: "public" }],
          },
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 3,
        thoughtsTokenCount: 4,
      },
    }),
  );
  assert.deepEqual(
    await chatModel({
      provider: "google",
      apiKey: "test",
      model: "fixture",
      system: "Test",
      messages: [{ role: "user", content: "Hello" }],
    }),
    { text: "public", inputTokens: 10, outputTokens: 7 },
  );
});

test("Search drops invalid source URLs and shields provider errors", async (t) => {
  const calls = intercept(t, (r) =>
    new URL(r.url).searchParams.get("q") === "error"
      ? new Response("secret from upstream", { status: 403 })
      : Response.json({
          web: {
            results: [
              {
                title: "Source",
                description: "Snippet",
                url: "https://example.org/a",
              },
              { url: "javascript:alert(1)" },
              { url: "https://user:password@example.org/" },
            ],
          },
        }),
  );
  assert.deepEqual(await searchWeb("topic", "test"), [
    { title: "Source", description: "Snippet", url: "https://example.org/a" },
  ]);
  await assert.rejects(
    searchWeb("error", "test"),
    (error: Error) =>
      !error.message.includes("secret") &&
      error.message.includes("permissions"),
  );
  assert.equal(calls[0].headers.get("X-Subscription-Token"), "test");
});

test("Plans accept only bounded steps from the caller's authorized tool list", async (t) => {
  const step = { tool: "memory.search" as const, argument: "preferred format" };
  const calls = intercept(t, async (r) => {
    const data = (await r.json()) as {
      tool_choice: { name: string };
      tools: { input_schema: object }[];
    };
    assert.equal(data.tool_choice.name, "propose_workspace_plan");
    assert.equal(data.tools.length, 1);
    return Response.json({
      content: [
        {
          type: "tool_use",
          name: "propose_workspace_plan",
          input: { steps: [step] },
        },
      ],
      usage: { input_tokens: 20, output_tokens: 8 },
    });
  });
  assert.deepEqual(
    await planModelTools({
      provider: "anthropic",
      apiKey: "test",
      model: "fixture",
      instruction: "Find my saved format",
      allowedTools: ["memory.search"],
    }),
    { steps: [step], inputTokens: 20, outputTokens: 8 },
  );
  assert.equal(calls.length, 1);
  assert.throws(() => validateToolPlan({ steps: [step] }, ["calendar.list"]));
  assert.throws(() =>
    validateToolPlan({ steps: Array(5).fill(step) }, ["memory.search"]),
  );
  assert.throws(() =>
    validateToolPlan({ steps: [{ ...step, secret: "extra" }] }, [
      "memory.search",
    ]),
  );
});

test("Embeddings verify operator-selected model availability and reject invalid dimensions", async (t) => {
  env(t, { EMBEDDING_MODEL: "fixture-model" });
  const calls = intercept(t, async (r) => {
    if (r.method === "GET") {
      assert.equal(new URL(r.url).pathname, "/v1/models/fixture-model");
      return Response.json({ id: "fixture-model", object: "model" });
    }
    const data = (await r.json()) as { input: string; dimensions: number };
    assert.equal(data.dimensions, 1536);
    return Response.json({
      data: [
        {
          embedding: Array(data.input === "short" ? 2 : 1536).fill(0.05),
          index: 0,
          object: "embedding",
        },
      ],
      model: "fixture-model",
      usage: { prompt_tokens: 3 },
    });
  });
  const result = await embedText("test", "memory");
  assert.equal(result.embedding.length, 1536);
  assert.equal(result.inputTokens, 3);
  await assert.rejects(embedText("test", "short"), /incompatible/);
  await assert.rejects(embedText("test", "memory", "other"), /does not match/);
  assert.equal(calls.length, 4);
});
