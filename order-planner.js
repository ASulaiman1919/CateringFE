import catalog from './netlify/data/menu.json';
import { choicesFor, normalizeCart, itemTitle, itemOptions, amountLabel, quantityTotals, totalLabel, orderLines, validateDetails, virginiaNow, scheduleLabel, requestSummary, UNITS, RICE, MEAT } from './order-model.mjs';

const $ = selector => document.querySelector(selector);
const form = $('[data-inquiry-form]');
const status = $('[data-form-status]');
const steps = ['cart', 'details', 'review', 'success'];
let cart = [];
let step = 'cart';
let pending = false;
let reviewed = null;
let requestId = null;
let receipt = null;
let requestTouched = false;
let accountId = null;
const storageKey = 'degi-cart-v2';
try { cart = normalizeCart(JSON.parse(localStorage.getItem(storageKey) || '[]'), catalog); } catch { cart = []; }
form.elements.date.min = virginiaNow().slice(0, 10);

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function iconButton(label, icon, action) {
  const button = element('button', 'icon-button');
  button.type = 'button'; button.title = label; button.setAttribute('aria-label', label);
  const symbol = element('span', 'icon icon-' + icon); symbol.setAttribute('aria-hidden', 'true');
  button.append(symbol); button.addEventListener('click', action); return button;
}
function persistCart() {
  try { localStorage.setItem(storageKey, JSON.stringify(cart)); } catch { /* Cart still works if device storage is unavailable. */ }
}
function invalidate() {
  reviewed = null; requestId = null;
  $('[data-order-fallback]').hidden = true;
  status.textContent = '';
}
function cartChanged() {
  invalidate(); persistCart(); renderCart();
  document.dispatchEvent(new CustomEvent('degi:selection-change', { detail: { items: cart } }));
}
function readDetails() {
  return { name: form.elements.name.value, email: form.elements.email.value, phone: form.elements.phone.value, date: form.elements.date.value, time: form.elements.time.value, guests: Number(form.elements.guests.value), location: form.elements.location.value, occasion: form.elements.event.value, notes: form.elements.message.value, requestType: form.elements.requestType.value };
}
function checkCart() {
  for (const input of document.querySelectorAll('[data-cart-quantity]')) if (!input.reportValidity()) return false;
  if (!cart.length) { status.textContent = 'Add at least one dish to your cart first.'; return false; }
  return true;
}
function setStep(next, focus = true) {
  step = next;
  document.querySelectorAll('[data-order-step]').forEach(section => { section.hidden = section.dataset.orderStep !== next; });
  document.querySelectorAll('[data-step]').forEach(button => {
    if (button.dataset.step === next || next === 'success' && button.dataset.step === 'review') button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
  renderTotals();
  if (focus) {
    const heading = $(`[data-order-step="${next}"] h3`);
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
}
function showCart() {
  if (pending) return;
  setStep('cart'); status.textContent = '';
  location.hash = 'contact';
  $('#contact').scrollIntoView({ behavior: 'smooth' });
}
function goDetails() {
  if (pending || !checkCart()) return;
  setStep('details'); status.textContent = '';
}
function prepareReview() {
  if (pending || !checkCart()) return;
  setStep('details', false);
  if (!form.reportValidity()) return;
  try {
    const details = validateDetails(readDetails());
    const items = normalizeCart(cart, catalog);
    const signature = JSON.stringify({ items, details });
    if (reviewed?.signature !== signature) requestId = crypto.randomUUID();
    reviewed = { items, details, signature };
    renderReview(); setStep('review'); status.textContent = '';
  } catch (error) { status.textContent = error.message; }
}
function renderTotals() {
  const list = $('[data-cart-totals]'); list.replaceChildren();
  const shownItems = step === 'success' && receipt ? receipt.items : cart;
  const totals = quantityTotals(shownItems);
  const rows = [['Different items', shownItems.length], ['Dish servings', totals.serving], ['Half trays', totals.halfTray], ['Full trays', totals.fullTray]];
  const guests = step === 'success' && receipt ? receipt.details.guests : form.elements.guests.value;
  if (guests) rows.push(['Guests', guests]);
  for (const [label, value] of rows) { const row = element('div'); row.append(element('dt', '', label), element('dd', '', String(value))); list.append(row); }
  document.querySelectorAll('[data-cart-count], [data-selection-count]').forEach(count => { count.textContent = String(cart.length); count.hidden = !cart.length; });
  $('[data-selection-status]').textContent = cart.length ? `${cart.length} cart items. ${totalLabel(cart)}.` : 'Your cart is empty.';
  $('[data-next-details]').disabled = !cart.length;
}
function renderCart() {
  const container = $('[data-cart-items]'); container.replaceChildren();
  if (!cart.length) {
    const empty = element('div', 'cart-empty');
    empty.append(element('h4', '', 'Your table starts here.'), element('p', '', 'Choose a dish from the menu.'));
    const link = element('a', 'text-link', 'Browse menu'); link.href = '#menu'; empty.append(link); container.append(empty);
  }
  cart.forEach((item, index) => {
    const row = element('article', 'cart-row');
    const number = element('span', 'cart-row-number', String(index + 1).padStart(2, '0'));
    const copy = element('div', 'cart-row-copy'); copy.append(element('h4', '', itemTitle(item)));
    if (itemOptions(item)) copy.append(element('p', '', itemOptions(item)));
    const controls = element('div', 'cart-row-controls');
    const quantity = element('div', 'quantity-stepper');
    const change = delta => {
      if (pending) return;
      const value = item.quantity + delta;
      if (value < 1 || value > 5000) return;
      cart[index] = { ...item, quantity: value }; cartChanged();
      document.querySelector(`[data-cart-quantity="${index}"]`)?.focus();
    };
    const minus = iconButton('Decrease ' + itemTitle(item) + ' quantity', 'minus', () => change(-1)); minus.disabled = item.quantity === 1;
    const input = element('input'); input.type = 'number'; input.min = '1'; input.max = '5000'; input.step = '1'; input.required = true; input.value = String(item.quantity); input.inputMode = 'numeric'; input.dataset.cartQuantity = String(index); input.setAttribute('aria-label', `Quantity for item ${index + 1}: ${itemTitle(item)}`);
    input.addEventListener('change', () => { if (input.reportValidity()) { cart[index] = { ...item, quantity: Number(input.value) }; cartChanged(); document.querySelector(`[data-cart-quantity="${index}"]`)?.focus(); } });
    quantity.append(minus, input, iconButton('Increase ' + itemTitle(item) + ' quantity', 'plus', () => change(1)));
    const unit = element('span', 'cart-unit', UNITS[item.unit][item.quantity === 1 ? 0 : 1]);
    controls.append(quantity, unit, iconButton('Edit item ' + (index + 1), 'edit', () => configure(item.name, item, index)), iconButton('Remove item ' + (index + 1), 'trash', () => {
      if (pending) return;
      cart.splice(index, 1); cartChanged();
      (container.querySelector('button') || $('[data-order-step="cart"] h3')).focus();
    }));
    row.append(number, copy, controls); container.append(row);
  });
  renderTotals();
}
function renderReview() {
  const container = $('[data-review-content]'); container.replaceChildren();
  const items = element('section', 'review-block');
  const head = element('div', 'planner-heading'); head.append(element('h4', '', 'Order items'), iconButton('Edit cart', 'edit', showCart));
  const lines = element('pre', 'order-text-summary', orderLines(reviewed.items));
  items.append(head, lines, element('p', 'order-total', 'Total quantities: ' + totalLabel(reviewed.items)));
  const details = element('section', 'review-block');
  const detailsHead = element('div', 'planner-heading'); detailsHead.append(element('h4', '', 'Date & contact'), iconButton('Edit date and contact', 'edit', () => setStep('details')));
  details.append(detailsHead);
  const d = reviewed.details;
  for (const line of [scheduleLabel(d), `${d.guests} guests / ${d.location}`, `${d.requestType === 'event' ? 'Event catering' : 'Family order'}${d.occasion ? ' / ' + d.occasion : ''}`, d.name, d.email, d.phone]) if (line) details.append(element('p', '', line));
  container.append(items, details);
  if (d.notes) { const notes = element('section', 'review-block'); notes.append(element('h4', '', 'Notes & dietary needs'), element('p', 'preserve-lines', d.notes)); container.append(notes); }
}

const chooser = document.createElement('dialog');
chooser.className = 'order-dialog dish-dialog'; chooser.setAttribute('aria-labelledby', 'dish-dialog-title');
chooser.innerHTML = `<header class="dialog-header"><div><p class="eyebrow">Make it yours</p><h2 id="dish-dialog-title"></h2></div><button type="button" class="icon-button" data-dish-close aria-label="Close dish options" title="Close"><span class="icon icon-x" aria-hidden="true"></span></button></header><form data-dish-form><div class="dish-options"><fieldset data-rice-options><legend>Rice</legend><div class="choice-grid" data-rice-choices></div></fieldset><fieldset data-meat-options><legend>Meat</legend><div class="choice-grid" data-meat-choices></div></fieldset><div class="dish-amount"><div class="form-field"><label for="dish-unit">Order by</label><select id="dish-unit"><option value="serving">Servings</option><option value="halfTray">Half trays</option><option value="fullTray">Full trays</option></select></div><div class="form-field"><label for="dish-quantity">Quantity</label><input id="dish-quantity" type="number" min="1" max="5000" step="1" inputmode="numeric" required></div></div><p class="form-note">Serving sizes, tray capacity, and price are confirmed with your quote.</p><p role="status" data-dish-error></p></div><footer class="dish-dialog-footer"><strong data-dish-amount></strong><button type="submit" class="button button-green" data-dish-save>Add to cart <span class="icon icon-plus" aria-hidden="true"></span></button></footer></form>`;
document.body.append(chooser);
let configuring;
let editing = -1;
let lastDishOpener;
const choose = selector => chooser.querySelector(selector);
function optionRadios(kind, options, selected, labels) {
  choose(`[data-${kind}-options]`).hidden = !options.length;
  const container = choose(`[data-${kind}-choices]`); container.replaceChildren();
  for (const value of options) {
    const label = element('label', 'dish-choice');
    const radio = element('input'); radio.type = 'radio'; radio.name = kind; radio.value = value; radio.checked = value === selected; radio.required = true;
    label.append(radio, element('span', '', labels[value])); container.append(label);
  }
}
function updateAmount() {
  const quantity = Number(choose('#dish-quantity').value);
  choose('[data-dish-amount]').textContent = Number.isInteger(quantity) && quantity > 0 ? amountLabel(quantity, choose('#dish-unit').value) : 'Choose quantity';
}
function configure(name, proposed = {}, index = -1) {
  if (pending || !catalog.some(dish => dish.name === name)) return;
  const choices = choicesFor(name);
  configuring = name; editing = index; lastDishOpener = document.activeElement;
  choose('#dish-dialog-title').textContent = choices.product;
  optionRadios('rice', choices.rice, choices.rice.includes(proposed.rice) ? proposed.rice : choices.defaults.rice, RICE);
  optionRadios('meat', choices.meat, choices.meat.includes(proposed.meat) ? proposed.meat : choices.defaults.meat, MEAT);
  choose('#dish-quantity').value = Number.isInteger(proposed.quantity) && proposed.quantity > 0 && proposed.quantity <= 5000 ? String(proposed.quantity) : '1';
  choose('#dish-unit').value = Object.hasOwn(UNITS, proposed.unit) ? proposed.unit : 'serving';
  choose('[data-dish-save]').textContent = editing >= 0 ? 'Save changes' : 'Add to cart';
  choose('[data-dish-error]').textContent = ''; updateAmount();
  chooser.showModal();
}
choose('[data-dish-close]').addEventListener('click', () => chooser.close());
chooser.addEventListener('close', () => lastDishOpener?.focus());
choose('#dish-quantity').addEventListener('input', updateAmount);
choose('#dish-unit').addEventListener('change', updateAmount);
choose('[data-dish-form]').addEventListener('submit', event => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const item = { name: configuring, rice: choose('[name="rice"]:checked')?.value || '', meat: choose('[name="meat"]:checked')?.value || '', unit: choose('#dish-unit').value, quantity: Number(choose('#dish-quantity').value) };
  try {
    const next = [...cart]; if (editing >= 0) next[editing] = item; else next.push(item);
    cart = normalizeCart(next, catalog); cartChanged(); chooser.close();
    if (step === 'review' || step === 'success') setStep('cart', false);
    status.textContent = `${amountLabel(item.quantity, item.unit)} of ${itemTitle(item)} ${editing >= 0 ? 'updated' : 'added to your cart'}.`;
  } catch (error) { choose('[data-dish-error]').textContent = error.message; }
});
document.querySelectorAll('[data-dish]').forEach(button => {
  button.removeAttribute('aria-pressed'); button.setAttribute('aria-label', 'Customize ' + button.dataset.dish); button.title = 'Choose options and quantity';
  button.addEventListener('click', () => configure(button.dataset.dish));
});
document.querySelectorAll('[data-cart-open], [data-back-cart]').forEach(button => button.addEventListener('click', showCart));
$('[data-next-details]').addEventListener('click', goDetails);
$('[data-back-details]').addEventListener('click', () => { if (!pending) setStep('details'); });
document.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => {
  if (pending) return;
  if (button.dataset.step === 'cart') showCart();
  if (button.dataset.step === 'details') goDetails();
  if (button.dataset.step === 'review') prepareReview();
}));
form.addEventListener('submit', event => { event.preventDefault(); prepareReview(); });
form.addEventListener('input', () => { invalidate(); renderTotals(); });
form.addEventListener('change', () => { invalidate(); renderTotals(); });
form.elements.requestType.forEach(radio => radio.addEventListener('change', () => { requestTouched = true; }));
document.querySelectorAll('[data-request]').forEach(link => link.addEventListener('click', () => {
  form.elements.requestType.value = link.dataset.request;
  if (link.dataset.occasion) form.elements.event.value = link.dataset.occasion;
  requestTouched = true; invalidate(); if (cart.length) goDetails();
}));
function applyAccount(user) {
  const previousDetails = JSON.stringify(readDetails());
  const changedIdentity = accountId !== (user?.id || null);
  accountId = user?.id || null;
  $('[data-planner-account]').textContent = user ? 'My account' : 'Sign in / Create account';
  if (user) {
    if (!form.elements.name.value) form.elements.name.value = user.name || '';
    if (!form.elements.email.value) form.elements.email.value = user.email || '';
    if (!form.elements.phone.value) form.elements.phone.value = user.userMetadata?.phone || '';
    if (!form.elements.location.value) form.elements.location.value = user.userMetadata?.city || '';
  }
  if (changedIdentity || previousDetails !== JSON.stringify(readDetails())) {
    if (!pending) {
      invalidate();
      if (step === 'review') prepareReview();
      else renderTotals();
    }
  }
}
document.addEventListener('degi:account-change', event => applyAccount(event.detail.user));

