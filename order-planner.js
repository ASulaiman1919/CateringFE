import catalog from './netlify/data/menu.json';
import { choicesFor, normalizeCart, migrateCart, itemTitle, itemOptions, amountLabel, quantityTotals, totalLabel, orderLines, validateDetails, customerContact, virginiaNow, scheduleLabel, addressLabel, requestSummary, validQuantity, UNIT_RULES, UNITS, RICE, MEAT, FILLINGS, PLATTER_SIZES } from './order-model.mjs';
import { downloadOrder } from './order-download.mjs';

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
let account = null;
const storageKey = 'degi-cart-v2';
try { cart = migrateCart(JSON.parse(localStorage.getItem(storageKey) || '[]')).filter(item => catalog.some(dish => dish.name === item.name) && Object.hasOwn(UNITS, item.unit) && Number.isFinite(item.quantity)); } catch { cart = []; }
form.reset();
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
  status.classList.remove('is-success');
}
function cartChanged() {
  invalidate(); persistCart(); renderCart();
  document.dispatchEvent(new CustomEvent('degi:selection-change', { detail: { items: cart } }));
}
function readDetails() {
  const f = form.elements;
  return { ...(account ? customerContact(account) : { name: f.name.value, email: f.email.value, phone: f.phone.value }), date: f.date.value, time: f.time.value, guests: f.guests.value ? Number(f.guests.value) : null, address: { street: f.street.value, line2: f.line2.value, city: f.city.value, state: f.state.value, zip: f.zip.value }, recipient: f.differentRecipient.checked ? { different: true, name: f.recipientName.value, phone: f.recipientPhone.value } : null, occasion: f.event.value, notes: f.message.value, requestType: f.requestType.value };
}
function checkCart() {
  for (const input of document.querySelectorAll('[data-cart-quantity]')) if (!input.reportValidity()) return false;
  if (!cart.length) { status.textContent = 'Add at least one dish to your cart first.'; return false; }
  try { normalizeCart(cart, catalog); } catch (error) { status.textContent = error.message + ' Use the edit button to update it.'; setStep('cart', false); return false; }
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
  if (receipt) clearReceipt();
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
    const details = validateDetails(readDetails(), new Date(), account);
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
  const rows = [['Different items', shownItems.length], ...Object.entries(totals).map(([unit, quantity]) => [UNITS[unit][1], quantity])];
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
    try { normalizeCart([item], catalog); } catch { copy.append(element('p', 'cart-needs-review', 'Options have changed. Please edit this item.')); }
    const controls = element('div', 'cart-row-controls');
    const quantity = element('div', 'quantity-stepper');
    const change = delta => {
      if (pending) return;
      const value = Math.round((item.quantity + delta) * 100) / 100;
      if (!validQuantity(value, item.unit)) return;
      cart[index] = { ...item, quantity: value }; cartChanged();
      document.querySelector(`[data-cart-quantity="${index}"]`)?.focus();
    };
    const increment = UNIT_RULES[item.unit].step;
    const minus = iconButton('Decrease ' + itemTitle(item) + ' quantity', 'minus', () => change(-increment)); minus.disabled = item.quantity <= increment;
    const input = element('input'); input.type = 'number'; input.min = String(increment); input.max = '5000'; input.step = String(increment); input.required = true; input.value = String(item.quantity); input.inputMode = increment < 1 ? 'decimal' : 'numeric'; input.dataset.cartQuantity = String(index); input.setAttribute('aria-label', `Quantity for item ${index + 1}: ${itemTitle(item)}`);
    input.addEventListener('change', () => { if (input.reportValidity()) { cart[index] = { ...item, quantity: Number(input.value) }; cartChanged(); document.querySelector(`[data-cart-quantity="${index}"]`)?.focus(); } });
    quantity.append(minus, input, iconButton('Increase ' + itemTitle(item) + ' quantity', 'plus', () => change(increment)));
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
  for (const line of [scheduleLabel(d), addressLabel(d.address), d.guests ? `${d.guests} guests` : '', d.occasion, 'Ordered by: ' + d.name, d.email, d.phone]) if (line) details.append(element('p', 'preserve-lines', line));
  if (d.recipient) details.append(element('h4', 'recipient-heading', 'Delivery recipient'), element('p', '', d.recipient.name), element('p', '', d.recipient.phone));
  container.append(items, details);
  if (d.notes) { const notes = element('section', 'review-block'); notes.append(element('h4', '', 'Notes & dietary needs'), element('p', 'preserve-lines', d.notes)); container.append(notes); }
}

