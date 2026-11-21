import assert from "node:assert/strict";
import { after, before, test, type TestContext } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { database, id, query } from "../lib/db";
import { approve } from "../lib/engine";
import {
  businessDraftScope,
  connectBusiness,
  deliverBusiness,
  disconnectBusiness,
  generateBusinessReply,
  receiveBusinessWebhook,
  setBusinessPolicy,
  setHandoff,
} from "../lib/business";
import type { AutoReplyPolicy } from "../lib/connectors";

let path = "";
before(async () => {
  path = await mkdtemp(join(tmpdir(), "scarlet-wa-test-"));
  delete process.env.DATABASE_URL;
  process.env.SCARLET_DATA_DIR = path;
  process.env.PUBLIC_DEPLOYMENT = "0";
  process.env.SCARLET_MASTER_KEY = Buffer.alloc(32, 17).toString("base64");
  process.env.META_GRAPH_VERSION = "v27.0";
  await database();
});
after(async () => {
  if (path) await rm(path, { recursive: true, force: true });
});

const contact = "15551234567";
const policy: AutoReplyPolicy = {
  mode: "auto",
  paused: false,
  allowlist: [contact],
  excluded: [],
  timezone: "UTC",
  days: [0, 1, 2, 3, 4, 5, 6],
  startHour: 0,
  endHour: 24,
  maxPerHour: 5,
};
function webhook(
  phone: string,
  msgId: string,
  text = "When do you open?",
  secondsAgo = 5,
  from = contact,
) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: phone },
              messages: [
                {
                  type: "text",
                  id: msgId,
                  from,
                  timestamp: String(Math.floor(Date.now() / 1000) - secondsAgo),
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}
function transport(t: TestContext, fail = false) {
  const deliveries: { source: string; recipient: string; body: string }[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init),
        url = new URL(req.url);
      assert.equal(url.hostname, "graph.facebook.com");
      const [, , phone, action] = url.pathname.split("/");
      if (!action)
        return Response.json({ id: phone, verified_name: "Test business" });
      assert.equal(action, "messages");
      const data = (await req.json()) as { to: string; text: { body: string } };
      deliveries.push({
        source: phone,
        recipient: data.to,
        body: data.text.body,
      });
      if (fail) throw new Error("Unknown delivery outcome");
      return Response.json({ messages: [{ id: "wamid." + randomUUID() }] });
    },
  );
  return deliveries;
}
async function workspace(phone: string) {
  const uid = id();
  await query("INSERT INTO users(id,name) VALUES($1,'Test business')", [uid]);
  await query(
    "INSERT INTO connections(user_id,kind,secret,label) VALUES($1,'model','test-fixture','Test model')",
    [uid],
  );
  await connectBusiness(uid, phone, "provider-fixture");
  await query(
    "UPDATE connections SET updated_at=now()-interval '1 minute' WHERE user_id=$1 AND kind='whatsapp'",
    [uid],
  );
  return uid;
}
const jobs = (uid: string, kind: string) =>
  query(
    "SELECT * FROM tasks WHERE user_id=$1 AND kind=$2 ORDER BY created_at",
    [uid, kind],
  );

test("Signed-message lifecycle defaults to manual and duplicate automatic requests share one reservation", async (t) => {
  const delivered = transport(t);
  const phone = "1101",
    uid = await workspace(phone);
  await receiveBusinessWebhook(webhook(phone, "m-manual-" + uid));
  assert.equal((await jobs(uid, "whatsapp.auto")).length, 0);
  await setBusinessPolicy(uid, policy);
  const msg = webhook(phone, "m-auto-" + uid, "Hello", 1);
  await Promise.all([receiveBusinessWebhook(msg), receiveBusinessWebhook(msg)]);
  const auto = await jobs(uid, "whatsapp.auto");
  assert.equal(auto.length, 1);
  const generate = async (
    _uid: string,
    history: { role: "user"; content: string }[],
  ) => {
    assert.equal(_uid, uid);
    assert.match(history[0].content, /Hello/);
    return "Hello. How can we help?";
  };
  await generateBusinessReply(auto[0], generate);
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].source, phone);
  assert.equal(delivered[0].recipient, contact);
  assert.match(delivered[0].body, /Automated assistant/);
  await assert.rejects(
    generateBusinessReply(auto[0], generate),
    /already attempted/,
  );
  assert.equal(delivered.length, 1);
});

test("A pause while the model runs blocks the outbound request", async (t) => {
  const delivered = transport(t);
  const phone = "1102",
    uid = await workspace(phone);
  await setBusinessPolicy(uid, policy);
  await receiveBusinessWebhook(webhook(phone, id()));
  const [job] = await jobs(uid, "whatsapp.auto");
  await assert.rejects(
    generateBusinessReply(job, async () => {
      await setBusinessPolicy(uid, { ...policy, paused: true });
      return "This text should remain local.";
    }),
    /superseded/,
  );
  assert.equal(delivered.length, 0);
});

