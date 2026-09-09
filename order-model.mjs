export const UNITS = { serving: ['serving', 'servings'], halfTray: ['half tray', 'half trays'], fullTray: ['full tray', 'full trays'], piece: ['piece', 'pieces'], pound: ['lb', 'lbs'], cup: ['cup', 'cups'], set: ['set', 'sets'], platter: ['platter', 'platters'] };
export const UNIT_RULES = { serving: { step: 1 }, halfTray: { step: 1 }, fullTray: { step: 1 }, piece: { step: 1 }, pound: { step: 0.25 }, cup: { step: 0.5 }, set: { step: 1 }, platter: { step: 1 } };
export const RICE = { qabuli: 'Qabuli rice (carrots & raisins)', white: 'White rice', seasoned: 'Seasoned basmati rice', none: 'No rice' };
export const MEAT = { lamb: 'Lamb', lambShank: 'Lamb shank', beef: 'Beef', chicken: 'Chicken', none: 'No meat' };
export const FILLINGS = { chives: 'Chives', potato: 'Potatoes', tomatoOnion: 'Tomatoes & onions', spinach: 'Spinach' };
export const PLATTER_SIZES = { four: 'For 4', eight: 'For 8', half: 'Half platter', full: 'Full platter' };
const cateringUnits = ['serving', 'halfTray', 'fullTray'];

export function choicesFor(name) {
  const result = { product: name, units: [...cateringUnits], rice: [], meat: [], fillings: [], sizes: [], fixed: {}, defaults: { rice: '', meat: '', fillings: [], size: '', unit: 'serving' }, note: 'Price and portion sizes are confirmed with your personal quote.' };
  const fixedRice = { 'Seasoned Rice': ['seasoned', 'none'] };
  if (fixedRice[name]) result.fixed = { rice: fixedRice[name][0], meat: fixedRice[name][1] };
  if (name === 'Rice & Meat') { result.rice = ['qabuli', 'white']; result.meat = Object.keys(MEAT); result.defaults.rice = 'qabuli'; result.defaults.meat = 'lamb'; }
  if (['Chicken Kabab', 'Shami Kabab', 'Lamb Kabab', 'Lamb Chops', 'Kids Chicken Kabab Plate'].includes(name)) {
    result.units = ['serving']; result.rice = ['white', 'qabuli', 'none']; result.defaults.rice = 'white';
  }
  if (['Chapli Kabab', 'Kids Rice & Kofta', 'Firnee'].includes(name)) result.units = ['serving'];
  if (name === 'Degi Special Kabab Platter') {
    result.units = ['platter']; result.sizes = Object.keys(PLATTER_SIZES); result.defaults.size = 'four'; result.rice = ['white', 'qabuli', 'none']; result.defaults.rice = 'white';
  }
  if (['Afghan Naan', 'Bolani', 'Sambosa'].includes(name)) result.units = ['piece'];
  if (name === 'Afghan Naan') result.note = 'One piece is one whole naan.';
  if (name === 'Bolani') { result.fillings = Object.keys(FILLINGS); result.defaults.fillings = ['potato']; result.note = 'One piece is one whole bolani. Multiple fillings are mixed within each bolani.'; }
  if (name === 'Baklava') result.units = ['piece', 'pound'];
  if (name === 'Jalebi') result.units = ['pound', 'serving'];
  if (['Green Chutney', 'Yogurt Sauce'].includes(name)) { result.units = ['serving', 'cup']; result.note = 'Cups are measured volume (1 US cup = 8 fl oz), not a container size.'; }
  if (name === 'Chutney Trio') { result.units = ['set']; result.note = 'Each set includes green chutney, yogurt sauce, and red chili chutney. Portions are confirmed with your quote.'; }
  Object.assign(result.defaults, result.fixed);
  result.defaults.unit = result.units[0];
  return result;
}

export function validQuantity(quantity, unit) {
  const step = UNIT_RULES[unit]?.step;
  return !!step && typeof quantity === 'number' && Number.isFinite(quantity) && quantity >= step && quantity <= 5000 && Math.abs(quantity / step - Math.round(quantity / step)) < 1e-8;
}

