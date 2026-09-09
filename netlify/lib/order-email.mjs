import { orderDocument } from '../../order-document.mjs';
import { requestSummary } from '../../order-model.mjs';

export async function sendOrderEmails(record, fetcher = fetch) {
  if (!process.env.RESEND_API_KEY) return null;
  const from = process.env.ORDER_EMAIL_FROM || 'Degi Kitchen <order@degikitchen.com>';
  const owner = process.env.ORDER_NOTIFICATION_EMAIL;
  if (!owner) throw new Error('Email delivery is not configured.');
  const text = requestSummary(record.items, record.details, record.reference);
  const messages = [
    { from, to: [owner], reply_to: record.details.email, subject: `New request ${record.reference} | ${record.details.name}`, html: orderDocument(record, 'kitchen'), text },
    { from, to: [record.details.email], reply_to: 'order@degikitchen.com', subject: `Thank you for your request | ${record.reference}`, html: orderDocument(record), text }
  ];
  const response = await fetcher('https://api.resend.com/emails/batch', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `degi-order-${record.reference}` }, body: JSON.stringify(messages), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Email delivery could not be confirmed.');
  const result = await response.json();
  if (!Array.isArray(result.data) || result.data.length !== 2 || result.data.some(email => !email.id)) throw new Error('Email delivery could not be confirmed.');
  return { ok: true, emailQueued: true };
}
