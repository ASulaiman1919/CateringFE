(() => {
  const helper = document.querySelector("[data-order-helper]");
  const panel = helper.querySelector(".chat-panel");
  const opener = helper.querySelector("[data-chat-open]");
  const log = helper.querySelector("[data-chat-messages]");
  const chatForm = helper.querySelector("[data-chat-form]");
  const input = chatForm.querySelector("textarea");
  const status = helper.querySelector("[data-chat-status]");
  const quick = helper.querySelector("[data-chat-quick]");
  const order = window.DegiOrder;
  let history = [];
  let draft = {};
  let controller;
  let generation = 0;
  let busy = false;
  let lastSend = 0;

  function open() {
    closeNav();
    panel.hidden = false;
    opener.hidden = true;
    opener.setAttribute("aria-expanded", "true");
    helper.querySelector("[data-chat-close]").focus();
  }
  function close(focus = true) {
    panel.hidden = true;
    opener.hidden = false;
    opener.setAttribute("aria-expanded", "false");
    if (focus) opener.focus();
  }
  function syncSuggestions() {
    helper.querySelectorAll("[data-chat-dish]").forEach((button) => {
      button.setAttribute('aria-label', 'Customize ' + button.dataset.chatDish + ' from chat');
    });
  }
  function message(role, text, suggestions = [], itemDrafts = []) {
    const item = document.createElement("div");
    item.className = "chat-message chat-message-" + role;
    const label = document.createElement("span");
    label.className = "chat-message-label";
    label.textContent = role === "user" ? "You" : "Degi assistant";
    const p = document.createElement("p");
    p.textContent = text;
    item.append(label, p);
    if (suggestions.length) {
      const list = document.createElement("ul");
      list.className = "chat-suggestions";
      suggestions.filter((name) => order.catalog.some((dish) => dish.name === name)).slice(0, 4).forEach((name) => {
        const li = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.chatDish = name;
        const text = document.createElement("span");
        text.textContent = name;
        const icon = document.createElement("span");
        icon.className = "icon icon-plus";
        icon.setAttribute("aria-hidden", "true");
        button.append(text, icon);
        button.addEventListener("click", () => {
          close(false);
          order.configure(name, itemDrafts.find(item => item.name === name) || {});
        });
        li.append(button);
        list.append(li);
      });
      item.append(list);
    }
    log.append(item);
    syncSuggestions();
    log.scrollTop = log.scrollHeight;
  }
  function setBusy(value) {
    busy = value;
    chatForm.querySelector("button").disabled = value;
    quick.querySelectorAll("button").forEach((button) => { button.disabled = value; });
    status.textContent = value ? "Thinking..." : "";
  }
  function reset() {
    generation += 1;
    controller?.abort();
    history = [];
    draft = {};
    lastSend = 0;
    log.replaceChildren();
    input.value = "";
    quick.hidden = false;
    setBusy(false);
    message("assistant", "Let's plan your order one dish at a time. Would you like to start with rice and meat, kababs, or appetizers?");
  }
  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
    if (text.length > 1000) { status.textContent = "Please keep your message under 1,000 characters."; return; }
    if (Date.now() - lastSend < 2500) { status.textContent = "Please wait a moment before sending another message."; return; }
    if (history.filter((m) => m.role === "user").length >= 20) { status.textContent = "Please review your cart or start a new chat."; return; }
    lastSend = Date.now();
    const currentGeneration = generation;
    history.push({ role: "user", content: text });
    message("user", text);
    input.value = "";
    quick.hidden = true;
    setBusy(true);
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      let recent = history.slice(-13);
      while (recent.reduce((sum, m) => sum + m.content.length, 0) > 9500) recent = recent.slice(1);
      const response = await fetch("/api/order-assistant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: recent, cart: order.items }), signal: controller.signal
      });
      if (currentGeneration !== generation) return;
      if (response.status === 429) throw new Error("The assistant is busy. Please wait a minute, or review your cart below.");
      if (!response.ok) throw new Error("I can't connect right now. Please try again, or use Review cart to continue with the kitchen.");
      const data = await response.json();
      if (typeof data.reply !== "string" || !Array.isArray(data.suggestions)) throw new Error("Please try again or contact the kitchen directly.");
      if (currentGeneration !== generation) return;
      history.push({ role: "assistant", content: data.reply });
      Object.entries(data.draft || {}).forEach(([key, value]) => { if (value !== null) draft[key] = value; });
      message("assistant", data.reply, data.suggestions, data.itemDrafts || []);
    } catch (error) {
      if (currentGeneration === generation) {
        message("assistant", error.name === "AbortError" ? "That took longer than expected. Please try again, or review your cart below." : error.message);
      }
    } finally {
      clearTimeout(timeout);
      if (currentGeneration === generation) setBusy(false);
    }
  }

  opener.addEventListener("click", open);
  helper.querySelector("[data-chat-close]").addEventListener("click", () => close());
  helper.querySelector("[data-chat-reset]").addEventListener("click", () => {
    if (history.length && !window.confirm("Clear this chat? The items in your cart will stay.")) return;
    reset();
    input.focus();
  });
  chatForm.addEventListener("submit", (event) => { event.preventDefault(); send(input.value); });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(input.value); }
  });
  quick.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => send(button.dataset.chatPrompt)));
  document.addEventListener("degi:selection-change", syncSuggestions);
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
  });
  helper.querySelector("[data-chat-review]").addEventListener("click", () => {
    close(false);
    order.applyDraft(draft);
  });
  reset();
  helper.hidden = false;
})();
