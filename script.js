const header = document.querySelector("[data-header]");
const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");
const form = document.querySelector("[data-inquiry-form]");
const emailLink = document.querySelector("[data-email-link]");
const formNote = document.querySelector("[data-form-note]");

const orderEmail = "order@degikitchen.com";

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

function buildEmailBody() {
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

function updateEmailLink() {
  if (!emailLink) return;
  const subject = "Degi Kitchen Catering Request";
  emailLink.href = `mailto:${orderEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(buildEmailBody())}`;
}

window.addEventListener("scroll", updateHeaderState, { passive: true });
updateHeaderState();
updateEmailLink();

if (navToggle) {
  navToggle.addEventListener("click", toggleNav);
}

if (nav) {
  nav.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) closeNav();
  });
}

if (form) {
  form.addEventListener("input", updateEmailLink);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    updateEmailLink();
    if (formNote) {
      formNote.textContent = "Your email is ready. Use the button above to send it.";
    }
  });
}
