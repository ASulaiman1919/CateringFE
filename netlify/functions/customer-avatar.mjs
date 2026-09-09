import { getUser } from '@netlify/identity';
import { getStore } from '@netlify/blobs';
import { json, sameOrigin } from '../lib/http.mjs';
export const config = { path: ['/api/customer-avatar', '/.netlify/functions/customer-avatar'], rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
const maxBytes = 700000;
export function isAvatar(bytes) { return bytes.length > 16 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'; }
export function createAvatarHandler({ user = getUser, store = () => getStore({ name: 'degi-orders', consistency: 'strong' }) } = {}) {
  return async request => {
    if (!['GET', 'PUT', 'DELETE'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
    if (request.method !== 'GET' && !sameOrigin(request)) return json({ error: 'Invalid request origin.' }, 403);
    try {
      const customer = await user();
      if (!customer) return json({ error: 'Please sign in.' }, 401);
      const storage = store(); const key = `customers/${customer.id}/avatar`;
      if (request.method === 'DELETE') { await storage.delete(key); return json({ removed: true }); }
      if (request.method === 'GET') {
        const bytes = await storage.get(key, { type: 'arrayBuffer' });
        if (!bytes) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
        return new Response(bytes, { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" } });
      }
      if (request.headers.get('content-type') !== 'image/webp' || Number(request.headers.get('content-length')) > maxBytes) return json({ error: 'Please choose a smaller photo.' }, 400);
      const reader = request.body?.getReader(); const chunks = []; let size = 0;
      if (!reader) return json({ error: 'Choose a photo.' }, 400);
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) { await reader.cancel(); return json({ error: 'Please choose a smaller photo.' }, 400); } chunks.push(Buffer.from(value)); }
      const bytes = Buffer.concat(chunks);
      if (!isAvatar(bytes)) return json({ error: 'Please choose a valid photo.' }, 400);
      await storage.set(key, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { metadata: { contentType: 'image/webp' } });
      return json({ saved: true });
    } catch { return json({ error: 'Your photo could not be saved. Please try again.' }, 503); }
  };
}
export default createAvatarHandler();
