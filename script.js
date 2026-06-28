const header = document.querySelector("[data-header]");
const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");
const form = document.querySelector("[data-inquiry-form]");
const smsLink = document.querySelector("[data-sms-link]");
const formNote = document.querySelector("[data-form-note]");

const phoneNumber = "+15736395967";

function updateHeaderState() {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 18);
}

function closeNav() {
  if (!nav || !navToggle || !header) return;
  nav.classList.remove("is-open");
  header.classList.remove("nav-active");
  navToggle.setAttribute("aria-expanded", "false");
  document.body.classList.remove("nav-open");
}

function toggleNav() {
  if (!nav || !navToggle || !header) return;
  const isOpen = nav.classList.toggle("is-open");
  header.classList.toggle("nav-active", isOpen);
  navToggle.setAttribute("aria-expanded", String(isOpen));
  document.body.classList.toggle("nav-open", isOpen);
}

function buildSmsBody() {
  if (!form) return "Hello Degi Kitchen, I would like to request catering.";

  const data = new FormData(form);
  const lines = [
    "Hello Degi Kitchen, I would like to request catering.",
    "",
    `Name: ${data.get("name") || ""}`,
    `Occasion: ${data.get("event") || ""}`,
    `Date: ${data.get("date") || ""}`,
    `Guests: ${data.get("guests") || ""}`,
    `Dishes or notes: ${data.get("message") || ""}`
  ];

  return lines.join("\n").trim();
}

function updateSmsLink() {
  if (!smsLink) return;
  smsLink.href = `sms:${phoneNumber}?body=${encodeURIComponent(buildSmsBody())}`;
}

window.addEventListener("scroll", updateHeaderState, { passive: true });
updateHeaderState();
updateSmsLink();

if (navToggle) {
  navToggle.addEventListener("click", toggleNav);
}

if (nav) {
  nav.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) closeNav();
  });
}

if (form) {
  form.addEventListener("input", updateSmsLink);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    updateSmsLink();
    if (formNote) {
      formNote.textContent = "Your text message is ready. Use the button above to send it.";
    }
  });
}
