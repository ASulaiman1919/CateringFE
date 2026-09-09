import { createHash } from 'node:crypto';
import { getUser } from '@netlify/identity';
import { getStore } from '@netlify/blobs';
import catalog from '../data/menu.json' with { type: 'json' };
import { normalizeCart, validateDetails, orderLines, totalLabel, scheduleLabel, addressLabel } from '../../order-model.mjs';
import { json, sameOrigin, boundedJSON } from '../lib/http.mjs';
import { sendOrderEmails } from '../lib/order-email.mjs';

export const config = { path: ['/api/order-request', '/.netlify/functions/order-request'], rateLimit: { windowLimit: 5, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
const hash = value => createHash('sha256').update(value).digest('hex');

export function notificationFields(record) {
  const { details, items, reference } = record;
  return {
    'form-name': 'degi-order-request',
    reference,
    'order-items': orderLines(items),
    'total-quantities': totalLabel(items),
    'date-and-event': `${scheduleLabel(details)}\nDelivery address:\n${addressLabel(details.address)}${details.guests ? '\nGuests (optional): ' + details.guests : ''}\n${details.requestType === 'event' ? 'Event catering' : 'Family order'}${details.occasion ? ' / ' + details.occasion : ''}`,
    customer: `ORDERED BY\n${details.name}\n${details.email}\n${details.phone}${details.recipient ? '\n\nDELIVERY RECIPIENT\n' + details.recipient.name + '\n' + details.recipient.phone : ''}`,
    email: details.email,
    notes: details.notes || 'None provided',
    price: 'Personal quote pending. Not a confirmed order.',
    subject: `Degi Kitchen | ${reference} | ${details.name}`,
    website: ''
  };
}

export function createOrderHandler({ user = getUser, store = () => getStore({ name: 'degi-orders', consistency: 'strong' }), email = sendOrderEmails, send = fields => fetch(new URL('/', process.env.URL || 'https://degikitchen.com'), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString(), signal: AbortSignal.timeout(15000) }), now = () => new Date() } = {}) {
  return async request => {
    if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    if (!sameOrigin(request)) return json({ error: 'Please submit from the Degi Kitchen website.' }, 403);
    let input, items, details, customer;
    try { customer = await user(); } catch { return json({ error: 'Unable to check your account. Please try again.' }, 503); }
    try {
      input = await boundedJSON(request);
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.requestId)) throw new Error('Please reload the order form.');
      if (input.website) throw new Error('Please contact the kitchen directly.');
      items = normalizeCart(input.items, catalog);
      if (!items.length) throw new Error('Please add at least one dish to your cart.');
      if (input.accountExpected && !customer) return json({ error: 'Your account session expired. Sign in again or continue as a guest.' }, 401);
      details = validateDetails(input.details, now(), customer);
      if (customer && ['name', 'email', 'phone'].some(key => input.details?.[key]?.trim() !== details[key])) return json({ error: 'Your profile changed. Refresh the page and review your contact details before sending.' }, 409);
    } catch (error) { return json({ error: error.message || 'Please check your request.' }, 400); }
    try {
      const storage = store();
      const key = 'requests/' + hash(input.requestId);
      const fingerprint = hash(JSON.stringify({ items, details, userId: customer?.id || null }));
      const reference = 'DK-' + input.requestId.replaceAll('-', '').slice(0, 12).toUpperCase();
      let record = await storage.get(key, { type: 'json' });
      const saveHistory = async value => {
        if (customer) await storage.setJSON(`customers/${customer.id}/orders/${value.createdAt}-${reference}`, { reference, createdAt: value.createdAt, status: 'Request received', items, details });
      };
      if (record) {
        if (record.fingerprint !== fingerprint) return json({ error: 'This request changed. Please review it again before sending.' }, 409);
        if (record.status === 'received') {
          try { await saveHistory(record); } catch { return json({ reference, received: true, emailQueued: !!record.emailQueued, historyWarning: true }); }
          return json({ reference, received: true, emailQueued: !!record.emailQueued });
        }
        return json({ error: `We cannot confirm delivery yet for ${reference}. Please contact the kitchen before resending.`, reference }, 409);
      }
      record = { reference, fingerprint, status: 'sending', createdAt: now().toISOString(), items, details };
      const lock = await storage.setJSON(key, record, { onlyIfNew: true });
      if (!lock.modified) return json({ error: 'This request is already being sent. Please wait.' }, 409);
      // A timeout may happen after acceptance. Retain the reference rather than send a duplicate.
      const response = await email(record) || await send(notificationFields(record));
      if (!response.ok) {
        await storage.delete(key);
        return json({ error: 'Your request could not be sent. Please try again or call the kitchen.' }, 502);
      }
      record.status = 'received';
      record.emailQueued = !!response.emailQueued;
      await storage.setJSON(key, record);
      try { await saveHistory(record); } catch { return json({ reference, received: true, emailQueued: record.emailQueued, historyWarning: true }); }
      return json({ reference, received: true, emailQueued: record.emailQueued });
    } catch {
      return json({ error: 'We could not confirm delivery. Your cart is still here. Please contact the kitchen before sending again.' }, 503);
    }
  };
}
export default createOrderHandler();