export function normalizeCart(raw, catalog) {
  if (!Array.isArray(raw) || raw.length > 40) throw new Error('Please keep your cart to 40 different items.');
  const merged = new Map();
  for (const item of raw) {
    if (!item || !catalog.some(dish => dish.name === item.name)) throw new Error('A dish in your cart has changed. Please choose it again.');
    const options = choicesFor(item.name);
    if (!options.units.includes(item.unit) || !validQuantity(item.quantity, item.unit)) throw new Error(`Please review the quantity and unit for ${item.name}.`);
    const choices = {};
    for (const key of ['rice', 'meat']) {
      const value = item[key] || '';
      if (options[key].length ? !options[key].includes(value) : value !== (options.fixed[key] || '')) throw new Error(`Please review the ${key} choice for ${item.name}.`);
      choices[key] = value;
    }
    const fillings = item.fillings || [];
    if (!Array.isArray(fillings) || fillings.some(value => !options.fillings.includes(value)) || options.fillings.length && !fillings.length) throw new Error('Choose the filling for every bolani.');
    choices.fillings = options.fillings.filter(value => fillings.includes(value));
    choices.size = item.size || '';
    if (options.sizes.length ? !options.sizes.includes(choices.size) : !!choices.size) throw new Error('Choose a size for every platter.');
    const normalized = { name: item.name, ...choices, unit: item.unit, quantity: item.quantity };
    const key = JSON.stringify([item.name, choices, item.unit]);
    if (merged.has(key)) {
      merged.get(key).quantity = Math.round((merged.get(key).quantity + item.quantity) * 100) / 100;
      if (merged.get(key).quantity > 5000) throw new Error('An item cannot exceed 5,000 units.');
    } else merged.set(key, normalized);
  }
  return [...merged.values()];
}

