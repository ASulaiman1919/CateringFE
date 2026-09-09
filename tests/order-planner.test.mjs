import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../netlify/data/menu.json' with { type: 'json' };
import { normalizeCart, migrateCart, quantityTotals, totalLabel, orderLines, validateDetails, requestSummary, choicesFor, UNITS } from '../order-model.mjs';
import { createOrderHandler, notificationFields } from '../netlify/functions/order-request.mjs';
import { createAccountHandler } from '../netlify/functions/customer-account.mjs';
import { normalizeAnswer } from '../netlify/functions/order-assistant.mjs';

const now = () => new Date('2026-09-09T16:00:00Z');
const rice = { name: 'Rice & Meat', rice: 'qabuli', meat: 'lamb', quantity: 12, unit: 'serving' };
const details = { name: 'Kitchen test', email: 'test@example.com', phone: '202-555-0144', date: '2026-09-20', time: '17:30', guests: null, address: { street: '123 Test Street', line2: '', city: 'Fairfax', state: 'VA', zip: '22030' }, occasion: '', notes: '', requestType: 'order' };
const customer = { id: 'customer-a', name: details.name, email: details.email, userMetadata: { phone: details.phone } };
const input = { requestId: '11111111-2222-4333-8444-555555555555', items: [rice], details, website: '' };
const request = (data = input, options = {}) => new Request('https://degikitchen.com/api/order-request', { method: 'POST', headers: { origin: 'https://degikitchen.com', 'content-type': 'application/json' }, body: JSON.stringify(data), ...options });
function memoryStore() {
  const records = new Map();
  return { records, get: async key => records.get(key) || null, setJSON: async (key, value, options = {}) => {
    if (options.onlyIfNew && records.has(key)) return { modified: false };
    records.set(key, structuredClone(value)); return { modified: true };
  }, delete: async key => { records.delete(key); }, list: async ({ prefix }) => ({ blobs: [...records.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) }) };
}

