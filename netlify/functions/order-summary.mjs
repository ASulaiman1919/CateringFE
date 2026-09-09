import { createHash } from 'node:crypto';
import { getUser } from '@netlify/identity';
import { getStore } from '@netlify/blobs';
import { sameOrigin } from '../lib/http.mjs';
import { orderDocument } from '../../order-document.mjs';

export const config = { path: ['/api/order-summary', '/.netlify/functions/order-summary'], rateLimit: { windowLimit: 15, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const error = (text, status) => new Response(text, { status, headers: { ...headers, 'Content-Type': 'text/plain;charset=utf-8' } });
export function createSummaryHandler({ user = getUser, store = () => getStore({ name: 'degi-orders', consistency: 'strong' }), now = () => Date.now() } = {}) {
  return async request => {
    if (request.method !== 'POST' || !sameOrigin(request)) return error('Please download from the Degi Kitchen order page.', 403);
    if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return error('Invalid download request.', 400);
    try {
      const reader = request.body?.getReader(); if (!reader) return error('Invalid download request.', 400);
      const chunks = []; let size = 0;
      while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 1024) { await reader.cancel(); return error('Invalid download request.', 400); } chunks.push(Buffer.from(value)); }
      const fields = new URLSearchParams(Buffer.concat(chunks).toString());
      const storage = store(); let record;
      if (uuid.test(fields.get('requestId') || '')) {
        // The unguessable UUID stays in the POST body, never a shareable URL or email.
        record = await storage.get('requests/' + createHash('sha256').update(fields.get('requestId')).digest('hex'), { type: 'json' });
        if (!record || record.status !== 'received' || now() - Date.parse(record.createdAt) > 2 * 60 * 60 * 1000) return error('This download is no longer available. Signed-in customers can download it from My requests; otherwise contact the kitchen with your request number.', 410);
      } else {
        const customer = await user(); if (!customer) return error('Please sign in to download a past request.', 401);
        const reference = fields.get('reference'), createdAt = fields.get('createdAt');
        if (!/^DK-[A-F0-9]{12}$/.test(reference || '') || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(createdAt || '')) return error('Invalid request reference.', 400);
        record = await storage.get(`customers/${customer.id}/orders/${createdAt}-${reference}`, { type: 'json' });
      }
      if (!record?.items || !record?.details) return error('That summary is unavailable. Please contact the kitchen.', 404);
      return new Response(orderDocument(record), { headers: { ...headers, 'Content-Type': 'text/html;charset=utf-8', 'Content-Disposition': `attachment; filename="${record.reference}.html"`, 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" } });
    } catch { return error('The summary could not be downloaded. Please return to your request and try again.', 503); }
  };
}
export default createSummaryHandler();
