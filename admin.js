import { createPlugin, getPlugins, getSelectedPluginIds, savePlugins, saveSelectedPluginIds } from "./plugin-store.js";

const form = document.querySelector("#plugin-add-form");
const nameInput = document.querySelector("#plugin-name");
const list = document.querySelector("#admin-plugin-list");
const total = document.querySelector("#plugin-total");
const notice = document.querySelector("#admin-notice");

function setNotice(message, isError = false) {
  notice.textContent = message;
  notice.classList.toggle("is-error", isError);
}

function renderPlugins() {
  const plugins = getPlugins();
  const selectedIds = getSelectedPluginIds(plugins);

  list.replaceChildren();
  total.textContent = `${plugins.length} ${plugins.length === 1 ? "plugin" : "plugins"}`;

  if (plugins.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "admin-empty-state";
    emptyState.textContent = "No plugins yet. Add one above to get started.";
    list.append(emptyState);
    return;
  }

  for (const plugin of plugins) {
    const row = document.createElement("div");
    row.className = "admin-plugin-row";

    const name = document.createElement("span");
    name.className = "admin-plugin-name";
    name.textContent = plugin.name;

    const selected = document.createElement("span");
    selected.className = "admin-plugin-status";
    selected.textContent = selectedIds.includes(plugin.id) ? "Selected in profile" : "Available";

    const removeButton = document.createElement("button");
    removeButton.className = "admin-remove-button";
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.setAttribute("aria-label", `Remove ${plugin.name} plugin`);
    removeButton.addEventListener("click", () => {
      try {
        savePlugins(plugins.filter((item) => item.id !== plugin.id));
        saveSelectedPluginIds(selectedIds.filter((id) => id !== plugin.id));
        setNotice(`${plugin.name} was removed from the plugin catalog.`);
        renderPlugins();
      } catch (error) {
        setNotice(error.message, true);
      }
    });

    row.append(name, selected, removeButton);
    list.append(row);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  try {
    const plugin = createPlugin(nameInput.value);
    const plugins = getPlugins();
    if (plugins.some((item) => item.id === plugin.id)) {
      setNotice(`${plugin.name} is already in your plugin catalog.`, true);
      return;
    }

    savePlugins([...plugins, plugin]);
    nameInput.value = "";
    setNotice(`${plugin.name} was added to the plugin catalog.`);
    renderPlugins();
    nameInput.focus();
  } catch (error) {
    setNotice(error.message, true);
  }
});

try {
  renderPlugins();
} catch (error) {
  setNotice(error.message, true);
}