// Preserve old rice choices without relabeling a beef request as lamb.
export function migrateCart(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 40).filter(item => item && typeof item.name === 'string').map(item => {
    const result = { ...item, fillings: item.fillings || [], size: item.size || '' };
    if (['Qabuli Palaw with Lamb', 'Chicken Palaw', 'Lamb Shank Palaw', 'Custom Rice & Meat'].includes(item.name) || item.name === 'Seasoned Rice' && item.rice !== 'seasoned') {
      result.name = 'Rice & Meat';
      result.rice = item.rice || 'qabuli';
      result.meat = item.name === 'Lamb Shank Palaw' ? 'lambShank' : item.meat || (item.name === 'Chicken Palaw' ? 'chicken' : item.name === 'Seasoned Rice' ? 'none' : 'lamb');
    }
    return result;
  });
}
export function itemTitle(item) {
  const migrated = migrateCart([item])[0];
  return migrated?.name || item.name;
}
export function itemOptions(item) {
  return [item.rice ? RICE[item.rice] : '', item.meat ? MEAT[item.meat] : '', item.fillings?.length ? item.fillings.map(value => FILLINGS[value]).join(' + ') + (item.fillings.length > 1 ? ' (mixed filling)' : '') : '', item.size ? PLATTER_SIZES[item.size] : ''].filter(Boolean).join(' / ');
}
export function amountLabel(quantity, unit) { return `${quantity} ${(UNITS[unit] || ['', ''])[quantity === 1 ? 0 : 1]}`; }
export function quantityTotals(cart) { return cart.reduce((sum, item) => { sum[item.unit] = Math.round(((sum[item.unit] || 0) + item.quantity) * 100) / 100; return sum; }, {}); }
export function totalLabel(cart) { return Object.entries(quantityTotals(cart)).filter(([, n]) => n).map(([unit, n]) => amountLabel(n, unit)).join(' + ') || '0 items'; }
export function orderLines(cart) { return cart.map((item, index) => `${index + 1}. ${itemTitle(item)}\n   ${itemOptions(item) ? itemOptions(item) + '\n   ' : ''}Quantity: ${amountLabel(item.quantity, item.unit)}`).join('\n\n'); }
export function virginiaNow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function cleanText(value, max, label, required = false, multiline = false) {
  if (typeof value !== 'string' || value.length > max || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value)) throw new Error(`Please check ${label}.`);
  const text = value.trim();
  if (required && !text) throw new Error(`Please enter ${label}.`);
  return text;
}
export function validateContact(raw) {
  const name = cleanText(raw?.name, 120, 'your name', true);
  const email = cleanText(raw?.email, 254, 'your email', true);
  const phone = cleanText(raw?.phone || '', 40, 'your phone number', true);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Please enter a valid email.');
  if (!/^[+\d\s().-]+$/.test(phone) || phone.replace(/\D/g, '').length < 7 || phone.replace(/\D/g, '').length > 15) throw new Error('Please enter a valid phone number.');
  return { name, email, phone };
}
export function customerContact(user) { return { name: user?.name || user?.userMetadata?.full_name || '', email: user?.email || '', phone: user?.userMetadata?.phone || '' }; }
export function addressLabel(address) { return [address.street, address.line2, `${address.city}, ${address.state} ${address.zip}`].filter(Boolean).join('\n'); }
export function validateDetails(raw, now = new Date(), customer = null) {
  const contact = validateContact(customer ? customerContact(customer) : raw);
  const details = { ...contact };
  for (const [key, max] of Object.entries({ date: 10, time: 5, occasion: 100, notes: 2500, requestType: 5 })) details[key] = cleanText(raw?.[key] || '', max, key, ['date', 'time', 'requestType'].includes(key), key === 'notes');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(details.date) || Number.isNaN(Date.parse(details.date)) || new Date(details.date).toISOString().slice(0, 10) !== details.date) throw new Error('Please choose a valid date.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(details.time)) throw new Error('Please choose a time.');
  if (`${details.date}T${details.time}` <= virginiaNow(now)) throw new Error('Please choose a future date and time in Eastern Time.');
  if (!['order', 'event'].includes(details.requestType)) throw new Error('Please select family order or event catering.');
  details.guests = raw.guests === '' || raw.guests === null || raw.guests === undefined ? null : raw.guests;
  if (details.guests !== null && (!Number.isInteger(details.guests) || details.guests < 1 || details.guests > 10000)) throw new Error('Check the optional guest count or leave it empty.');
  details.address = {};
  for (const [key, max] of Object.entries({ street: 180, line2: 100, city: 100, state: 2, zip: 10 })) details.address[key] = cleanText(raw.address?.[key] || '', max, 'the delivery ' + key, key !== 'line2');
  details.address.state = details.address.state.toUpperCase();
  if (!['VA', 'DC', 'MD'].includes(details.address.state)) throw new Error('Please enter a delivery address in Virginia, Washington DC, or Maryland.');
  if (!/^\d{5}(?:-\d{4})?$/.test(details.address.zip) || !/\d/.test(details.address.street)) throw new Error('Please include the street number and a valid ZIP code.');
  details.location = addressLabel(details.address);
  details.recipient = null;
  if (raw.recipient?.different === true) {
    const recipient = validateContact({ name: raw.recipient.name, email: contact.email, phone: raw.recipient.phone });
    details.recipient = { different: true, name: recipient.name, phone: recipient.phone };
  }
  return details;
}
export function scheduleLabel(details) {
  const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(details.date + 'T12:00:00Z'));
  const [hour, minute] = details.time.split(':').map(Number);
  return `${date} at ${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'} Eastern Time`;
}
export function requestSummary(cart, details, reference) {
  return [reference ? `REQUEST ${reference}` : 'YOUR REQUEST', '', 'ORDER ITEMS', orderLines(cart), '', `TOTAL QUANTITIES: ${totalLabel(cart)}`, 'PRICE: Personal quote pending', '', 'REQUESTED DATE & TIME', scheduleLabel(details), '', 'DELIVERY ADDRESS', details.address ? addressLabel(details.address) : details.location, '', 'ORDERED BY', details.name, details.email, details.phone || '', ...(details.recipient ? ['', 'DELIVERY RECIPIENT', details.recipient.name, details.recipient.phone] : []), ...(details.guests ? ['', `GUESTS (OPTIONAL): ${details.guests}`] : []), ...(details.occasion ? ['', 'OCCASION: ' + details.occasion] : []), ...(details.notes ? ['', 'NOTES & DIETARY NEEDS', details.notes] : []), '', 'Thank you for choosing Degi Kitchen.', 'Request only. Menu, portions, price, delivery, and availability require kitchen confirmation.'].filter((line, i, all) => line !== '' || i > 0 && all[i - 1] !== '').join('\n');
}
