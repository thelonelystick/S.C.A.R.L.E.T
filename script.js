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
const currentConversation = document.querySelector("#current-conversation");
const historyList = document.querySelector("#history-list");

let toastTimeout;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2800);
}

function scrollToConversation() {
  conversation.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function addMessage(text, kind) {
  const message = document.createElement("article");
  message.className = `message message-${kind}`;

  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = kind === "user" ? "You" : "S.C.A.R.L.E.T.";
  message.append(label, document.createTextNode(text));
  conversation.append(message);
  return message;
}

function setConversationTitle(title) {
  currentConversation.textContent = title;
  const existing = historyList.querySelector(".history-item.is-current");
  if (existing) existing.classList.remove("is-current");

  const item = document.createElement("button");
  item.className = "history-item is-current";
  item.type = "button";
  item.textContent = title;
  item.addEventListener("click", () => showToast("This conversation is only available in this local preview."));
  historyList.prepend(item);
}

function getAssistantReply(message) {
  const normalized = message.toLowerCase();

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
  setConversationTitle(message.length > 30 ? `${message.slice(0, 27)}…` : message);
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
  scrollToConversation();

  window.setTimeout(() => {
    loader.remove();
    addMessage(getAssistantReply(message), "assistant");
    sendButton.disabled = false;
    sendButton.setAttribute("aria-label", "Send message");
    messageInput.focus();
    scrollToConversation();
  }, 1150);
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
  card.addEventListener("click", () => {
    submitMessage(card.dataset.prompt);
  });
});

document.querySelector("#new-chat").addEventListener("click", () => {
  conversation.replaceChildren();
  suggestions.hidden = false;
  currentConversation.textContent = "New conversation";
  historyList.querySelectorAll(".history-item").forEach((item) => item.classList.remove("is-current"));
  const welcomeItem = historyList.querySelector(".history-item");
  if (welcomeItem) welcomeItem.classList.add("is-current");
  sidebar.classList.remove("is-open");
  menuButton.setAttribute("aria-expanded", "false");
  messageInput.focus();
});

document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelector(".nav-link.is-active")?.classList.remove("is-active");
    link.classList.add("is-active");
    currentSection.textContent = link.dataset.view;
    sidebar.classList.remove("is-open");
    menuButton.setAttribute("aria-expanded", "false");
    if (link.dataset.view !== "Chat") {
      showToast(`${link.dataset.view} is coming soon. Your workspace is saved locally.`);
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
  showToast("Your personal workspace is stored on this device.");
});

document.querySelector("#scroll-cue").addEventListener("click", () => {
  document.querySelector("#next-section").scrollIntoView({ behavior: "smooth" });
});

document.querySelector("#return-button").addEventListener("click", () => {
  workspace.scrollTo({ top: 0, behavior: "smooth" });
  messageInput.focus({ preventScroll: true });
});

document.addEventListener("click", (event) => {
  if (window.innerWidth <= 760 && sidebar.classList.contains("is-open")) {
    const target = event.target;
    if (target instanceof Node && !sidebar.contains(target) && !menuButton.contains(target)) {
      sidebar.classList.remove("is-open");
      menuButton.setAttribute("aria-expanded", "false");
    }
  }
});
