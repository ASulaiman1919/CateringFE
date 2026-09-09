const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");
const form = document.querySelector("[data-inquiry-form]");
const tabsNav = document.querySelector("[data-menu-tabs]");
const tabs = Array.from(tabsNav.querySelectorAll("a"));
const panels = Array.from(document.querySelectorAll(".menu-panel"));
const dishButtons = Array.from(document.querySelectorAll("[data-dish]"));
const selectedDishes = new Set();
const orderEmail = "order@degikitchen.com";
const orderPhone = "+15736395967";
let preparedBody = "";
document.documentElement.classList.add("js-ready");

function closeNav(returnFocus = false) {
  nav.classList.remove("is-open");
  navToggle.setAttribute("aria-expanded", "false");
  navToggle.setAttribute("aria-label", "Open navigation");
  document.body.classList.remove("nav-open");
  if (returnFocus) navToggle.focus();
}

navToggle.addEventListener("click", () => {
  const isOpen = navToggle.getAttribute("aria-expanded") !== "true";
  nav.classList.toggle("is-open", isOpen);
  navToggle.setAttribute("aria-expanded", String(isOpen));
  navToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
  document.body.classList.toggle("nav-open", isOpen);
});
nav.addEventListener("click", (event) => {
  if (event.target.closest("a")) closeNav();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeNav(navToggle.getAttribute("aria-expanded") === "true");
  if (event.key === "Tab" && navToggle.getAttribute("aria-expanded") === "true") {
    const firstLink = nav.querySelector("a");
    const lastLink = nav.querySelector("a:last-child");
    if (event.shiftKey && document.activeElement === navToggle) {
      event.preventDefault();
      lastLink.focus();
    } else if (!event.shiftKey && document.activeElement === lastLink) {
      event.preventDefault();
      navToggle.focus();
    } else if (!event.shiftKey && document.activeElement === navToggle) {
      event.preventDefault();
      firstLink.focus();
    } else if (event.shiftKey && document.activeElement === firstLink) {
      event.preventDefault();
      navToggle.focus();
    }
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".site-header")) closeNav();
});
window.matchMedia("(min-width: 900px)").addEventListener("change", (event) => {
  if (event.matches) closeNav();
});

function activateCategory(id, focusTab = false) {
  if (!panels.some((panel) => panel.id === id)) return;
  panels.forEach((panel) => {
    panel.hidden = panel.id !== id;
  });
  tabs.forEach((tab) => {
    const isActive = tab.hash === "#" + id;
    tab.setAttribute("aria-selected", String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
    if (isActive && focusTab) tab.focus();
  });
}

tabsNav.setAttribute("role", "tablist");
tabs.forEach((tab, index) => {
  const id = tab.hash.slice(1);
  tab.id = "tab-" + id;
  tab.setAttribute("role", "tab");
  tab.setAttribute("aria-controls", id);
  const panel = document.getElementById(id);
  panel.setAttribute("role", "tabpanel");
  panel.setAttribute("aria-labelledby", tab.id);
  panel.tabIndex = 0;
  tab.addEventListener("click", (event) => {
    event.preventDefault();
    activateCategory(id);
    history.replaceState(null, "", "#" + id);
  });
  tab.addEventListener("keydown", (event) => {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    activateCategory(tabs[next].hash.slice(1), true);
  });
});
activateCategory(panels.some((panel) => "#" + panel.id === location.hash) ? location.hash.slice(1) : "main-dishes");

// Open a hidden category before the browser follows an incoming menu link.
document.addEventListener("click", (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || tabsNav.contains(link)) return;
  const id = link.hash.slice(1);
  if (panels.some((panel) => panel.id === id)) activateCategory(id);
});
window.addEventListener("hashchange", () => activateCategory(location.hash.slice(1)));