$('[data-send-order]').addEventListener('click', async () => {
  if (pending || !reviewed || !requestId) return;
  try { validateDetails(reviewed.details); } catch (error) { setStep('details'); status.textContent = error.message; return; }
  const sending = { ...reviewed, requestId };
  const summary = requestSummary(sending.items, sending.details);
  const subject = 'Degi Kitchen order request';
  $('[data-email-link]').href = `mailto:order@degikitchen.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(summary)}`;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  $('[data-sms-link]').href = `sms:+15736395967${ios ? '&' : '?'}body=${encodeURIComponent(summary)}`;
  pending = true;
  $('[data-send-order]').disabled = true; $('[data-send-order]').textContent = 'Sending...';
  document.querySelectorAll('[data-step]').forEach(button => { button.disabled = true; });
  status.textContent = 'Sending your itemized request...';
  try {
    const response = await fetch('/api/order-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: sending.requestId, items: sending.items, details: sending.details, website: form.elements.website.value, accountExpected: !!window.DegiAccount?.user }), signal: AbortSignal.timeout(22000) });
    const result = await response.json();
    if (!response.ok || !result.received) throw new Error(result.error || 'Delivery could not be confirmed. Please contact the kitchen.');
    receipt = { ...sending, reference: result.reference };
    $('[data-order-reference]').textContent = result.reference;
    $('[data-success-summary]').textContent = requestSummary(sending.items, sending.details, result.reference);
    $('[data-change-sent]').href = `mailto:order@degikitchen.com?subject=${encodeURIComponent('Change request ' + result.reference)}`;
    status.textContent = result.historyWarning ? 'Your request was sent. Account history could not be updated yet; keep your request number.' : 'Your itemized request has been sent to the kitchen.';
    setStep('success');
    reviewed = null; requestId = null; cart = []; persistCart(); renderCart();
    document.dispatchEvent(new CustomEvent('degi:selection-change', { detail: { items: cart } }));
  } catch (error) {
    status.textContent = error.name === 'TimeoutError' ? 'We could not confirm delivery. Keep your cart and contact the kitchen before sending again.' : error.message;
    $('[data-order-fallback]').hidden = false;
  } finally {
    pending = false;
    $('[data-send-order]').disabled = false; $('[data-send-order]').textContent = 'Send request';
    document.querySelectorAll('[data-step]').forEach(button => { button.disabled = false; });
  }
});
$('[data-new-order]').addEventListener('click', () => {
  receipt = null; form.elements.date.value = ''; form.elements.time.value = ''; form.elements.guests.value = ''; form.elements.message.value = ''; invalidate(); showCart();
});
$('[data-download-order]').addEventListener('click', () => {
  if (!receipt) return;
  const url = URL.createObjectURL(new Blob([requestSummary(receipt.items, receipt.details, receipt.reference)], { type: 'text/plain;charset=utf-8' }));
  const link = element('a'); link.href = url; link.download = receipt.reference + '.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.DegiOrder = {
  get items() { return cart.map(item => ({ ...item })); },
  get catalog() { return catalog.map(dish => ({ name: dish.name })); },
  describeProposal(item) {
    return [itemTitle(item), itemOptions(item), item.quantity && Object.hasOwn(UNITS, item.unit) ? amountLabel(item.quantity, item.unit) : ''].filter(Boolean).join(' / ');
  },
  configure,
  showCart,
  applyDraft(draft) {
    if (!form.elements.guests.value && Number.isInteger(draft.guests) && draft.guests > 0 && draft.guests <= 10000) form.elements.guests.value = String(draft.guests);
    if (!form.elements.date.value && /^\d{4}-\d{2}-\d{2}$/.test(draft.date || '') && draft.date >= form.elements.date.min) form.elements.date.value = draft.date;
    if (!form.elements.time.value && /^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time || '')) form.elements.time.value = draft.time;
    if (!form.elements.location.value && typeof draft.city === 'string') form.elements.location.value = draft.city.slice(0, 160);
    if (!requestTouched && ['order', 'event'].includes(draft.requestType)) form.elements.requestType.value = draft.requestType;
    invalidate(); renderTotals(); showCart();
  },
  reorder(items) {
    if (pending || cart.length && !window.confirm('Replace your current cart with this past request?')) return false;
    try { cart = normalizeCart(items, catalog); form.elements.date.value = ''; form.elements.time.value = ''; cartChanged(); showCart(); return true; }
    catch (error) { showCart(); status.textContent = error.message; return false; }
  }
};
renderCart();
