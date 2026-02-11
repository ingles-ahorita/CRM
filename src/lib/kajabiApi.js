/**
 * Kajabi API helpers (standalone – not wired into the rest of the app).
 * Replace getAccessToken with a real OAuth flow when ready.
 * @see https://developers.kajabi.com/api-reference/purchases/list-purchases
 */

const KAJABI_BASE = 'https://api.kajabi.com/v1';

/**
 * Get access token for Kajabi API.
 * For now: return a hardcoded token. Later: call POST /v1/oauth/token with client_credentials.
 * @returns {Promise<string>}
 */
export async function getAccessToken() {
  // TODO: Replace with real token fetch, e.g.:
  // const res = await fetch(`${KAJABI_BASE.replace('/v1','')}/oauth/token`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     grant_type: 'client_credentials',
  //     client_id: process.env.VITE_KAJABI_CLIENT_ID,
  //     client_secret: process.env.VITE_KAJABI_CLIENT_SECRET,
  //   }),
  // });
  // const data = await res.json();
  // return data.access_token;
  return Promise.resolve(getHardcodedToken());
}

/**
 * Hardcoded token – replace with your actual token or use env.
 * @returns {string}
 */
function getHardcodedToken() {
  // Paste your token here, or use env: import.meta.env.VITE_KAJABI_ACCESS_TOKEN
  const token = import.meta.env.VITE_KAJABI_ACCESS_TOKEN || 'YOUR_KAJABI_ACCESS_TOKEN';
  return token;
}

/**
 * Fetch purchases from Kajabi API (list purchases).
 * @param {Object} options
 * @param {number} [options.page=1]
 * @param {number} [options.perPage=25]
 * @param {string} [options.sort='-created_at']
 * @returns {Promise<{ data: Array<object>, links: object, meta?: object }>}
 */
export async function fetchPurchases({ page = 1, perPage = 25, sort = '-created_at' } = {}) {
  const token = await getAccessToken();
  const params = new URLSearchParams({
    'page[number]': String(page),
    'page[size]': String(perPage),
    sort,
  });
  const url = `${KAJABI_BASE}/purchases?${params}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.api+json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kajabi API ${res.status}: ${text}`);
  }

  const json = await res.json();
  return {
    data: json.data || [],
    links: json.links || {},
    meta: json.meta,
  };
}

/**
 * Fetch a single customer by id (name and email).
 * GET https://api.kajabi.com/v1/customers/{id}
 * @param {string} id - Customer id
 * @returns {Promise<{ name?: string, email?: string }>}
 */
export async function fetchCustomer(id) {
  if (!id) return { name: null, email: null };
  const token = await getAccessToken();
  const params = new URLSearchParams({ 'fields[customers]': 'name,email' });
  const url = `${KAJABI_BASE}/customers/${encodeURIComponent(id)}?${params}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.api+json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kajabi API ${res.status}: ${text}`);
  }

  const json = await res.json();
  const attrs = json.data?.attributes || {};
  return {
    name: attrs.name ?? null,
    email: attrs.email ?? null,
  };
}