test("Handoff and opt-out persist independently of drafts and cannot be cleared by another tenant", async (t) => {
  transport(t);
  const phone = "1103",
    uid = await workspace(phone),
    other = await workspace("1203");
  await setBusinessPolicy(uid, policy);
  await setHandoff(uid, contact, true);
  await receiveBusinessWebhook(webhook(phone, id()));
  assert.equal((await jobs(uid, "whatsapp.auto")).length, 0);
  await setHandoff(other, contact, false);
  await receiveBusinessWebhook(webhook(phone, id(), "STOP"));
  await receiveBusinessWebhook(webhook(phone, id(), "HUMAN"));
  await assert.rejects(setHandoff(uid, contact, false), /opted out/);
  await assert.rejects(setHandoff(uid, contact, true), /opted out/);
  assert.equal((await jobs(other, "whatsapp.auto")).length, 0);
  const flags = await query(
    "SELECT reason FROM wa_handoffs WHERE user_id=$1 AND phone_id=$2",
    [uid, phone],
  );
  assert.deepEqual(flags, [{ reason: "Opted out" }]);
});

test("Assisted suggestions remain local until the reviewed draft obtains approval", async (t) => {
  const delivered = transport(t);
  const phone = "1104",
    uid = await workspace(phone);
  await setBusinessPolicy(uid, {
    ...policy,
    paused: true,
    mode: "assisted",
    allowlist: [],
  });
  await receiveBusinessWebhook(webhook(phone, id()));
  const [job] = await jobs(uid, "whatsapp.assist");
  await generateBusinessReply(job, async () => "A suggested reply.");
  const [draft] = await jobs(uid, "whatsapp.send");
  assert.equal(draft.state, "WAITING_FOR_APPROVAL");
  assert.equal(delivered.length, 0);
  await assert.rejects(
    deliverBusiness(draft, draft.payload.body),
    /Approval required/,
  );
  await approve(uid, draft.id, String(draft.revision));
  await deliverBusiness(draft, draft.payload.body);
  assert.equal(delivered.length, 1);
});

test("Phone replacement cancels old approvals, enforces fresh consent and ignores pre-transfer updates", async (t) => {
  const delivered = transport(t);
  const uid = await workspace("1105");
  await setBusinessPolicy(uid, { ...policy, mode: "assisted" });
  await receiveBusinessWebhook(webhook("1105", id()));
  const [job] = await jobs(uid, "whatsapp.assist");
  await generateBusinessReply(job, async () => "Draft for the old phone.");
  const [draft] = await jobs(uid, "whatsapp.send");
  await connectBusiness(uid, "1205", "rotated-token");
  await assert.rejects(
    deliverBusiness(draft, draft.payload.body),
    /account has changed/,
  );
  assert.equal((await jobs(uid, "whatsapp.send"))[0].state, "CANCELLED");
  await receiveBusinessWebhook(
    webhook("1205", id(), "A message from a previous owner", 30),
  );
  const rows = await query(
    "SELECT id FROM wa_messages WHERE user_id=$1 AND phone_id='1205'",
    [uid],
  );
  assert.equal(rows.length, 0);
  assert.equal(delivered.length, 0);
  const [u] = await query("SELECT settings FROM users WHERE id=$1", [uid]);
  assert.equal(u.settings.waPolicy, undefined);
  await disconnectBusiness(uid);
  assert.deepEqual(await businessDraftScope(uid), {
    phoneId: null,
    bindingId: null,
  });
});

test("Rolling quota admits one contact and an ambiguous provider attempt cannot repeat", async (t) => {
  const delivered = transport(t, true);
  const phone = "1106",
    uid = await workspace(phone);
  const second = "15557654321";
  await setBusinessPolicy(uid, {
    ...policy,
    allowlist: [contact, second],
    maxPerHour: 1,
  });
  await Promise.all([
    receiveBusinessWebhook(webhook(phone, id(), "Customer one", 1)),
    receiveBusinessWebhook(webhook(phone, id(), "Customer two", 1, second)),
  ]);
  const auto = await jobs(uid, "whatsapp.auto");
  assert.equal(auto.length, 1);
  await assert.rejects(
    generateBusinessReply(auto[0], async () => "A reply."),
    /connection|service/i,
  );
  await assert.rejects(
    generateBusinessReply(auto[0], async () => "A reply."),
    /limit|attempted/,
  );
  assert.equal(delivered.length, 1);
});
