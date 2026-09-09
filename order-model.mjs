export const UNITS = { serving: ['serving', 'servings'], halfTray: ['half tray', 'half trays'], fullTray: ['full tray', 'full trays'] };
export const RICE = { qabuli: 'Qabuli rice (carrots & raisins)', white: 'White rice', none: 'No rice' };
export const MEAT = { lamb: 'Lamb', beef: 'Beef', chicken: 'Chicken', none: 'No meat' };

export function choicesFor(name) {
  const riceDishes = { 'Qabuli Palaw with Lamb': ['qabuli', 'lamb'], 'Chicken Palaw': ['qabuli', 'chicken'], 'Seasoned Rice': ['qabuli', 'none'] };
  if (riceDishes[name]) return { product: 'Rice & Meat', rice: ['qabuli', 'white'], meat: Object.keys(MEAT), defaults: { rice: riceDishes[name][0], meat: riceDishes[name][1] } };
  if (['Lamb Shank Palaw', 'Chicken Kabab', 'Shami Kabab', 'Lamb Kabab', 'Lamb Chops', 'Degi Special Kabab Platter', 'Kids Chicken Kabab Plate'].includes(name)) {
    return { product: name, rice: ['white', 'qabuli', 'none'], meat: [], defaults: { rice: name === 'Lamb Shank Palaw' ? 'qabuli' : 'white', meat: '' } };
  }
  return { product: name, rice: [], meat: [], defaults: { rice: '', meat: '' } };
}

export function normalizeCart(raw, catalog) {
  if (!Array.isArray(raw) || raw.length > 40) throw new Error('Please keep your cart to 40 different items.');
  const merged = new Map();
  for (const item of raw) {
    if (!item || !catalog.some(dish => dish.name === item.name)) throw new Error('A dish in your cart is no longer available. Please choose it again.');
    const options = choicesFor(item.name);
    if (!Object.hasOwn(UNITS, item.unit) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 5000) throw new Error('Choose a whole-number quantity from 1 to 5,000 for every item.');
    if (options.rice.length ? !options.rice.includes(item.rice) : item.rice !== '') throw new Error('Choose a rice option for every rice dish.');
    if (options.meat.length ? !options.meat.includes(item.meat) : item.meat !== '') throw new Error('Choose a meat option for every rice dish.');
    const key = JSON.stringify([options.product, item.rice, item.meat, item.unit]);
    if (merged.has(key)) {
      merged.get(key).quantity += item.quantity;
      if (merged.get(key).quantity > 5000) throw new Error('An item cannot exceed 5,000 units.');
    } else merged.set(key, { name: item.name, rice: item.rice, meat: item.meat, unit: item.unit, quantity: item.quantity });
  }
  return [...merged.values()];
}

export function itemTitle(item) {
  return choicesFor(item.name).product;
}
export function itemOptions(item) {
  return [item.rice ? RICE[item.rice] : '', item.meat ? MEAT[item.meat] : ''].filter(Boolean).join(' / ');
}
export function amountLabel(quantity, unit) {
  return `${quantity} ${UNITS[unit][quantity === 1 ? 0 : 1]}`;
}
export function quantityTotals(cart) {
  return cart.reduce((sum, item) => { sum[item.unit] += item.quantity; return sum; }, { serving: 0, halfTray: 0, fullTray: 0 });
}
export function totalLabel(cart) {
  const totals = quantityTotals(cart);
  return Object.entries(totals).filter(([, n]) => n).map(([unit, n]) => amountLabel(n, unit)).join(' + ') || '0 servings';
}
export function orderLines(cart) {
  return cart.map((item, index) => `${index + 1}. ${itemTitle(item)}\n   ${itemOptions(item) ? itemOptions(item) + '\n   ' : ''}Quantity: ${amountLabel(item.quantity, item.unit)}`).join('\n\n');
}
export function virginiaNow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function validateDetails(raw, now = new Date()) {
  const limits = { name: 120, email: 254, phone: 40, date: 10, time: 5, location: 160, occasion: 100, notes: 2500, requestType: 5 };
  const details = {};
  for (const [key, max] of Object.entries(limits)) {
    if (typeof raw?.[key] !== 'string' || raw[key].length > max) throw new Error('Please check your contact and event details.');
    if (key !== 'notes' && /[\u0000-\u001f\u007f]/.test(raw[key])) throw new Error('Please keep each contact field on one line.');
    details[key] = raw[key].trim();
  }
  if (!details.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) throw new Error('Please enter your name and a valid email.');
  if (details.phone && (!/^[+\d\s().-]+$/.test(details.phone) || details.phone.replace(/\D/g, '').length < 7 || details.phone.replace(/\D/g, '').length > 15)) throw new Error('Please enter a valid phone number or leave it empty.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(details.date) || Number.isNaN(Date.parse(details.date)) || new Date(details.date).toISOString().slice(0, 10) !== details.date) throw new Error('Please choose a valid date.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(details.time)) throw new Error('Please choose a time.');
  if (`${details.date}T${details.time}` <= virginiaNow(now)) throw new Error('Please choose a future date and time in Eastern Time.');
  if (!details.location) throw new Error('Please enter your city or event location.');
  if (!['order', 'event'].includes(details.requestType)) throw new Error('Please select family order or event catering.');
  if (!Number.isInteger(raw.guests) || raw.guests < 1 || raw.guests > 10000) throw new Error('Please enter the number of guests.');
  details.guests = raw.guests;
  return details;
}
export function scheduleLabel(details) {
  const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(details.date + 'T12:00:00Z'));
  const [hour, minute] = details.time.split(':').map(Number);
  return `${date} at ${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'} Eastern Time`;
}
export function requestSummary(cart, details, reference) {
  return [reference ? `REQUEST ${reference}` : 'YOUR REQUEST', '', 'ORDER ITEMS', orderLines(cart), '', `TOTAL QUANTITIES: ${totalLabel(cart)}`, `GUESTS: ${details.guests}`, 'PRICE: Personal quote pending', '', 'DATE & DETAILS', scheduleLabel(details), details.location, `${details.requestType === 'event' ? 'Event catering' : 'Family order'}${details.occasion ? ' / ' + details.occasion : ''}`, '', 'CUSTOMER', details.name, details.email, details.phone || '', ...(details.notes ? ['', 'NOTES & DIETARY NEEDS', details.notes] : []), '', 'Request only. Menu, portions, price, and availability require kitchen confirmation.'].filter((line, i, all) => line !== '' || (i > 0 && all[i - 1] !== '')).join('\n');
}