test('all approved rice/meat combinations are valid; equivalent dishes merge only by exact options and unit', () => {
  for (const riceType of ['qabuli', 'white']) for (const meat of ['lamb', 'beef', 'chicken', 'none']) assert.equal(normalizeCart([{ ...rice, rice: riceType, meat }], catalog).length, 1);
  const result = normalizeCart([rice, { ...rice, quantity: 4 }, { ...rice, rice: 'white', meat: 'beef', quantity: 2 }, { ...rice, unit: 'halfTray', quantity: 1 }], catalog);
  assert.equal(result.length, 3); assert.equal(result[0].quantity, 16);
  assert.deepEqual(choicesFor('Mantoo').rice, []);
});
test('quantities retain their units without invented tray conversions or guest counts', () => {
  const cart = [rice, { ...rice, quantity: 2, unit: 'halfTray' }, { ...rice, quantity: 1, unit: 'fullTray' }];
  assert.deepEqual(quantityTotals(cart), { serving: 12, halfTray: 2, fullTray: 1 });
  assert.equal(totalLabel(cart), '12 servings + 2 half trays + 1 full tray');
  assert.match(orderLines(cart), /1\. Rice & Meat\n   Qabuli rice \(carrots & raisins\) \/ Lamb\n   Quantity: 12 servings/);
  assert.doesNotMatch(requestSummary(cart, details, 'DK-TEST'), /GUESTS/);
  assert.match(requestSummary(cart, details), /PRICE: Personal quote pending/);
});
test('malformed items, fractional or negative quantities, and unsupported options are rejected', () => {
  for (const change of [{ quantity: 0 }, { quantity: 1.5 }, { quantity: '2' }, { quantity: 5001 }, { name: 'Pizza' }, { meat: 'pork' }, { rice: '' }, { unit: 'kg' }]) assert.throws(() => normalizeCart([{ ...rice, ...change }], catalog));
  assert.throws(() => normalizeCart(Array(41).fill(rice), catalog));
  assert.throws(() => normalizeCart([{ name: 'Mantoo', rice: 'white', meat: '', unit: 'serving', quantity: 4 }], catalog));
});
test('required schedule/contact details are checked in Eastern Time and optional blanks do not create empty email sections', () => {
  assert.equal(validateDetails(details, now()).time, '17:30');
  for (const change of [{ date: '2026-02-30' }, { date: '2026-09-09', time: '11:59' }, { time: '25:00' }, { time: '' }, { guests: 0 }, { address: {} }, { email: 'bad' }, { phone: '' }, { phone: 'da' }, { name: 'Name\r\nBcc: another@example.com' }]) assert.throws(() => validateDetails({ ...details, ...change }, now()));
  const fields = notificationFields({ reference: 'DK-TEST', items: [rice], details });
  assert.match(fields['date-and-event'], /5:30 PM Eastern Time/);
  assert.equal(fields.notes, 'None provided'); assert.equal(fields.email, details.email);
  assert.equal(Object.values(fields).filter(value => value === '').length, 1);
  assert.match(fields.subject, /DK-TEST/);
});
test('submitting creates one notification, saves signed-in history, and repeated requests are idempotent', async () => {
  const storage = memoryStore(); let sent = 0;
  const handler = createOrderHandler({ now, user: async () => customer, store: () => storage, send: async fields => { sent++; assert.match(fields['order-items'], /Quantity: 12 servings/); return new Response('ok'); } });
  const first = await handler(request()); const second = await handler(request());
  assert.equal(first.status, 200); assert.deepEqual(await first.json(), await second.json()); assert.equal(sent, 1);
  assert.equal([...storage.records.keys()].filter(key => key.startsWith('customers/customer-a/orders/')).length, 1);
  assert.equal((await handler(request({ ...input, items: [{ ...rice, quantity: 8 }] }))).status, 409);
});
test('a timeout does not silently retry delivery', async () => {
  const storage = memoryStore(); let sent = 0;
  const handler = createOrderHandler({ now, user: async () => null, store: () => storage, send: async () => { sent++; throw new Error('timeout'); } });
  assert.equal((await handler(request())).status, 503);
  assert.equal((await handler(request())).status, 409); assert.equal(sent, 1);
});
test('simultaneous requests acquire one send lock', async () => {
  const storage = memoryStore(); let sent = 0; let finish;
  const delivery = new Promise(resolve => { finish = resolve; });
  const handler = createOrderHandler({ now, user: async () => null, store: () => storage, send: async () => { sent++; return delivery; } });
  const first = handler(request()); const second = handler(request());
  const loser = await Promise.race([first, second]);
  assert.equal(loser.status, 409); assert.equal(sent, 1);
  finish(new Response('ok'));
  const responses = await Promise.all([first, second]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
});
test('server rejects empty carts, expired sessions, foreign origins, and invalid input before delivery', async () => {
  let sent = 0;
  const handler = createOrderHandler({ now, user: async () => null, store: memoryStore, send: async () => { sent++; return new Response('ok'); } });
  assert.equal((await handler(request({ ...input, items: [] }))).status, 400);
  assert.equal((await handler(request({ ...input, accountExpected: true }))).status, 401);
  assert.equal((await handler(request(input, { headers: { origin: 'https://evil.test', 'content-type': 'application/json' } }))).status, 403);
  assert.equal((await handler(request({ ...input, details: { ...details, time: '' } }))).status, 400);
  assert.equal(sent, 0);
});
test('account history is scoped to the verified user, not a submitted customer ID', async () => {
  const storage = memoryStore();
  storage.records.set('customers/customer-a/orders/DK-A', { reference: 'DK-A', createdAt: '2026-09-09' });
  storage.records.set('customers/customer-b/orders/DK-B', { reference: 'DK-B', createdAt: '2026-09-09' });
  const handler = createAccountHandler({ user: async () => ({ id: 'customer-a' }), store: () => storage });
  const response = await handler(new Request('https://degikitchen.com/api/customer-account?user=customer-b'));
  assert.deepEqual((await response.json()).orders.map(order => order.reference), ['DK-A']);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const anonymous = createAccountHandler({ user: async () => null });
  assert.equal((await anonymous(new Request('https://degikitchen.com/api/customer-account'))).status, 401);
});
test('account deletion requires same origin and deletes only the current account history', async () => {
  const storage = memoryStore(); let deleted;
  storage.records.set('customers/customer-a/orders/DK-A', {}); storage.records.set('customers/customer-b/orders/DK-B', {});
  const handler = createAccountHandler({ user: async () => ({ id: 'customer-a' }), store: () => storage, deleteUser: async id => { deleted = id; } });
  assert.equal((await handler(new Request('https://degikitchen.com/api/customer-account', { method: 'DELETE' }))).status, 403);
  assert.equal((await handler(new Request('https://degikitchen.com/api/customer-account', { method: 'DELETE', headers: { origin: 'https://degikitchen.com' } }))).status, 200);
  assert.equal(deleted, 'customer-a'); assert.equal(storage.records.has('customers/customer-b/orders/DK-B'), true);
});
test('AI item drafts cannot introduce unknown dishes or unsupported units, meat, or times', () => {
  const result = normalizeAnswer({ reply: 'Review these choices.', suggestions: [rice.name], itemDrafts: [{ ...rice, unit: 'kg', meat: 'pork', quantity: -9 }], draft: { time: '28:00' } });
  assert.deepEqual(result.itemDrafts, [{ name: rice.name, rice: 'qabuli', meat: null, unit: null, quantity: null, fillings: [], size: null }]);
  assert.equal(result.draft.time, null);
});
test('explicit AI item drafts take priority over unrelated suggestions and retain different rice variants', () => {
  const result = normalizeAnswer({ reply: 'Review your choices below.', suggestions: ['Chicken Kabab'], itemDrafts: [{ ...rice, quantity: 8 }, { ...rice, rice: 'white', meat: 'beef', quantity: 4 }], draft: {} });
  assert.deepEqual(result.suggestions, [rice.name]);
  assert.equal(result.itemDrafts.length, 2);
  assert.equal(result.itemDrafts[1].meat, 'beef');
  assert.equal(result.itemDrafts[1].quantity, 4);
});

test('all 28 menu items have valid defaults and enforce dish-specific units', () => {
  for (const dish of catalog) {
    const options = choicesFor(dish.name);
    const item = { name: dish.name, ...options.defaults, quantity: 2 };
    assert.equal(normalizeCart([item], catalog)[0].name, dish.name);
    for (const unit of Object.keys(UNITS)) {
      if (options.units.includes(unit)) assert.equal(normalizeCart([{ ...item, unit }], catalog)[0].unit, unit);
      else assert.throws(() => normalizeCart([{ ...item, unit }], catalog), dish.name + ' must reject ' + unit);
    }
  }
  for (const name of ['Chicken Kabab', 'Shami Kabab', 'Lamb Kabab', 'Lamb Chops', 'Chapli Kabab']) assert.deepEqual(choicesFor(name).units, ['serving']);
  assert.deepEqual(choicesFor('Yogurt Sauce').units, ['serving', 'cup']);
  assert.deepEqual(choicesFor('Green Chutney').units, ['serving', 'cup']);
  assert.deepEqual(choicesFor('Chutney Trio').units, ['set']);
});
test('bolani fillings stay separate and canonical mixed fillings merge correctly', () => {
  const base = { name: 'Bolani', ...choicesFor('Bolani').defaults, quantity: 2 };
  const mixed = { ...base, fillings: ['potato', 'chives'] };
  const items = normalizeCart([base, mixed, { ...mixed, fillings: ['chives', 'potato', 'potato'] }], catalog);
  assert.equal(items.length, 2); assert.equal(items[1].quantity, 4);
  assert.match(orderLines(items), /Chives \+ Potatoes \(mixed filling\)/);
  assert.throws(() => normalizeCart([{ ...base, fillings: [] }], catalog));
  assert.throws(() => normalizeCart([{ ...base, fillings: ['unknown'] }], catalog));
  for (let mask = 1; mask < 16; mask++) {
    const fillings = choicesFor('Bolani').fillings.filter((_, i) => mask & (1 << i));
    assert.equal(normalizeCart([{ ...base, fillings }], catalog)[0].fillings.length, fillings.length);
  }
});
test('sweets support quarter pounds, sauces half cups, and platters require a size', () => {
  const baklava = { name: 'Baklava', ...choicesFor('Baklava').defaults, unit: 'pound', quantity: 1.25 };
  assert.equal(normalizeCart([baklava, { ...baklava, quantity: .25 }], catalog)[0].quantity, 1.5);
  assert.throws(() => normalizeCart([{ ...baklava, quantity: 1.2 }], catalog));
  assert.throws(() => normalizeCart([{ ...baklava, unit: 'piece', quantity: 1.5 }], catalog));
  assert.equal(normalizeCart([{ name: 'Yogurt Sauce', ...choicesFor('Yogurt Sauce').defaults, unit: 'cup', quantity: .5 }], catalog)[0].quantity, .5);
  const platter = { name: 'Degi Special Kabab Platter', ...choicesFor('Degi Special Kabab Platter').defaults, quantity: 1 };
  for (const size of ['four', 'eight', 'half', 'full']) assert.equal(normalizeCart([{ ...platter, size }], catalog)[0].size, size);
  assert.throws(() => normalizeCart([{ ...platter, size: '' }], catalog));
  assert.throws(() => normalizeCart([{ ...platter, unit: 'halfTray' }], catalog));
});
test('seasoned rice is a fixed meat-free side and old rice carts retain their choices', () => {
  const side = { name: 'Seasoned Rice', ...choicesFor('Seasoned Rice').defaults, quantity: 4 };
  assert.equal(normalizeCart([side], catalog)[0].rice, 'seasoned');
  assert.throws(() => normalizeCart([{ ...side, rice: 'qabuli' }], catalog));
  assert.throws(() => normalizeCart([{ ...side, meat: 'lamb' }], catalog));
  const old = migrateCart([{ ...rice, name: 'Chicken Palaw', rice: 'white', meat: 'beef' }, { ...rice, name: 'Lamb Shank Palaw', rice: 'white', meat: '' }]);
  assert.equal(old[0].name, 'Rice & Meat'); assert.equal(old[0].meat, 'beef'); assert.equal(old[1].meat, 'lambShank');
  assert.equal(normalizeCart(old, catalog).length, 2);
  const oldSauce = migrateCart([{ name: 'Yogurt Sauce', quantity: 1, unit: 'fullTray' }]);
  assert.equal(oldSauce[0].unit, 'fullTray'); assert.throws(() => normalizeCart(oldSauce, catalog));
});
test('account identity is authoritative and separate from optional delivery recipient', async () => {
  const recipient = { different: true, name: 'Recipient test', phone: '202-555-0155' };
  const normalized = validateDetails({ ...details, name: 'Imposter', email: 'other@example.com', recipient }, now(), customer);
  assert.equal(normalized.name, customer.name); assert.equal(normalized.email, customer.email);
  assert.deepEqual(normalized.recipient, recipient); assert.equal(normalized.guests, null);
  assert.throws(() => validateDetails({ ...details, recipient: { ...recipient, phone: '' } }, now()));
  let sent = 0;
  const handler = createOrderHandler({ now, user: async () => customer, store: memoryStore, send: async () => { sent++; return new Response('ok'); } });
  assert.equal((await handler(request({ ...input, details: { ...details, email: 'other@example.com' } }))).status, 409);
  assert.equal(sent, 0);
});
test('address requires full street, city, supported state and ZIP with manual entry supported', () => {
  for (const change of [{ street: 'Main Street' }, { city: '' }, { state: 'CA' }, { zip: 'xxx' }, { zip: '' }]) assert.throws(() => validateDetails({ ...details, address: { ...details.address, ...change } }, now()));
  for (const state of ['VA', 'MD', 'DC']) assert.equal(validateDetails({ ...details, address: { ...details.address, state, zip: '20001-1234' } }, now()).address.state, state);
});
test('branded email path replaces duplicate basic alerts and stores guest summary', async () => {
  const storage = memoryStore(); let sent = 0;
  const handler = createOrderHandler({ now, user: async () => null, store: () => storage, email: async record => { sent++; assert.equal(record.details.email, details.email); return { ok: true, emailQueued: true }; }, send: async () => { throw new Error('Must not send duplicate basic email'); } });
  const response = await handler(request());
  assert.equal((await response.json()).emailQueued, true);
  assert.equal((await (await handler(request())).json()).received, true); assert.equal(sent, 1);
  const record = [...storage.records.values()][0]; assert.equal(record.items[0].quantity, 12); assert.equal(record.details.address.zip, '22030');
});
