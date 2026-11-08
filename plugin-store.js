export const PLUGIN_STORAGE_KEY = "scarlet.plugins.v1";
export const SELECTION_STORAGE_KEY = "scarlet.selected-plugins.v1";
export const MAX_SELECTED_PLUGINS = 5;

export const DEFAULT_PLUGINS = [
  "Chat",
  "Code",
  "Events",
  "Finance",
  "Hobby",
  "Artist",
  "Poet",
  "Girlfriend",
  "Routine",
  "Sports",
  "News",
  "Education",
  "Philosophy",
  "Wellness",
  "Travel",
];

function pluginId(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getPlugins() {
  const saved = localStorage.getItem(PLUGIN_STORAGE_KEY);
  if (saved === null) {
    const defaults = DEFAULT_PLUGINS.map((name) => ({ id: pluginId(name), name }));
    savePlugins(defaults);
    return defaults;
  }

  const parsed = JSON.parse(saved);
  if (!Array.isArray(parsed)) {
    throw new Error("The saved plugin catalog is invalid. Clear this site's local storage and try again.");
  }

  return parsed.filter(
    (plugin) =>
      plugin &&
      typeof plugin.id === "string" &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(plugin.id) &&
      typeof plugin.name === "string" &&
      plugin.name.trim().length > 0,
  );
}

export function savePlugins(plugins) {
  localStorage.setItem(PLUGIN_STORAGE_KEY, JSON.stringify(plugins));
}

export function getSelectedPluginIds(plugins = getPlugins()) {
  const saved = localStorage.getItem(SELECTION_STORAGE_KEY);
  const availableIds = new Set(plugins.map((plugin) => plugin.id));

  if (saved === null) {
    const firstPlugin = plugins[0];
    const defaults = firstPlugin ? [firstPlugin.id] : [];
    saveSelectedPluginIds(defaults);
    return defaults;
  }

  const parsed = JSON.parse(saved);
  if (!Array.isArray(parsed)) {
    throw new Error("The saved plugin selection is invalid. Clear this site's local storage and try again.");
  }

  return [...new Set(parsed.filter((id) => typeof id === "string" && availableIds.has(id)))].slice(
    0,
    MAX_SELECTED_PLUGINS,
  );
}

export function saveSelectedPluginIds(ids) {
  localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify([...new Set(ids)].slice(0, MAX_SELECTED_PLUGINS)));
}

export function createPlugin(name) {
  const normalizedName = name.trim().replace(/\s+/g, " ");
  const id = pluginId(normalizedName);
  if (!id) throw new Error("Enter a plugin name using letters or numbers.");

  return { id, name: normalizedName };
}
