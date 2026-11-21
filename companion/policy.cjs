"use strict";
const fs = require("node:fs/promises");
const { constants } = require("node:fs");
const { basename, dirname, extname, join } = require("node:path");
const { randomUUID } = require("node:crypto");

const grants = Object.freeze(["folder", "read", "save", "dashboard", "notify"]);
const limit = 256 * 1024;
const textTypes = new Set([".txt", ".md", ".csv", ".log"]);
function dashboardURL(port = "3000") {
  if (
    typeof port !== "string" ||
    !/^\d{1,5}$/.test(port) ||
    +port < 1 ||
    +port > 65535
  )
    throw Error("Choose a valid local dashboard port.");
  return "http://127.0.0.1:" + Number(port) + "/dashboard";
}
class LocalSession {
  constructor() {
    this.active = false;
    this.allowed = new Set();
    this.epochs = new Map();
    this.log = [];
    this.folder = null;
  }
  record(action) {
    this.log.unshift({ action, at: new Date().toISOString() });
    this.log.length = Math.min(this.log.length, 40);
  }
  snapshot() {
    return {
      active: this.active,
      grants: Object.fromEntries(grants.map((k) => [k, this.allowed.has(k)])),
      folder: this.folder?.label || "",
      truncated: !!this.folder?.truncated,
      log: this.log.slice(),
    };
  }
  connect() {
    if (!this.active) {
      this.active = true;
      this.record("Local session opened");
    }
  }
  disconnect() {
    this.active = false;
    this.allowed.clear();
    this.folder = null;
    for (const key of grants)
      this.epochs.set(key, (this.epochs.get(key) || 0) + 1);
    this.record("Disconnected · permissions cleared");
  }
  set(key, enabled) {
    if (!this.active || !grants.includes(key) || typeof enabled !== "boolean")
      throw Error("Choose an available session permission.");
    if (this.allowed.has(key) === enabled) return;
    this.epochs.set(key, (this.epochs.get(key) || 0) + 1);
    if (enabled) this.allowed.add(key);
    else this.allowed.delete(key);
    if (key === "folder" && !enabled) this.folder = null;
    this.record((enabled ? "Enabled " : "Disabled ") + key + " permission");
  }
  checkpoint(key) {
    const epoch = this.epochs.get(key);
    const check = () => {
      if (
        !this.active ||
        !this.allowed.has(key) ||
        this.epochs.get(key) !== epoch
      )
        throw Error("Enable this permission in the current session first.");
    };
    check();
    return check;
  }
  search(value) {
    this.checkpoint("folder");
    if (!this.folder) throw Error("Choose a folder first.");
    if (typeof value !== "string" || value.length > 140)
      throw Error("Use up to 140 characters.");
    const q = value.toLocaleLowerCase();
    const found = this.folder.names.filter((n) =>
      n.toLocaleLowerCase().includes(q),
    );
    this.record("Searched selected filenames");
    return {
      names: found.slice(0, 100),
      total: found.length,
      truncated: this.folder.truncated,
    };
  }
}
async function listFolder(path, check) {
  check();
  const info = await fs.lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw Error("Choose a regular folder.");
  const dir = await fs.opendir(path);
  const names = [];
  let scanned = 0,
    truncated = false;
  for await (const entry of dir) {
    check();
    if (++scanned > 5000) {
      truncated = true;
      break;
    }
    if (entry.isFile() && !entry.name.startsWith(".")) names.push(entry.name);
  }
  check();
  return {
    label: basename(path) || "Selected folder",
    names: names.sort((a, b) => a.localeCompare(b)),
    truncated,
  };
}
async function readText(path, check) {
  check();
  if (!textTypes.has(extname(path).toLowerCase()))
    throw Error("Choose a TXT, MD, CSV, or LOG file.");
  const info = await fs.lstat(path);
  if (!info.isFile() || info.isSymbolicLink())
    throw Error("Choose a regular text file.");
  const file = await fs.open(
    path,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW || 0) |
      (constants.O_NONBLOCK || 0),
  );
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.dev !== info.dev ||
      stat.ino !== info.ino ||
      stat.size > limit
    )
      throw Error("Choose a text file up to 256 KiB.");
    // Bound the read even if another process appends after the size check.
    const buffer = Buffer.alloc(limit + 1);
    let offset = 0;
    while (offset < buffer.length) {
      check();
      const { bytesRead } = await file.read(
        buffer,
        offset,
        buffer.length - offset,
        offset,
      );
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > limit) throw Error("The selected file exceeds 256 KiB.");
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(
        buffer.subarray(0, offset),
      );
    } catch {
      throw Error("Choose a UTF-8 text file.");
    }
    if (text.includes("\0")) throw Error("Choose a plain text file.");
    check();
    return { name: basename(path), text };
  } finally {
    await file.close();
  }
}
function validateNote(text) {
  if (
    typeof text !== "string" ||
    Buffer.byteLength(text, "utf8") > limit ||
    text.includes("\0")
  )
    throw Error("Use plain text up to 256 KiB.");
}
async function saveText(path, text, check) {
  check();
  validateNote(text);
  if (extname(path).toLowerCase() !== ".txt")
    throw Error("Choose a new file ending in .txt.");
  const temp = join(dirname(path), ".scarlet-" + randomUUID() + ".tmp");
  const handle = await fs.open(temp, "wx", 0o600);
  try {
    try {
      await handle.writeFile(text, "utf8");
    } finally {
      await handle.close();
    }
    check();
    // Commit the complete file without replacing existing data.
    await fs.link(temp, path);
    return { name: basename(path) };
  } catch (e) {
    if (e.code === "EEXIST")
      throw Error("This file already exists. Choose a new name.");
    throw e;
  } finally {
    await fs.unlink(temp).catch(() => {});
  }
}
module.exports = {
  LocalSession,
  dashboardURL,
  listFolder,
  readText,
  saveText,
  validateNote,
};
