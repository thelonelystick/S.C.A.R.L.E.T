"use strict";
const api = window.companion;
const el = (id) => document.getElementById(id);
const grants = Array.from(document.querySelectorAll("[data-permit]"));
let state;
function listNames(result) {
  el("matches").replaceChildren(
    ...result.names.map((n) => {
      const item = document.createElement("li");
      item.textContent = n;
      return item;
    }),
  );
  el("count").textContent =
    result.total +
    " matches" +
    (result.total > 100 ? " · First 100 shown" : "") +
    (result.truncated ? " · First 5,000 entries searched" : "");
}
function paint(s) {
  const previous = state;
  state = s;
  el("session").textContent = s.active ? "Disconnect" : "Open session";
  el("status").textContent = s.active ? "Local session open" : "Disconnected";
  el("status").className = s.active ? "on" : "";
  for (const input of grants) {
    input.disabled = !s.active;
    input.checked = !!s.grants[input.dataset.permit];
  }
  for (const key of ["folder", "read", "save", "dashboard", "notify"])
    el(key).disabled = !s.grants[key];
  el("search").disabled = el("query").disabled = !s.folder || !s.grants.folder;
  el("folder-label").textContent = s.folder
    ? "Selected folder · " + s.folder
    : "No folder selected.";
  el("note").disabled = !(s.grants.read || s.grants.save);
  if (!s.active || (previous?.grants.read && !s.grants.read)) {
    el("note").value = "";
    el("filename").textContent = "New note";
  }
  if (!s.grants.folder) {
    el("query").value = "";
    el("matches").replaceChildren();
    el("count").textContent = "";
  }
  el("log").replaceChildren(
    ...s.log.map((entry) => {
      const item = document.createElement("li"),
        time = document.createElement("time");
      time.textContent = new Date(entry.at).toLocaleTimeString();
      item.append(time, document.createTextNode(" · " + entry.action));
      return item;
    }),
  );
  if (!s.log.length) {
    const item = document.createElement("li");
    item.textContent = "No actions in this session.";
    el("log").append(item);
  }
}
async function invoke(method, args = [], after) {
  try {
    const response = await api[method](...args);
    paint(response.state);
    if (!response.ok) throw Error(response.error);
    el("feedback").textContent = "";
    el("feedback").className = "";
    if (after && response.result) after(response.result);
  } catch (err) {
    el("feedback").textContent = err.message || "Operation failed.";
    el("feedback").className = "error";
  }
}
el("session").addEventListener("click", () =>
  invoke(state?.active ? "disconnect" : "connect"),
);
for (const input of grants)
  input.addEventListener("change", () =>
    invoke("grant", [input.dataset.permit, input.checked]),
  );
el("folder").addEventListener("click", () => invoke("folder", [], listNames));
el("search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  invoke("search", [el("query").value], listNames);
});
el("read").addEventListener("click", () =>
  invoke("read", [], (r) => {
    el("note").value = r.text;
    el("filename").textContent = r.name;
  }),
);
el("save").addEventListener("click", () =>
  invoke("save", [el("note").value], (r) => {
    el("feedback").textContent = "Saved " + r.name;
  }),
);
el("dashboard").addEventListener("click", () => invoke("dashboard"));
el("notify").addEventListener("click", () => invoke("notify"));
invoke("state");
