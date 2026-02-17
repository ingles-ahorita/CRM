/**
 * Kajabi API helpers (standalone – not wired into the rest of the app).
 * Replace getAccessToken with a real OAuth flow when ready.
 * @see https://developers.kajabi.com/api-reference/purchases/list-purchases
 */

// Log once when this module loads so we know the Kajabi code path is active (browser console)
if (typeof window !== 'undefined') {
  console.warn('[Kajabi] module loaded');
}

const KAJABI_BASE = 'https://api.kajabi.com/v1';
const KAJABI_SITE_ID = import.meta.env.VITE_KAJABI_SITE_ID || '2147813413';

function loggedFetch(url, options) {
  console.warn('[Kajabi]', url);
  return fetch(url, options);
}

/** Parse response as JSON; if we got HTML (e.g. SPA fallback in production), throw a clear error. */
async function parseJsonResponse(res) {
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) {
    throw new Error(
      `Kajabi API got HTML instead of JSON (status ${res.status}). Check proxy/deploy: ${trimmed.slice(0, 80)}...`
    );
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Kajabi API invalid JSON (status ${res.status}): ${e.message}`);
  }
}

const TOKEN_PATH = '/api/kajabi-token';
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000; // refresh 1 min before expiry

/** Cached token: { access_token, expiresAt } */
let oauthTokenCache = null;

/** Same-origin token URL; in production add cache-busting so CDN/browser never return a stale token. */
function getTokenApiUrl() {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const path = TOKEN_PATH;
  const cacheBust = import.meta.env.PROD ? `?t=${Date.now()}` : '';
  return `${base}${path}${cacheBust}`;
}

/**
 * Fetch access token from our API (server calls Kajabi OAuth; client never sees client_id/secret).
 * @returns {Promise<{ access_token: string, expires_in: number }>}
 */
async function fetchTokenFromApi() {
  const url = getTokenApiUrl();
  console.warn('[Kajabi] token request', url.replace(/\?.*/, ''));
  const res = await fetch(url);
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    console.warn('[Kajabi] token API response is not JSON', { status: res.status, contentType, preview: text.slice(0, 120) });
    throw new Error(`Kajabi token API returned non-JSON (likely SPA fallback). Status ${res.status}. Check /api/kajabi-token is hit on this origin.`);
  }
  if (!res.ok) {
    console.warn('[Kajabi] token API error', res.status, data);
    const msg = data?.error && data?.detail ? `${data.error}: ${data.detail}` : data?.error || res.statusText;
    throw new Error(`Kajabi token API ${res.status}: ${msg}`);
  }
  const accessToken = data.access_token;
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 7200;
  if (typeof accessToken !== 'string' || accessToken.trim() === '') {
    console.warn('[Kajabi] token API response invalid access_token', { keys: Object.keys(data), hasAccessToken: 'access_token' in data });
    throw new Error('Kajabi token API response missing or invalid access_token. Check server env KAJABI_CLIENT_ID/SECRET.');
  }
  console.warn('[Kajabi] token received', { expires_in: expiresIn, tokenLength: accessToken.length });
  return { access_token: accessToken.trim(), expires_in: expiresIn };
}

/**
 * Get access token for Kajabi API. Fetches from /api/kajabi-token (server-side OAuth);
 * caches until expiry, then fetches again. No token is stored in client env.
 * @returns {Promise<string>}
 */
export async function getAccessToken() {
  const now = Date.now();
  if (oauthTokenCache && oauthTokenCache.expiresAt > now + TOKEN_REFRESH_BUFFER_MS) {
    const t = oauthTokenCache.access_token;
    if (typeof t !== 'string' || t.trim() === '') {
      console.warn('[Kajabi] cached token invalid, refetching');
      oauthTokenCache = null;
    } else {
      console.warn('[Kajabi] using cached token', { tokenLength: t.length });
      return t;
    }
  }
  console.warn('[Kajabi] fetching new token');
  const result = await fetchTokenFromApi();
  const token = typeof result.access_token === 'string' ? result.access_token.trim() : '';
  if (!token) {
    console.warn('[Kajabi] got empty token from API');
    throw new Error('Kajabi token API returned empty token.');
  }
  oauthTokenCache = {
    access_token: token,
    expiresAt: now + result.expires_in * 1000 - TOKEN_REFRESH_BUFFER_MS,
  };
  return token;
}

/** Clear cached OAuth token (e.g. after 401). Next getAccessToken() will fetch a new one. */
export function clearKajabiTokenCache() {
  oauthTokenCache = null;
}

/** Ensure token is a non-empty string; throw with a clear message if not. */
function ensureToken(token, context = '') {
  if (typeof token !== 'string' || token.trim() === '') {
    const msg = `Kajabi request ${context}: no valid token (got ${typeof token}). Token API may be returning wrong shape or not being called.`;
    console.warn('[Kajabi]', msg);
    throw new Error(msg);
  }
  return token.trim();
}

/**
 * Fetch purchases from Kajabi API (list purchases).
 * @param {Object} options
 * @param {number} [options.page=1]
 * @param {number} [options.perPage=25]
 * @param {string} [options.sort='-created_at']
 * @param {string} [options.customerId] - If set, only purchases for this customer (searches whole DB per customer).
 * @returns {Promise<{ data: Array<object>, links: object, meta?: object }>}
 */
export async function fetchPurchases({ page = 1, perPage = 25, sort = '-created_at', customerId } = {}) {
  const params = new URLSearchParams({
    'page[number]': String(page),
    'page[size]': String(perPage),
    sort,
  });
  if (customerId) params.set('filter[customer_id]', customerId);
  params.set('filter[site_id]', KAJABI_SITE_ID);
  const url = `${KAJABI_BASE}/purchases?${params}`;

  const doRequest = async (token) => {
    ensureToken(token, 'fetchPurchases');
    console.warn('[Kajabi] fetchPurchases sending with token length', token.length);
    return loggedFetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.api+json',
      },
    });
  };

  let token = await getAccessToken();
  let res = await doRequest(token);
  if (res.status === 401) {
    console.warn('[Kajabi] 401 on request (token length was ' + token.length + '), clearing cache and retrying');
    clearKajabiTokenCache();
    token = await getAccessToken();
    ensureToken(token, 'fetchPurchases retry');
    console.warn('[Kajabi] fetchPurchases retry with new token length', token.length);
    res = await doRequest(token);
  }

  if (!res.ok) {
    const text = await res.text();
    const detail = res.status === 401 ? ` (token length sent: ${token?.length ?? 'none'})` : '';
    throw new Error(`Kajabi API ${res.status}: ${text}${detail}`);
  }

  const json = await parseJsonResponse(res);
  return {
    data: json.data || [],
    links: json.links || {},
    meta: json.meta,
  };
}

/**
 * Fetch a single purchase by id (for amount and customer id).
 * GET https://api.kajabi.com/v1/purchases/{id}
 * @param {string} id - Purchase id
 * @returns {Promise<{ id: string, attributes: object, relationships: object } | null>}
 */
export async function fetchPurchase(id) {
  if (!id) return null;
  const token = await getAccessToken();
  const url = `${KAJABI_BASE}/purchases/${encodeURIComponent(id)}`;
  const res = await loggedFetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.api+json',
    },
  });
  if (!res.ok) return null;
  const json = await parseJsonResponse(res);
  return json.data || null;
}

/**
 * Fetch a single customer by id (name, email, and contact id for admin URL from relationships.contact.data.id).
 * GET https://api.kajabi.com/v1/customers/{id}
 * @param {string} id - Customer id
 * @returns {Promise<{ name?: string, email?: string, contact_id?: string }>}
 */
export async function fetchCustomer(id) {
  if (!id) return { name: null, email: null, contact_id: null };
  const token = await getAccessToken();
  const url = `${KAJABI_BASE}/customers/${encodeURIComponent(id)}`;
  const res = await loggedFetch(url, {
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

  const json = await parseJsonResponse(res);
  const attrs = json.data?.attributes || {};
  // Same response: use relationships.contact.data.id for Kajabi admin URL (not attributes)
  const contactId = json.data?.relationships?.contact?.data?.id;
  return {
    name: attrs.name ?? null,
    email: attrs.email ?? null,
    contact_id: contactId != null ? String(contactId) : null,
  };
}

/**
 * List customers (paginated, sorted desc by created_at). Use for bulk lookup instead of many fetchCustomer(id).
 * GET https://api.kajabi.com/v1/customers
 * @param {Object} options
 * @param {number} [options.page=1]
 * @param {number} [options.perPage=50]
 * @param {string} [options.sort='-created_at']
 * @returns {Promise<{ data: Array<{ id: string, name?: string, email?: string, contact_id?: string, created_at?: string }>, links: object, meta?: object }>}
 */
export async function listCustomers({ page = 1, perPage = 100, sort = '-created_at' } = {}) {
  const token = await getAccessToken();
  const params = new URLSearchParams({
    'page[number]': String(page),
    'page[size]': String(perPage),
    sort,
    'fields[customers]': 'name,email,created_at',
  });
  params.set('filter[site_id]', KAJABI_SITE_ID);
  const url = `${KAJABI_BASE}/customers?${params}`;
  const res = await loggedFetch(url, {
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

  const json = await parseJsonResponse(res);
  const data = (json.data || []).map((c) => {
    const attrs = c.attributes || {};
    const contactId = c.relationships?.contact?.data?.id;
    return {
      id: c.id,
      name: attrs.name ?? null,
      email: attrs.email ?? null,
      contact_id: contactId != null ? String(contactId) : null,
      created_at: attrs.created_at ?? null,
    };
  });
  return {
    data,
    links: json.links || {},
    meta: json.meta,
  };
}

/**
 * Search customers across the whole Kajabi DB (fuzzy search on name/email).
 * GET https://api.kajabi.com/v1/customers?filter[search]=...
 * @param {Object} options
 * @param {string} options.search - Search term (name or email)
 * @param {string} [options.siteId] - Optional site id (recommended if account has multiple sites)
 * @param {number} [options.page=1]
 * @param {number} [options.perPage=25]
 * @returns {Promise<{ data: Array<{ id: string, name?: string, email?: string }>, links: object, meta?: object }>}
 */
export async function searchCustomers({ search, siteId, page = 1, perPage = 25 } = {}) {
  if (!search || !String(search).trim()) {
    return { data: [], links: {}, meta: null };
  }
  const token = await getAccessToken();
  const params = new URLSearchParams({
    'filter[search]': String(search).trim(),
    'fields[customers]': 'name,email',
    'page[number]': String(page),
    'page[size]': String(perPage),
  });
  params.set('filter[site_id]', String(siteId ?? KAJABI_SITE_ID));
  const url = `${KAJABI_BASE}/customers?${params}`;
  const res = await loggedFetch(url, {
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

  const json = await parseJsonResponse(res);
  const data = (json.data || []).map((c) => {
    const attrs = c.attributes || {};
    return {
      id: c.id,
      name: attrs.name ?? null,
      email: attrs.email ?? null,
    };
  });
  return {
    data,
    links: json.links || {},
    meta: json.meta,
  };
}

/**
 * Find a single Kajabi customer by email (exact match preferred).
 * Uses filter[email_contains] so passing the full email returns that customer if present.
 * @param {string} email - Customer email
 * @returns {Promise<{ id: string, name?: string, email?: string } | null>}
 */
export async function findCustomerByEmail(email) {
  if (!email || !String(email).trim()) return null;
  const trimmed = String(email).trim().toLowerCase();
  const token = await getAccessToken();
  const params = new URLSearchParams({
    'filter[email_contains]': trimmed,
    'fields[customers]': 'name,email',
    'page[number]': '1',
    'page[size]': '5',
  });
  params.set('filter[site_id]', KAJABI_SITE_ID);
  const url = `${KAJABI_BASE}/customers?${params}`;
  const res = await loggedFetch(url, {
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
  const json = await parseJsonResponse(res);
  const list = json.data || [];
  const exact = list.find((c) => (c.attributes?.email ?? '').toLowerCase() === trimmed);
  const chosen = exact || list[0];
  if (!chosen) return null;
  const attrs = chosen.attributes || {};
  return {
    id: chosen.id,
    name: attrs.name ?? null,
    email: attrs.email ?? null,
  };
}

/**
 * Fetch transactions from Kajabi API (list transactions).
 * GET https://api.kajabi.com/v1/transactions
 * @param {Object} options
 * @param {number} [options.page=1]
 * @param {number} [options.perPage=25]
 * @param {string} [options.sort='-created_at']
 * @param {string} [options.customerId] - If set, only transactions for this customer.
 * @returns {Promise<{ data: Array<object>, links: object, meta?: object }>}
 */
export async function fetchTransactions({ page = 1, perPage = 25, sort = '-created_at', customerId } = {}) {
  const params = new URLSearchParams({
    'page[number]': String(page),
    'page[size]': String(perPage),
    'filter[site_id]': KAJABI_SITE_ID,
  });
  if (customerId) params.set('filter[customer_id]', customerId);
  if (sort) params.set('sort', sort);
  const url = `${KAJABI_BASE}/transactions?${params}`;

  const doRequest = async (token) => {
    ensureToken(token, 'fetchTransactions');
    console.warn('[Kajabi] fetchTransactions sending with token length', token.length);
    return loggedFetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.api+json',
      },
    });
  };

  let token = await getAccessToken();
  let res = await doRequest(token);
  if (res.status === 401) {
    console.warn('[Kajabi] 401 on request (token length was ' + token.length + '), clearing cache and retrying');
    clearKajabiTokenCache();
    token = await getAccessToken();
    ensureToken(token, 'fetchTransactions retry');
    res = await doRequest(token);
  }

  if (!res.ok) {
    const text = await res.text();
    const detail = res.status === 401 ? ` (token length sent: ${token?.length ?? 'none'})` : '';
    throw new Error(`Kajabi API ${res.status}: ${text}${detail}`);
  }

  const json = await parseJsonResponse(res);
  return {
    data: json.data || [],
    links: json.links || {},
    meta: json.meta,
  };
}

/**
 * Fetch a single transaction by id (for amount paid).
 * GET https://api.kajabi.com/v1/transactions/{id}
 * @param {string} id - Transaction id
 * @returns {Promise<{ amount_in_cents: number | null, currency: string } | null>}
 */
export async function fetchTransaction(id) {
  if (!id) return null;
  const token = await getAccessToken();
  const url = `${KAJABI_BASE}/transactions/${encodeURIComponent(id)}`;
  const res = await loggedFetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.api+json',
    },
  });
  if (!res.ok) return null;
  const json = await parseJsonResponse(res);
  const attrs = json.data?.attributes || {};
  const amount = attrs.amount_in_cents;
  return {
    amount_in_cents: amount != null ? Number(amount) : null,
    currency: attrs.currency || 'USD',
  };
}

/**
 * List offers (paginated). Use for bulk lookup instead of many fetchOffer(id).
 * GET https://api.kajabi.com/v1/offers
 * @param {Object} options
 * @param {number} [options.page=1]
 * @param {number} [options.perPage=50]
 * @returns {Promise<{ data: Array<{ id: string, internal_title?: string }>, links: object, meta?: object }>}
 */
export async function listOffers({ page = 1, perPage = 50 } = {}) {
  const token = await getAccessToken();
  const params = new URLSearchParams({
    'page[number]': String(page),
    'page[size]': String(perPage),
    'fields[offers]': 'internal_title',
  });
  const url = `${KAJABI_BASE}/offers?${params}`;
  const res = await loggedFetch(url, {
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

  const json = await parseJsonResponse(res);
  const data = (json.data || []).map((o) => ({
    id: o.id,
    internal_title: o.attributes?.internal_title ?? null,
  }));
  return {
    data,
    links: json.links || {},
    meta: json.meta,
  };
}

/**
 * Fetch a single offer by id (for title/name).
 * GET https://api.kajabi.com/v1/offers/{id}
 * @param {string} id - Offer id
 * @returns {Promise<{ id: string, title?: string } | null>}
 */
export async function fetchOffer(id) {
  if (!id) return null;
  const token = await getAccessToken();
  const params = new URLSearchParams({ 'fields[offers]': 'internal_title' });
  const url = `${KAJABI_BASE}/offers/${encodeURIComponent(id)}?${params}`;
  const res = await loggedFetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.api+json',
    },
  });

  if (!res.ok) return null;
  const json = await parseJsonResponse(res);
  const attrs = json.data?.attributes || {};
  return {
    id: json.data?.id,
    internal_title: attrs.internal_title ?? null,
  };
}
