(() => {
  const helper = document.querySelector("[data-order-helper]");
  const panel = helper.querySelector(".chat-panel");
  const opener = helper.querySelector("[data-chat-open]");
  const log = helper.querySelector("[data-chat-messages]");
  const chatForm = helper.querySelector("[data-chat-form]");
  const input = chatForm.querySelector("textarea");
  const status = helper.querySelector("[data-chat-status]");
  const quick = helper.querySelector("[data-chat-quick]");
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
      const selected = selectedDishes.has(button.dataset.chatDish);
      button.setAttribute("aria-pressed", String(selected));
      button.setAttribute("aria-label", (selected ? "Remove " : "Add ") + button.dataset.chatDish + (selected ? " from inquiry" : " to inquiry"));
    });
  }
  function message(role, text, suggestions = []) {
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
      suggestions.filter((name) => dishButtons.some((button) => button.dataset.dish === name)).slice(0, 4).forEach((name) => {
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
          if (selectedDishes.has(name)) selectedDishes.delete(name);
          else selectedDishes.add(name);
          updateSelection();
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
    message("assistant", "Welcome to Degi Kitchen. What are you planning: a family meal or an event? I can help with menu ideas and your inquiry.");
  }
  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
    if (text.length > 1000) { status.textContent = "Please keep your message under 1,000 characters."; return; }
    if (Date.now() - lastSend < 2500) { status.textContent = "Please wait a moment before sending another message."; return; }
    if (history.filter((m) => m.role === "user").length >= 20) { status.textContent = "Please review your inquiry or start a new chat."; return; }
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
        body: JSON.stringify({ messages: recent }), signal: controller.signal
      });
      if (currentGeneration !== generation) return;
      if (response.status === 429) throw new Error("The assistant is busy. Please wait a minute, or review your inquiry below.");
      if (!response.ok) throw new Error("I can't connect right now. Please try again, or use Review inquiry to continue with the kitchen.");
      const data = await response.json();
      if (typeof data.reply !== "string" || !Array.isArray(data.suggestions)) throw new Error("Please try again or contact the kitchen directly.");
      if (currentGeneration !== generation) return;
      history.push({ role: "assistant", content: data.reply });
      Object.entries(data.draft || {}).forEach(([key, value]) => { if (value !== null) draft[key] = value; });
      message("assistant", data.reply, data.suggestions);
    } catch (error) {
      if (currentGeneration === generation) {
        message("assistant", error.name === "AbortError" ? "That took longer than expected. Please try again, or review your inquiry below." : error.message);
      }
    } finally {
      clearTimeout(timeout);
      if (currentGeneration === generation) setBusy(false);
    }
  }

  opener.addEventListener("click", open);
  helper.querySelector("[data-chat-close]").addEventListener("click", () => close());
  helper.querySelector("[data-chat-reset]").addEventListener("click", () => {
    if (history.length && !window.confirm("Clear this chat? Your selected menu dishes will stay in your inquiry.")) return;
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
    if (!form.elements.guests.value && Number.isInteger(draft.guests) && draft.guests > 0 && draft.guests <= 10000) form.elements.guests.value = String(draft.guests);
    if (!form.elements.date.value && typeof draft.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(draft.date) && draft.date >= form.elements.date.min) form.elements.date.value = draft.date;
    if (!form.elements.location.value && typeof draft.city === "string") form.elements.location.value = draft.city.slice(0, 160);
    if (["order", "event"].includes(draft.requestType) && !form.dataset.requestTouched) form.elements.requestType.value = draft.requestType;
    const chatNotes = history.filter((m) => m.role === "user").map((m) => m.content).join("\n");
    if (chatNotes && !form.elements.message.value) form.elements.message.value = ("Details from my order chat:\n" + chatNotes).slice(0, 2500);
    refreshPreparedRequest();
    close(false);
    location.hash = "contact";
    form.elements.name.focus({ preventScroll: true });
    document.getElementById("contact").scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  });
  form.elements.requestType.forEach((radio) => radio.addEventListener("change", () => { form.dataset.requestTouched = "true"; }));
  document.querySelectorAll("[data-request]").forEach((link) => link.addEventListener("click", () => { form.dataset.requestTouched = "true"; }));
  reset();
  helper.hidden = false;
})();