const chooser = document.createElement('dialog');
chooser.className = 'order-dialog dish-dialog'; chooser.setAttribute('aria-labelledby', 'dish-dialog-title');
chooser.innerHTML = `<header class="dialog-header"><div><p class="eyebrow">Your dish</p><h2 id="dish-dialog-title"></h2></div><button type="button" class="icon-button" data-dish-close aria-label="Close dish options" title="Close"><span class="icon icon-x" aria-hidden="true"></span></button></header><form data-dish-form><div class="dish-options"><p class="dish-description" data-dish-description></p><fieldset data-rice-options><legend>Rice</legend><div class="choice-grid" data-rice-choices></div></fieldset><fieldset data-meat-options><legend>Meat</legend><div class="choice-grid" data-meat-choices></div></fieldset><fieldset data-size-options><legend>Platter size</legend><div class="choice-grid" data-size-choices></div></fieldset><fieldset data-fillings-options><legend>Fillings</legend><div class="choice-grid" data-fillings-choices></div></fieldset><div class="dish-amount"><div class="form-field"><label for="dish-unit">Order by</label><select id="dish-unit"></select><p class="single-unit" data-single-unit hidden></p></div><div class="form-field"><label for="dish-quantity">Quantity</label><input id="dish-quantity" type="number" min="1" max="5000" step="1" inputmode="numeric" required></div></div><p class="form-note" data-dish-note></p><p role="status" data-dish-error></p></div><footer class="dish-dialog-footer"><strong data-dish-amount></strong><button type="submit" class="button button-green" data-dish-save>Add to cart <span class="icon icon-plus" aria-hidden="true"></span></button></footer></form>`;
document.body.append(chooser);
let configuring;
let editing = -1;
let lastDishOpener;
const choose = selector => chooser.querySelector(selector);
function optionRadios(kind, options, selected, labels, multiple = false) {
  choose(`[data-${kind}-options]`).hidden = !options.length;
  const container = choose(`[data-${kind}-choices]`); container.replaceChildren();
  for (const value of options) {
    const label = element('label', 'dish-choice');
    const radio = element('input'); radio.type = multiple ? 'checkbox' : 'radio'; radio.name = kind; radio.value = value; radio.checked = multiple ? selected.includes(value) : value === selected; radio.required = !multiple;
    label.append(radio, element('span', '', labels[value])); container.append(label);
  }
}
function updateAmount() {
  const quantity = Number(choose('#dish-quantity').value);
  choose('[data-dish-amount]').textContent = validQuantity(quantity, choose('#dish-unit').value) ? amountLabel(quantity, choose('#dish-unit').value) : 'Choose quantity';
}
function updateUnit() {
  const unit = choose('#dish-unit').value;
  const input = choose('#dish-quantity');
  input.min = input.step = String(UNIT_RULES[unit].step);
  input.inputMode = UNIT_RULES[unit].step < 1 ? 'decimal' : 'numeric';
  updateAmount();
}
function configure(name, proposed = {}, index = -1) {
  if (pending || !catalog.some(dish => dish.name === name)) return;
  const choices = choicesFor(name);
  configuring = name; editing = index; lastDishOpener = document.activeElement;
  choose('#dish-dialog-title').textContent = choices.product;
  choose('[data-dish-description]').textContent = catalog.find(dish => dish.name === name).description;
  optionRadios('rice', choices.rice, choices.rice.includes(proposed.rice) ? proposed.rice : choices.defaults.rice, RICE);
  optionRadios('meat', choices.meat, choices.meat.includes(proposed.meat) ? proposed.meat : choices.defaults.meat, MEAT);
  optionRadios('size', choices.sizes, choices.sizes.includes(proposed.size) ? proposed.size : choices.defaults.size, PLATTER_SIZES);
  optionRadios('fillings', choices.fillings, proposed.fillings?.length ? proposed.fillings : choices.defaults.fillings, FILLINGS, true);
  const unit = choose('#dish-unit'); unit.replaceChildren();
  for (const value of choices.units) { const option = element('option', '', UNITS[value][1]); option.value = value; unit.append(option); }
  unit.value = choices.units.includes(proposed.unit) ? proposed.unit : choices.defaults.unit;
  unit.hidden = choices.units.length === 1;
  choose('[data-single-unit]').hidden = choices.units.length !== 1;
  choose('[data-single-unit]').textContent = UNITS[unit.value][1];
  choose('#dish-quantity').value = Number.isFinite(proposed.quantity) && proposed.quantity > 0 && proposed.quantity <= 5000 ? String(proposed.quantity) : '1';
  choose('[data-dish-note]').textContent = choices.note;
  choose('[data-dish-save]').textContent = editing >= 0 ? 'Save changes' : 'Add to cart';
  choose('[data-dish-error]').textContent = proposed.unit && !choices.units.includes(proposed.unit) ? 'This dish uses different units now. Please confirm the new amount.' : ''; updateUnit();
  chooser.showModal();
}
choose('[data-dish-close]').addEventListener('click', () => chooser.close());
chooser.addEventListener('close', () => lastDishOpener?.focus());
choose('#dish-quantity').addEventListener('input', updateAmount);
choose('#dish-unit').addEventListener('change', updateUnit);
choose('[data-dish-form]').addEventListener('submit', event => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const choices = choicesFor(configuring);
  const item = { name: configuring, rice: choose('[name="rice"]:checked')?.value || choices.fixed.rice || '', meat: choose('[name="meat"]:checked')?.value || choices.fixed.meat || '', fillings: [...chooser.querySelectorAll('[name="fillings"]:checked')].map(input => input.value), size: choose('[name="size"]:checked')?.value || '', unit: choose('#dish-unit').value, quantity: Number(choose('#dish-quantity').value) };
  try {
    const next = [...cart]; if (editing >= 0) next[editing] = item; else next.push(item);
    normalizeCart([item], catalog);
    const hasLegacyItems = next.some(entry => { try { normalizeCart([entry], catalog); return false; } catch { return true; } });
    if (next.length > 40) throw new Error('Please keep your cart to 40 different items.');
    cart = hasLegacyItems ? next : normalizeCart(next, catalog);
    if (receipt) clearReceipt();
    cartChanged(); chooser.close();
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
  const changedIdentity = account?.id !== user?.id;
  account = user;
  $('[data-planner-account]').textContent = user ? 'My account' : 'Sign in / Create account';
  $('[data-account-contact]').hidden = !user;
  $('[data-guest-contact]').hidden = !!user;
  for (const key of ['name', 'email', 'phone']) {
    form.elements[key].disabled = !!user;
    if (changedIdentity) form.elements[key].value = '';
  }
  if (user) {
    const contact = customerContact(user);
    const copy = $('[data-account-contact-copy]'); copy.replaceChildren();
    for (const value of [contact.name, contact.email, contact.phone || 'Add your phone in your profile before sending.']) copy.append(element('p', '', value));
  }
  if (!pending) {
    invalidate();
    if (step === 'review') setStep('details', false);
    renderTotals();
  }
}
document.addEventListener('degi:account-change', event => applyAccount(event.detail.user));
$('[data-edit-contact]').addEventListener('click', () => window.DegiAccount?.openProfile());
function recipientFields() {
  const different = form.elements.differentRecipient.checked;
  $('[data-recipient-fields]').hidden = !different;
  for (const name of ['recipientName', 'recipientPhone']) { form.elements[name].disabled = !different; form.elements[name].required = different; }
}
form.elements.differentRecipient.addEventListener('change', recipientFields);

const street = form.elements.street;
const addressList = $('#address-options');
let addressTimer, addressController, addresses = [], activeAddress = -1;
function closeAddresses() {
  clearTimeout(addressTimer); addressController?.abort();
  addressController = null;
  addressList.hidden = true; street.setAttribute('aria-expanded', 'false'); street.removeAttribute('aria-activedescendant'); activeAddress = -1;
}
function selectAddress(index) {
  const address = addresses[index]; if (!address) return;
  for (const key of ['street', 'city', 'state', 'zip']) form.elements[key].value = address[key];
  closeAddresses(); invalidate(); $('[data-address-status]').textContent = ''; form.elements.line2.focus();
}
street.addEventListener('input', () => {
  closeAddresses();
  const query = street.value.trim();
  $('[data-address-status]').textContent = '';
  if (query.length < 6) return;
  addressTimer = setTimeout(async () => {
    const controller = new AbortController(); addressController = controller;
    $('[data-address-status]').textContent = 'Looking for addresses...';
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/address-suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }), signal: controller.signal });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (street.value.trim() !== query || controller.signal.aborted) return;
      addresses = Array.isArray(result.addresses) ? result.addresses.slice(0, 6) : [];
      addressList.replaceChildren();
      addresses.forEach((address, index) => {
        const option = element('li', '', address.label); option.id = 'address-option-' + index; option.setAttribute('role', 'option'); option.setAttribute('aria-selected', 'false');
        option.addEventListener('pointerdown', event => event.preventDefault());
        option.addEventListener('click', () => selectAddress(index)); addressList.append(option);
      });
      addressList.hidden = !addresses.length; street.setAttribute('aria-expanded', String(!!addresses.length));
      $('[data-address-attribution]').hidden = !addresses.length;
      $('[data-address-status]').textContent = addresses.length ? '' : 'No full address found. Enter the city, state, and ZIP below.';
    } catch {
      if (street.value.trim() === query && addressController === controller) $('[data-address-status]').textContent = 'Suggestions are unavailable. Enter your full address below.';
    } finally { clearTimeout(timeout); }
  }, 700);
});
street.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeAddresses(); return; }
  if (addressList.hidden) return;
  if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault(); activeAddress = (activeAddress + (event.key === 'ArrowDown' ? 1 : -1) + addresses.length) % addresses.length;
    [...addressList.children].forEach((option, index) => option.setAttribute('aria-selected', String(index === activeAddress)));
    street.setAttribute('aria-activedescendant', 'address-option-' + activeAddress); addressList.children[activeAddress].scrollIntoView({ block: 'nearest' });
  }
  if (event.key === 'Enter' && activeAddress >= 0) { event.preventDefault(); selectAddress(activeAddress); }
});
street.addEventListener('blur', closeAddresses);

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
    $('#success-title').textContent = `Thank you, ${sending.details.name.split(/\s+/)[0]}.`;
    $('[data-receipt-email]').textContent = result.emailQueued ? `A summary is on its way to ${sending.details.email}.` : 'Keep a copy of your summary using the download below.';
    $('[data-change-sent]').href = `mailto:order@degikitchen.com?subject=${encodeURIComponent('Change request ' + result.reference)}`;
    status.textContent = result.historyWarning ? 'Your request was sent. Account history could not be updated yet; keep your request number.' : 'Your itemized request has been sent to the kitchen.';
    status.classList.add('is-success');
    reviewed = null; requestId = null; cart = []; persistCart();
    clearForm(); renderCart(); setStep('success');
    document.dispatchEvent(new CustomEvent('degi:selection-change', { detail: { items: [] } }));
    document.dispatchEvent(new CustomEvent('degi:order-complete'));
  } catch (error) {
    status.textContent = error.name === 'TimeoutError' ? 'We could not confirm delivery. Keep your cart and contact the kitchen before sending again.' : error.message;
    $('[data-order-fallback]').hidden = false;
  } finally {
    pending = false;
    $('[data-send-order]').disabled = false; $('[data-send-order]').textContent = 'Send request';
    document.querySelectorAll('[data-step]').forEach(button => { button.disabled = false; });
  }
});
function clearForm() { form.reset(); requestTouched = false; recipientFields(); closeAddresses(); $('[data-address-status]').textContent = ''; $('[data-address-attribution]').hidden = true; }
function clearReceipt() {
  receipt = null; clearForm(); invalidate(); $('[data-success-summary]').textContent = ''; $('[data-review-content]').replaceChildren(); $('[data-order-reference]').textContent = ''; $('[data-receipt-email]').textContent = ''; $('.success-details').open = false; setStep('cart', false);
}
$('[data-new-order]').addEventListener('click', () => { clearReceipt(); location.hash = 'top'; $('#top').scrollIntoView({ behavior: 'smooth' }); });
window.addEventListener('hashchange', () => { if (receipt && location.hash !== '#contact') clearReceipt(); });
window.addEventListener('pageshow', event => { if (event.persisted && receipt) clearReceipt(); });
window.addEventListener('storage', event => {
  if (event.key !== storageKey || pending) return;
  try { cart = migrateCart(JSON.parse(event.newValue || '[]')).filter(item => catalog.some(dish => dish.name === item.name) && Object.hasOwn(UNITS, item.unit) && Number.isFinite(item.quantity)); } catch { cart = []; }
  if (!cart.length) { clearForm(); document.dispatchEvent(new CustomEvent('degi:order-complete')); }
  invalidate(); renderCart(); if (step === 'review') setStep('cart', false);
});
$('[data-download-order]').addEventListener('click', () => {
  if (!receipt) return;
  downloadOrder(receipt);
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
    if (receipt) clearReceipt();
    if (!form.elements.guests.value && Number.isInteger(draft.guests) && draft.guests > 0 && draft.guests <= 10000) form.elements.guests.value = String(draft.guests);
    if (!form.elements.date.value && /^\d{4}-\d{2}-\d{2}$/.test(draft.date || '') && draft.date >= form.elements.date.min) form.elements.date.value = draft.date;
    if (!form.elements.time.value && /^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time || '')) form.elements.time.value = draft.time;
    if (!form.elements.city.value && typeof draft.city === 'string') form.elements.city.value = draft.city.slice(0, 100);
    if (!requestTouched && ['order', 'event'].includes(draft.requestType)) form.elements.requestType.value = draft.requestType;
    invalidate(); renderTotals(); showCart();
  },
  reorder(items) {
    if (pending || cart.length && !window.confirm('Replace your current cart with this past request?')) return false;
    try { cart = migrateCart(items); clearForm(); cartChanged(); showCart(); return true; }
    catch (error) { showCart(); status.textContent = error.message; return false; }
  }
};
renderCart();
