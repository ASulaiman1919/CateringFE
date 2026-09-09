const navToggle = document.querySelector('[data-nav-toggle]');
const nav = document.querySelector('[data-nav]');
const tabsNav = document.querySelector('[data-menu-tabs]');
const tabs = Array.from(tabsNav.querySelectorAll('a'));
const panels = Array.from(document.querySelectorAll('.menu-panel'));
document.documentElement.classList.add('js-ready');

function closeNav(returnFocus = false) {
  nav.classList.remove('is-open');
  navToggle.setAttribute('aria-expanded', 'false');
  navToggle.setAttribute('aria-label', 'Open navigation');
  document.body.classList.remove('nav-open');
  if (returnFocus) navToggle.focus();
}
navToggle.addEventListener('click', () => {
  const open = navToggle.getAttribute('aria-expanded') !== 'true';
  nav.classList.toggle('is-open', open);
  navToggle.setAttribute('aria-expanded', String(open));
  navToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  document.body.classList.toggle('nav-open', open);
});
nav.addEventListener('click', event => { if (event.target.closest('a')) closeNav(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeNav(navToggle.getAttribute('aria-expanded') === 'true');
  if (event.key === 'Tab' && navToggle.getAttribute('aria-expanded') === 'true') {
    const first = nav.querySelector('a');
    const last = nav.querySelector('a:last-child');
    if (event.shiftKey && document.activeElement === navToggle) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); navToggle.focus(); }
    else if (!event.shiftKey && document.activeElement === navToggle) { event.preventDefault(); first.focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); navToggle.focus(); }
  }
});
document.addEventListener('click', event => { if (!event.target.closest('.site-header')) closeNav(); });
window.matchMedia('(min-width: 900px)').addEventListener('change', event => { if (event.matches) closeNav(); });

function activateCategory(id, focus = false) {
  if (!panels.some(panel => panel.id === id)) return;
  panels.forEach(panel => { panel.hidden = panel.id !== id; });
  tabs.forEach(tab => {
    const active = tab.hash === '#' + id;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && focus) tab.focus();
  });
}
tabsNav.setAttribute('role', 'tablist');
tabs.forEach((tab, index) => {
  const id = tab.hash.slice(1);
  tab.id = 'tab-' + id;
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-controls', id);
  const panel = document.getElementById(id);
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', tab.id);
  panel.tabIndex = 0;
  tab.addEventListener('click', event => { event.preventDefault(); activateCategory(id); history.replaceState(null, '', '#' + id); });
  tab.addEventListener('keydown', event => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    activateCategory(tabs[next].hash.slice(1), true);
  });
});
activateCategory(panels.some(panel => '#' + panel.id === location.hash) ? location.hash.slice(1) : 'main-dishes');
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (link && !tabsNav.contains(link)) activateCategory(link.hash.slice(1));
});
window.addEventListener('hashchange', () => activateCategory(location.hash.slice(1)));
document.querySelector('[data-year]').textContent = String(new Date().getFullYear());
