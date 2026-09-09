import { json, sameOrigin, boundedJSON } from '../lib/http.mjs';
export const config = { path: ['/api/address-suggestions', '/.netlify/functions/address-suggestions'], rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
const states = { Virginia: 'VA', Maryland: 'MD', 'District of Columbia': 'DC' };
export function addressResults(features) {
  const seen = new Set();
  return (Array.isArray(features) ? features : []).flatMap(feature => {
    const p = feature?.properties || {};
    const state = states[p.state] || (Object.values(states).includes(p.state) ? p.state : '');
    const city = p.city || p.town || p.village || (state === 'DC' ? 'Washington' : '');
    if (p.countrycode?.toUpperCase() !== 'US' || !state || !p.housenumber || !p.street || !city || !/^\d{5}(?:-\d{4})?$/.test(p.postcode || '')) return [];
    const address = { street: `${p.housenumber} ${p.street}`, city, state, zip: p.postcode, line2: '' };
    const label = `${address.street}, ${city}, ${state} ${p.postcode}`;
    if (address.street.length > 180 || typeof city !== 'string' || city.length > 100 || /[\u0000-\u001f\u007f]/.test(label) || label.length > 360 || seen.has(label)) return [];
    seen.add(label); return [{ ...address, label }];
  }).slice(0, 6);
}
export function createAddressHandler(search = url => fetch(url, { headers: { 'User-Agent': 'DegiKitchen/1.0 (order@degikitchen.com)' }, signal: AbortSignal.timeout(6000) })) {
  return async request => {
    if (request.method !== 'POST' || !sameOrigin(request)) return json({ error: 'Please search from the order form.' }, 403);
    try {
      const { query } = await boundedJSON(request);
      if (typeof query !== 'string' || query.trim().length < 6 || query.length > 180 || /[\u0000-\u001f]/.test(query)) return json({ addresses: [] });
      const url = new URL('https://photon.komoot.io/api/');
      url.search = new URLSearchParams({ q: query.trim(), countrycode: 'US', lat: '38.96', lon: '-77.30', zoom: '9', limit: '12', lang: 'en' }).toString();
      const response = await search(url);
      if (!response.ok) throw new Error();
      return json({ addresses: addressResults((await response.json()).features) });
    } catch { return json({ addresses: [], unavailable: true }); }
  };
}
export default createAddressHandler();
