import { getUser, admin } from '@netlify/identity';
import { getStore } from '@netlify/blobs';
import { json, sameOrigin } from '../lib/http.mjs';

export const config = { path: ['/api/customer-account', '/.netlify/functions/customer-account'], rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] } };

export function createAccountHandler({ user = getUser, store = () => getStore({ name: 'degi-orders', consistency: 'strong' }), deleteUser = id => admin.deleteUser(id) } = {}) {
  return async request => {
    if (!['GET', 'DELETE'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
    if (request.method === 'DELETE' && !sameOrigin(request)) return json({ error: 'Invalid request origin.' }, 403);
    try {
      const customer = await user();
      if (!customer) return json({ error: 'Please sign in to view your account.' }, 401);
      const storage = store();
      const prefix = `customers/${customer.id}/orders/`;
      const { blobs } = await storage.list({ prefix });
      if (request.method === 'DELETE') {
        for (const blob of blobs) await storage.delete(blob.key);
        await storage.delete(`customers/${customer.id}/avatar`);
        await deleteUser(customer.id);
        return json({ deleted: true });
      }
      const orders = [];
      for (const blob of blobs.sort((a, b) => a.key.localeCompare(b.key)).slice(-100)) {
        const order = await storage.get(blob.key, { type: 'json' });
        if (order) orders.push(order);
      }
      orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return json({ orders });
    } catch { return json({ error: 'Your account could not be loaded. Please try again.' }, 503); }
  };
}
export default createAccountHandler();
