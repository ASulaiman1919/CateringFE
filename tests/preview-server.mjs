// Local-only browser QA. Identity and email are fixtures; no messages leave this server.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createOrderHandler } from '../netlify/functions/order-request.mjs';
import { createAddressHandler } from '../netlify/functions/address-suggestions.mjs';
import { createAccountHandler } from '../netlify/functions/customer-account.mjs';
import { createAvatarHandler } from '../netlify/functions/customer-avatar.mjs';
import { createSummaryHandler } from '../netlify/functions/order-summary.mjs';
import { orderDocument } from '../order-document.mjs';

const root = resolve('dist');
const records = new Map();
const storage = {
  get: async key => records.get(key) || null,
  set: async (key, value) => records.set(key, value),
  setJSON: async (key, value, options = {}) => { if (options.onlyIfNew && records.has(key)) return { modified: false }; records.set(key, structuredClone(value)); return { modified: true }; },
  delete: async key => records.delete(key),
  list: async ({ prefix }) => ({ blobs: [...records.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) })
};
let profile = { id: 'preview-customer', email: 'preview@example.com', user_metadata: { full_name: 'Preview Customer', phone: '202-555-0144' }, app_metadata: { provider: 'email' }, confirmed_at: new Date().toISOString(), created_at: new Date().toISOString() };
const currentUser = request => async () => request.headers.get('cookie')?.includes('nf_jwt=') ? { id: profile.id, name: profile.user_metadata.full_name, email: profile.email, userMetadata: profile.user_metadata } : null;
let lastReceipt;
const json = body => Response.json(body);
const token = () => {
  const payload = Buffer.from(JSON.stringify({ sub: profile.id, email: profile.email, user_metadata: profile.user_metadata, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  return { access_token: 'eyJhbGciOiJub25lIn0.' + payload + '.preview', refresh_token: 'local-preview-only', token_type: 'bearer', expires_in: 3600 };
};
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' };
createServer(async (req, res) => {
  try {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const url = new URL(req.url, 'http://127.0.0.1:5173');
    const body = Buffer.concat(chunks);
    const request = new Request(url, { method: req.method, headers: req.headers, ...(body.length ? { body } : {}) });
    let response;
    if (url.pathname === '/.netlify/identity/token') response = json(token());
    else if (url.pathname === '/.netlify/identity/user') {
      if (req.method === 'PUT') profile.user_metadata = { ...profile.user_metadata, ...JSON.parse(body.toString()).data };
      response = json(profile);
    } else if (url.pathname === '/.netlify/identity/logout') response = json({});
    else if (url.pathname === '/.netlify/identity/signup') response = json(profile);
    else if (url.pathname === '/api/order-request') response = await createOrderHandler({ user: currentUser(request), store: () => storage, email: async record => { lastReceipt = record; return { ok: true, emailQueued: true }; } })(request);
    else if (url.pathname === '/api/customer-account') response = await createAccountHandler({ user: currentUser(request), store: () => storage, deleteUser: async () => {} })(request);
    else if (url.pathname === '/api/customer-avatar') response = await createAvatarHandler({ user: currentUser(request), store: () => storage })(request);
    else if (url.pathname === '/api/order-summary') response = await createSummaryHandler({ user: currentUser(request), store: () => storage })(request);
    else if (url.pathname === '/api/address-suggestions') response = await createAddressHandler()(request);
    else if (url.pathname === '/__test/receipt' && lastReceipt) response = new Response(orderDocument(lastReceipt), { headers: { 'content-type': 'text/html' } });
    else if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/')) response = json({ error: 'Not available in local preview.' });
    else {
      const file = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(root + '/')) throw new Error('Invalid path');
      response = new Response(await readFile(file), { headers: { 'content-type': types[extname(file)] || 'application/octet-stream' } });
    }
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(5173, '127.0.0.1', () => console.log('Local QA preview: http://127.0.0.1:5173 (fixture accounts and emails only)'));