function updateSelection() {
  dishButtons.forEach((button) => {
    const selected = selectedDishes.has(button.dataset.dish);
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute("aria-label", (selected ? "Remove " : "Add ") + button.dataset.dish + (selected ? " from request" : " to request"));
    button.title = selected ? "Remove from request" : "Add to request";
  });
  const count = document.querySelector("[data-selection-count]");
  count.textContent = String(selectedDishes.size);
  count.hidden = selectedDishes.size === 0;
  document.querySelector("[data-selected-dishes]").hidden = selectedDishes.size === 0;
  const list = document.querySelector("[data-selected-list]");
  list.replaceChildren();
  selectedDishes.forEach((dish) => {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = dish;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-button";
    remove.setAttribute("aria-label", "Remove " + dish);
    remove.title = "Remove " + dish;
    const icon = document.createElement("span");
    icon.className = "icon icon-x";
    icon.setAttribute("aria-hidden", "true");
    remove.append(icon);
    remove.addEventListener("click", () => {
      const nextDish = Array.from(selectedDishes).find((name) => name !== dish);
      selectedDishes.delete(dish);
      updateSelection();
      const nextButton = Array.from(list.querySelectorAll("button")).find((button) => button.getAttribute("aria-label") === "Remove " + nextDish);
      (nextButton || document.getElementById("message")).focus();
    });
    item.append(label, remove);
    list.append(item);
  });
  document.querySelector("[data-selection-status]").textContent = selectedDishes.size + (selectedDishes.size === 1 ? " dish" : " dishes") + " selected for your request.";
  refreshPreparedRequest();
}
dishButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const dish = button.dataset.dish;
    if (selectedDishes.has(dish)) selectedDishes.delete(dish);
    else selectedDishes.add(dish);
    updateSelection();
  });
});

document.querySelectorAll("[data-request]").forEach((link) => {
  link.addEventListener("click", () => {
    const type = link.dataset.request;
    const radio = Array.from(form.elements.requestType).find((input) => input.value === type);
    if (radio) radio.checked = true;
    if (link.dataset.occasion) form.elements.event.value = link.dataset.occasion;
    refreshPreparedRequest();
  });
});

const date = form.elements.date;
const today = new Date();
const localDate = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
date.min = localDate;
document.querySelector("[data-year]").textContent = String(today.getFullYear());

function buildRequest() {
  const data = new FormData(form);
  const requestType = data.get("requestType") === "event" ? "Event catering" : "Family order";
  const lines = [
    "Hello Degi Kitchen, I would like to request " + (requestType === "Event catering" ? "event catering." : "a family order."),
    "",
    "Name: " + (data.get("name") || ""),
    "Email: " + (data.get("email") || ""),
    "Phone: " + (data.get("phone") || "Not provided"),
    "Request: " + requestType,
    "Occasion: " + (data.get("event") || "To discuss"),
    "Date: " + (data.get("date") || "To discuss"),
    "Preferred time: " + (data.get("time") || "To discuss"),
    "People: " + (data.get("guests") || "To discuss"),
    "Location: " + (data.get("location") || "To discuss"),
    "",
    "Menu choices: " + (selectedDishes.size ? Array.from(selectedDishes).join(", ") : "I'd appreciate menu suggestions."),
    "",
    "Other details: " + (data.get("message") || "None")
  ];
  return { body: lines.join("\n"), subject: "Degi Kitchen - " + requestType };
}

function refreshPreparedRequest() {
  const request = buildRequest();
  preparedBody = request.body;
  document.querySelector("[data-email-link]").href = "mailto:" + orderEmail + "?subject=" + encodeURIComponent(request.subject) + "&body=" + encodeURIComponent(request.body);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  document.querySelector("[data-sms-link]").href = "sms:" + orderPhone + (isIOS ? "&" : "?") + "body=" + encodeURIComponent(request.body);
  document.querySelector("[data-request-preview]").value = request.body;
  document.querySelector("[data-copy-status]").textContent = "";
}
form.addEventListener("input", refreshPreparedRequest);
form.addEventListener("change", refreshPreparedRequest);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  refreshPreparedRequest();
  document.querySelector("[data-request-ready]").hidden = false;
  document.querySelector("[data-email-link]").click();
});
document.querySelector("[data-copy-request]").addEventListener("click", async () => {
  refreshPreparedRequest();
  const status = document.querySelector("[data-copy-status]");
  try {
    if (!navigator.clipboard) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(preparedBody);
    status.textContent = "Request copied.";
  } catch {
    const preview = document.querySelector("[data-request-preview]");
    preview.hidden = false;
    preview.focus();
    preview.select();
    status.textContent = "Automatic copying isn't available. Your request is selected below.";
  }
});
refreshPreparedRequest();
document.querySelector(".form-submit").disabled = false;
