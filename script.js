import { getPlugins, getSelectedPluginIds, MAX_SELECTED_PLUGINS, saveSelectedPluginIds } from "./plugin-store.js";

const appShell = document.querySelector("#app-shell");
const adminPage = document.querySelector("#admin-page");
const isAdminRoute = window.location.pathname.replace(/\/+$/, "") === "/admin";

if (isAdminRoute) {
  appShell.hidden = true;
  adminPage.hidden = false;
  await import("./admin.js");
} else {
  initializeChat();
}

function initializeChat() {
  const composer = document.querySelector("#composer");
  const messageInput = document.querySelector("#message-input");
  const sendButton = document.querySelector("#send-button");
  const conversation = document.querySelector("#conversation");
  const suggestions = document.querySelector(".prompt-suggestions");
  const sidebar = document.querySelector("#sidebar");
  const menuButton = document.querySelector("#menu-button");
  const toast = document.querySelector("#toast");
  const workspace = document.querySelector("#workspace-scroll");
  const currentSection = document.querySelector("#current-section");
  const quickModeList = document.querySelector("#quick-mode-list");
  const profilePluginCount = document.querySelector("#profile-plugin-count");
  const pluginsDialog = document.querySelector("#plugins-dialog");
  const profilePluginList = document.querySelector("#profile-plugin-list");
  const selectionCount = document.querySelector("#plugin-selection-count");

  let toastTimeout;
  let activePluginId;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => toast.classList.remove("is-visible"), 2800);
  }

  function scrollToLatestMessage() {
    window.requestAnimationFrame(() => {
      conversation.scrollTop = conversation.scrollHeight;
      workspace.scrollTop = workspace.scrollHeight;
    });
  }

  function getCurrentPlugin(plugins, selectedIds) {
    return plugins.find((plugin) => plugin.id === activePluginId && selectedIds.includes(plugin.id)) ??
      plugins.find((plugin) => selectedIds.includes(plugin.id));
  }

  function renderQuickModes() {
    const plugins = getPlugins();
    const selectedIds = getSelectedPluginIds(plugins);
    const selectedPlugins = plugins.filter((plugin) => selectedIds.includes(plugin.id));
    const currentPlugin = getCurrentPlugin(plugins, selectedIds);

    if (currentPlugin) activePluginId = currentPlugin.id;
    messageInput.placeholder = `Message S.C.A.R.L.E.T. in ${currentPlugin?.name ?? "Chat"}...`;
    quickModeList.replaceChildren();
    profilePluginCount.textContent = String(selectedPlugins.length);

    if (selectedPlugins.length === 0) {
      const empty = document.createElement("span");
      empty.className = "quick-modes-empty";
      empty.textContent = "Choose plugins from your profile to add quick modes.";
      quickModeList.append(empty);
      return;
    }

    for (const plugin of selectedPlugins) {
      const button = document.createElement("button");
      button.className = "quick-mode";
      button.type = "button";
      button.textContent = plugin.name;
      button.setAttribute("aria-pressed", String(plugin.id === activePluginId));
      button.addEventListener("click", () => {
        activePluginId = plugin.id;
        renderQuickModes();
        messageInput.placeholder = `Message S.C.A.R.L.E.T. in ${plugin.name}...`;
        messageInput.focus();
      });
      quickModeList.append(button);
    }
  }

  function renderProfilePlugins() {
    const plugins = getPlugins();
    const selectedIds = getSelectedPluginIds(plugins);

    profilePluginList.replaceChildren();
    selectionCount.textContent = `${selectedIds.length} of ${MAX_SELECTED_PLUGINS} selected`;

    for (const plugin of plugins) {
      const label = document.createElement("label");
      label.className = "profile-plugin-option";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = plugin.id;
      checkbox.checked = selectedIds.includes(plugin.id);
      checkbox.addEventListener("change", () => {
        const nextSelection = getSelectedPluginIds(plugins);
        const updatedSelection = checkbox.checked
          ? [...nextSelection, plugin.id]
          : nextSelection.filter((id) => id !== plugin.id);

        if (updatedSelection.length > MAX_SELECTED_PLUGINS) {
          checkbox.checked = false;
          showToast(`Choose up to ${MAX_SELECTED_PLUGINS} plugins.`);
          return;
        }

        try {
          saveSelectedPluginIds(updatedSelection);
          renderProfilePlugins();
          renderQuickModes();
        } catch (error) {
          checkbox.checked = !checkbox.checked;
          showToast(`Could not save your plugin selection: ${error.message}`);
        }
      });

      const name = document.createElement("span");
      name.className = "profile-plugin-name";
      name.textContent = plugin.name;

      label.append(checkbox, name);
      profilePluginList.append(label);
    }
  }

  function addMessage(text, kind) {
    const message = document.createElement("article");
    message.className = `message message-${kind}`;

    const label = document.createElement("span");
    label.className = "message-label";
    label.textContent = kind === "user" ? "You" : `S.C.A.R.L.E.T. · ${activePluginName()}`;
    message.append(label, document.createTextNode(text));
    conversation.append(message);
    return message;
  }

  function activePluginName() {
    const plugin = getPlugins().find((item) => item.id === activePluginId);
    return plugin?.name ?? "Chat";
  }

  function getAssistantReply(message) {
    const normalized = message.toLowerCase();
    const activeMode = activePluginName().toLowerCase();

    if (activeMode === "code") {
      return "Code mode is selected. Describe the code, behavior, or error you want help with. (AI responses will be connected when the assistant backend is ready.)";
    }
    if (activeMode === "finance") {
      return "Finance mode is selected. Tell me what you’d like to organize or understand. (AI responses will be connected when the assistant backend is ready.)";
    }
    if (activeMode === "poet" || activeMode === "artist") {
      return `${activePluginName()} mode is selected. Share a theme, idea, or style and we can shape it together. (AI responses will be connected when the assistant backend is ready.)`;
    }
    if (/\b(plan|planning|next|steps|goal)\b/.test(normalized)) {
      return "Let’s make this feel manageable. What would a good outcome look like, and what’s one small step you could take today?";
    }
    if (/\b(feel|feeling|think|decision|unsure|overwhelm)\b/.test(normalized)) {
      return "We can take this one piece at a time. What feels most important about it to you right now?";
    }
    if (/\b(organize|organise|routine|task|project)\b/.test(normalized)) {
      return "Let’s bring a little order to it. What needs your attention first, and what can wait until later?";
    }
    return "I’m here with you. Tell me a little more about what’s on your mind, and we’ll figure out a useful next step together.";
  }

  function submitMessage(text) {
    const message = text.trim();
    if (!message || sendButton.disabled) return;

    suggestions.hidden = true;
    addMessage(message, "user");
    messageInput.value = "";
    messageInput.style.height = "auto";
    sendButton.disabled = true;
    sendButton.setAttribute("aria-label", "S.C.A.R.L.E.T. is thinking");

    const loader = document.createElement("div");
    loader.className = "message message-assistant loading-message";
    loader.setAttribute("role", "status");
    loader.setAttribute("aria-label", "S.C.A.R.L.E.T. is thinking");

    const label = document.createElement("span");
    label.className = "message-label";
    label.textContent = "Thinking";
    loader.append(label);
    for (let index = 0; index < 3; index += 1) {
      const dot = document.createElement("span");
      dot.className = "loading-dot";
      dot.setAttribute("aria-hidden", "true");
      loader.append(dot);
    }
    conversation.append(loader);
    scrollToLatestMessage();

    window.setTimeout(() => {
      loader.remove();
      addMessage(getAssistantReply(message), "assistant");
      sendButton.disabled = false;
      sendButton.setAttribute("aria-label", "Send message");
      scrollToLatestMessage();
    }, 850);
  }

  function handleStorageChange(event) {
    if (event.key === null || event.key?.startsWith("scarlet.")) {
      try {
        renderQuickModes();
        if (pluginsDialog.open) renderProfilePlugins();
      } catch (error) {
        showToast(`Could not load plugins: ${error.message}`);
      }
    }
  }

  composer.addEventListener("submit", (event) => {
    event.preventDefault();
    submitMessage(messageInput.value);
  });

  messageInput.addEventListener("input", () => {
    messageInput.style.height = "auto";
    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 140)}px`;
  });

  messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      composer.requestSubmit();
    }
  });

  document.querySelectorAll(".suggestion-card").forEach((card) => {
    card.addEventListener("click", () => submitMessage(card.dataset.prompt));
  });

  document.querySelector("#new-chat").addEventListener("click", () => {
    conversation.replaceChildren();
    suggestions.hidden = false;
    messageInput.value = "";
    messageInput.style.height = "auto";
    messageInput.placeholder = `Message S.C.A.R.L.E.T. in ${activePluginName()}...`;
    currentSection.textContent = "Chat";
    document.querySelector("#current-conversation").textContent = "New conversation";
    document.querySelectorAll(".nav-link").forEach((link) => {
      link.classList.toggle("is-active", link.dataset.view === "Chat");
    });
    sidebar.classList.remove("is-open");
    menuButton.setAttribute("aria-expanded", "false");
    workspace.scrollTo({ top: 0, behavior: "smooth" });
  });

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      document.querySelector(".nav-link.is-active")?.classList.remove("is-active");
      link.classList.add("is-active");
      currentSection.textContent = link.dataset.view;
      sidebar.classList.remove("is-open");
      menuButton.setAttribute("aria-expanded", "false");
      if (link.dataset.view !== "Chat") {
        showToast(`${link.dataset.view} is coming soon.`);
      }
    });
  });

  menuButton.addEventListener("click", () => {
    const isOpen = sidebar.classList.toggle("is-open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
  });

  document.querySelector("#attach-button").addEventListener("click", () => {
    document.querySelector("#file-input").click();
  });

  document.querySelector("#file-input").addEventListener("change", (event) => {
    const [file] = event.currentTarget.files;
    if (file) showToast(`${file.name} selected. File uploads aren’t connected in this preview.`);
    event.currentTarget.value = "";
  });

  for (const id of ["memory-button", "tools-button"]) {
    document.querySelector(`#${id}`).addEventListener("click", (event) => {
      const button = event.currentTarget;
      const enabled = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(enabled));
      const feature = id === "memory-button" ? "Memory" : "Tools";
      showToast(`${feature} ${enabled ? "enabled" : "disabled"} for this conversation.`);
    });
  }

  document.querySelector("#profile-button").addEventListener("click", () => {
    try {
      renderProfilePlugins();
      pluginsDialog.showModal();
    } catch (error) {
      showToast(`Could not load plugins: ${error.message}`);
    }
  });

  document.querySelector("#manage-plugins").addEventListener("click", () => {
    document.querySelector("#profile-button").click();
  });

  document.querySelector("#plugins-done").addEventListener("click", () => pluginsDialog.close());

  document.addEventListener("click", (event) => {
    if (window.innerWidth <= 760 && sidebar.classList.contains("is-open")) {
      const target = event.target;
      if (target instanceof Node && !sidebar.contains(target) && !menuButton.contains(target)) {
        sidebar.classList.remove("is-open");
        menuButton.setAttribute("aria-expanded", "false");
      }
    }
  });

  window.addEventListener("storage", handleStorageChange);

  try {
    renderQuickModes();
    messageInput.placeholder = `Message S.C.A.R.L.E.T. in ${activePluginName()}...`;
  } catch (error) {
    showToast(`Could not load plugins: ${error.message}`);
  }
}
