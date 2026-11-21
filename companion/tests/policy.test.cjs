"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const {
  LocalSession,
  dashboardURL,
  listFolder,
  readText,
  saveText,
} = require("../policy.cjs");

test("Every capability starts disabled and disconnect invalidates pending grants", () => {
  const s = new LocalSession();
  for (const key of ["folder", "read", "save", "dashboard", "notify"])
    assert.throws(() => s.checkpoint(key));
  s.connect();
  s.set("read", true);
  const read = s.checkpoint("read");
  assert.doesNotThrow(read);
  assert.throws(() => s.set("shell", true));
  assert.throws(() => s.checkpoint("save"));
  s.disconnect();
  s.connect();
  s.set("read", true);
  assert.throws(read);
  assert.throws(() => s.checkpoint("folder"));
  assert(s.log.length >= 3);
});
test("Dashboard is always a fixed loopback page", () => {
  assert.equal(dashboardURL("4317"), "http://127.0.0.1:4317/dashboard");
  for (const input of [
    "0",
    "65536",
    "localhost:4567",
    "https://example.org",
    "3000/anything",
    "-4",
  ])
    assert.throws(() => dashboardURL(input));
});
test("Folder, file and save utilities handle only the selected fixture", async (t) => {
  const dir = await fs.mkdtemp(join(tmpdir(), "scarlet-companion-test-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.writeFile(join(dir, "brief.txt"), "Draft one");
  await fs.writeFile(join(dir, ".hidden.txt"), "Invisible");
  await fs.writeFile(join(dir, "binary.txt"), Buffer.from([0xff, 0]));
  await fs.mkdir(join(dir, "subfolder"));
  await fs.writeFile(join(dir, "subfolder", "deep.txt"), "Nested");
  await fs.symlink(join(dir, "brief.txt"), join(dir, "alias.txt"));
  const s = new LocalSession();
  s.connect();
  for (const perm of ["folder", "read", "save"]) s.set(perm, true);
  s.folder = await listFolder(dir, s.checkpoint("folder"));
  assert.deepEqual(s.search("BRIEF").names, ["brief.txt"]);
  assert.deepEqual(s.search("").names.sort(), ["binary.txt", "brief.txt"]);
  assert.deepEqual(
    await readText(join(dir, "brief.txt"), s.checkpoint("read")),
    { name: "brief.txt", text: "Draft one" },
  );
  await assert.rejects(readText(join(dir, "alias.txt"), s.checkpoint("read")));
  await assert.rejects(readText(join(dir, "binary.txt"), s.checkpoint("read")));
  await fs.writeFile(join(dir, "large.txt"), Buffer.alloc(256 * 1024 + 1));
  await assert.rejects(readText(join(dir, "large.txt"), s.checkpoint("read")));
  await saveText(join(dir, "saved.txt"), "New note", s.checkpoint("save"));
  assert.equal(await fs.readFile(join(dir, "saved.txt"), "utf8"), "New note");
  await assert.rejects(
    saveText(join(dir, "saved.txt"), "replacement", s.checkpoint("save")),
  );
  assert.equal(await fs.readFile(join(dir, "saved.txt"), "utf8"), "New note");
  await assert.rejects(
    saveText(join(dir, "invalid.js"), "hello", s.checkpoint("save")),
  );
  const check = s.checkpoint("save");
  s.set("save", false);
  await assert.rejects(saveText(join(dir, "revoked.txt"), "stop", check));
  await assert.rejects(fs.stat(join(dir, "revoked.txt")));
  s.disconnect();
  assert.equal(s.folder, null);
  assert.throws(() => s.search("brief"));
});
