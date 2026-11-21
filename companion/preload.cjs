"use strict";
const { contextBridge, ipcRenderer } = require("electron");
const call = (name, ...args) => ipcRenderer.invoke("scarlet:" + name, ...args);
contextBridge.exposeInMainWorld(
  "companion",
  Object.freeze({
    state: () => call("state"),
    connect: () => call("connect"),
    disconnect: () => call("disconnect"),
    grant: (key, on) => call("grant", key, on),
    folder: () => call("folder"),
    search: (query) => call("search", query),
    read: () => call("read"),
    save: (text) => call("save", text),
    dashboard: () => call("dashboard"),
    notify: () => call("notify"),
  }),
);
