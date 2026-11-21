"use strict";
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  session,
  protocol,
  Notification,
  shell,
  Menu,
} = require("electron");
const fs = require("node:fs");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const {
  LocalSession,
  dashboardURL,
  listFolder,
  readText,
  saveText,
  validateNote,
} = require("./policy.cjs");

const ROOT = "scarlet://local/";
const smoke = process.argv.includes("--scarlet-smoke");
const profile = fs.mkdtempSync(join(tmpdir(), "scarlet-desktop-"));
app.setPath("userData", profile);
app.setPath("sessionData", profile);
app.enableSandbox();
protocol.registerSchemesAsPrivileged([
  {
    scheme: "scarlet",
    privileges: { standard: true, secure: true, supportFetchAPI: false },
  },
]);
const current = new LocalSession();
let win;
let selecting = false;
const dashboard = () =>
  dashboardURL(process.env.SCARLET_DASHBOARD_PORT || "3000");
const markup = new Map([
  ["/", "index.html"],
  ["/style.css", "style.css"],
  ["/ui.js", "ui.js"],
]);
const mime = {
  "index.html": "text/html; charset=utf-8",
  "style.css": "text/css; charset=utf-8",
  "ui.js": "text/javascript; charset=utf-8",
};
const csp =
  "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";

function senderOK(event) {
  const frame = event.senderFrame,
    contents = win?.webContents;
  if (
    !contents ||
    contents.isDestroyed() ||
    event.sender !== contents ||
    frame !== contents.mainFrame ||
    frame.url !== ROOT
  )
    throw Error("Untrusted companion request.");
}
function register(name, action) {
  ipcMain.handle("scarlet:" + name, async (event, ...args) => {
    senderOK(event);
    try {
      return {
        ok: true,
        result: await action(...args),
        state: current.snapshot(),
      };
    } catch (err) {
      current.record("Action declined or failed · " + name);
      // File system errors may contain an absolute path. Return a bounded public message.
      const reason = err.code
        ? "The operating system could not complete this action. Check the selected location and its permissions."
        : err.message;
      return {
        ok: false,
        error: String(reason || "Operation failed.").slice(0, 200),
        state: current.snapshot(),
      };
    }
  });
}
async function choose(kind, action) {
  if (selecting) throw Error("Finish the open selection first.");
  const check = current.checkpoint(kind);
  selecting = true;
  try {
    const r = await action(check);
    current.record(
      r == null ? "Selection cancelled" : "Completed " + kind + " action",
    );
    return r;
  } finally {
    selecting = false;
  }
}
register("state", () => null);
register("connect", () => current.connect());
register("disconnect", () => current.disconnect());
register("grant", (key, flag) => current.set(key, flag));
register("folder", () =>
  choose("folder", async (check) => {
    const picked = await dialog.showOpenDialog(win, {
      title: "Choose a folder for filename search",
      properties: ["openDirectory", "noResolveAliases", "dontAddToRecent"],
    });
    if (picked.canceled) return null;
    check();
    current.folder = await listFolder(picked.filePaths[0], check);
    return current.search("");
  }),
);
register("search", (q) => current.search(q));
register("read", () =>
  choose("read", async (check) => {
    const picked = await dialog.showOpenDialog(win, {
      title: "Read a plain text file",
      properties: ["openFile", "noResolveAliases", "dontAddToRecent"],
      filters: [
        { name: "Plain text", extensions: ["txt", "md", "csv", "log"] },
      ],
    });
    if (picked.canceled) return null;
    check();
    return readText(picked.filePaths[0], check);
  }),
);
register("save", (text) =>
  choose("save", async (check) => {
    validateNote(text);
    const picked = await dialog.showSaveDialog(win, {
      title: "Save a new text file",
      defaultPath: "scarlet-note.txt",
      filters: [{ name: "Plain text", extensions: ["txt"] }],
      properties: ["dontAddToRecent"],
    });
    if (picked.canceled) return null;
    check();
    return saveText(picked.filePath, text, check);
  }),
);
register("dashboard", async () => {
  current.checkpoint("dashboard");
  await shell.openExternal(dashboard());
  current.record("Opened loopback dashboard in browser");
});
register("notify", () => {
  current.checkpoint("notify");
  if (!Notification.isSupported())
    throw Error("Desktop notifications are unavailable on this system.");
  const notification = new Notification({
    title: "S.C.A.R.L.E.T. companion",
    body: "You requested a local desktop notification.",
    silent: true,
  });
  notification.on("failed", () =>
    current.record("Operating system declined the notification"),
  );
  notification.show();
  current.record("Desktop notification requested");
});

app
  .whenReady()
  .then(async () => {
    const ses = session.fromPartition("scarlet-local");
    ses.setPermissionRequestHandler((_contents, _permission, cb) => cb(false));
    ses.setPermissionCheckHandler(() => false);
    ses.on("will-download", (e) => e.preventDefault());
    ses.protocol.handle("scarlet", async (request) => {
      const url = new URL(request.url);
      const asset = markup.get(url.pathname);
      if (
        url.host !== "local" ||
        request.method !== "GET" ||
        url.search ||
        !asset
      )
        return new Response("Unavailable", { status: 404 });
      return new Response(await readFile(join(__dirname, "ui", asset)), {
        headers: {
          "Content-Type": mime[asset],
          "Content-Security-Policy": csp,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    });
    win = new BrowserWindow({
      width: 930,
      height: 770,
      minWidth: 540,
      minHeight: 500,
      show: !smoke,
      title: "S.C.A.R.L.E.T. Companion",
      backgroundColor: "#101015",
      webPreferences: {
        partition: "scarlet-local",
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        webviewTag: false,
        devTools: false,
        preload: join(__dirname, "preload.cjs"),
      },
    });
    Menu.setApplicationMenu(null);
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (e) => e.preventDefault());
    win.webContents.on("will-attach-webview", (e) => e.preventDefault());
    win.on("closed", () => {
      current.disconnect();
      win = null;
      app.quit();
    });
    await win.loadURL(ROOT);
    if (smoke) {
      try {
        const result = await win.webContents.executeJavaScript(`(async () => {
        const state = await window.companion.state();
        if (!state.ok || state.state.active || typeof require !== "undefined") throw Error("Initial isolation failed");
        const denied = await window.companion.search("fixture");
        if (denied.ok) throw Error("Disabled capability allowed");
        document.getElementById("session").click();
        async function until(fn) { for (let i=0;i<50;i++) { if(fn()) return; await new Promise(r=>setTimeout(r,25)); } throw Error("UI transition timed out"); }
        await until(()=>document.getElementById("session").textContent === "Disconnect");
        document.querySelector('[data-permit="read"]').click();
        await until(()=>!document.getElementById("read").disabled);
        document.getElementById("session").click();
        await until(()=>document.getElementById("read").disabled && !document.querySelector('[data-permit="read"]').checked);
        return document.title;
      })()`);
        console.log("Companion smoke passed:", result);
        app.quit();
      } catch (err) {
        console.error("Companion smoke failed:", err.message);
        app.exit(1);
      }
    }
  })
  .catch((err) => {
    console.error("Launch failed:", err.message);
    app.exit(1);
  });
app.on("window-all-closed", () => app.quit());
app.on("quit", () => {
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch {
    /* OS temporary cleanup will reclaim busy files. */
  }
});
