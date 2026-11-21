/** Optional acceptance test for an operator-enabled local preview with real integrations. */
import assert from "node:assert/strict";
const base = process.env.PREVIEW_URL || "http://127.0.0.1:4317";
async function main() {
  const guest = await fetch(base + "/api/auth/guest", {
    method: "POST",
    headers: { origin: base, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(guest.status, 200);
  const cookie = guest.headers.get("set-cookie")!.split(";")[0];
  const headers = { cookie, origin: base, "content-type": "application/json" };
  const post = async (path: string, payload: any) => {
    const r = await fetch(base + "/api/" + path, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    assert.ok(r.ok, data.error);
    return data;
  };
  const read = async (path: string) => {
    const r = await fetch(base + "/api/" + path, { headers: { cookie } });
    const d = await r.json();
    assert.ok(r.ok, d.error);
    return d;
  };
  const state = await read("state");
  assert.ok(
    state.connections.some(
      (x: any) => x.kind === "model" && x.label.includes("Ollama"),
    ),
    "Preview requires a verified local Ollama model.",
  );
  const r = await post("command", {
    text: "The project codename is Meridian. Reply with its name only.",
  });
  assert.equal(r.intent, "answer");
  assert.match(r.text, /Meridian/i);
  const follow = await post("command", {
    conversationId: r.conversationId,
    text: "What codename did I just give you?",
  });
  assert.equal(follow.intent, "answer");
  assert.match(follow.text, /Meridian/i);
  console.log("Live multi-turn inference passed.");
  await post("command", {
    text: "Remember that the lighthouse project is named Mariner.",
  });
  const planned = await post("command", {
    text: "Plan and run a report. Search my memory for lighthouse and compose a report with its project name.",
  });
  assert.equal(planned.intent, "plan", planned.text);
  assert.match(planned.text, /memory.search/);
  assert.match(planned.text, /Mariner/i);
  const exported = await fetch(
    base + "/api/report/chat/" + planned.conversationId,
    { headers: { cookie } },
  );
  assert.equal(exported.status, 200);
  assert.match(await exported.text(), /Mariner/i);
  console.log(
    "Live bounded tool planning, evidence retrieval and Markdown export passed.",
  );
  const file = await fetch(base + "/api/files/upload", {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "text/plain",
      "x-file-name": "acceptance-note.txt",
    },
    body: "The calibration value for the telescope is 713 kelvin.",
  });
  assert.equal(file.status, 200);
  const doc = await file.json();
  const result = await post("command", {
    text: "What calibration value appears in this file? Quote the value with its unit.",
    documentId: doc.id,
  });
  assert.equal(result.intent, "document");
  assert.match(result.text, /713/);
  console.log("Live grounded document answer passed.");
  const task = await post("task", {
    kind: "browser",
    title: "Read the example domain",
    url: "https://example.org",
  });
  let out: any;
  for (let i = 0; i < 90; i++) {
    out = await read("tasks/" + task.id);
    if (["COMPLETED", "FAILED"].includes(out.state)) break;
    await new Promise((f) => setTimeout(f, 1000));
  }
  assert.equal(out.state, "COMPLETED", out.error);
  assert.match(out.result.title, /Example Domain/);
  assert.match(out.result.screenshot, /^data:image\/jpeg;base64,/);
  console.log(
    "Live allowlisted HTTPS reader, JPEG capture, queue, and completion passed.",
  );
  assert.ok(
    (await read("state")).notifications.some(
      (n: any) => n.body === "Read the example domain",
    ),
  );
  await post("auth/logout", {});
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
