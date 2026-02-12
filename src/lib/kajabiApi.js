/**
 * Kajabi API helpers (standalone – not wired into the rest of the app).
 * Replace getAccessToken with a real OAuth flow when ready.
 * @see https://developers.kajabi.com/api-reference/purchases/list-purchases
 */

const KAJABI_BASE = 'https://api.kajabi.com/v1';
const KAJABI_SITE_ID = import.meta.env.VITE_KAJABI_SITE_ID || '2147813413';

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
 * @param {string} [options.customerId] - If set, only purchases for this customer (searches whole DB per customer).
 * @returns {Promise<{ data: Array<object>, links: object, meta?: object }>}
 */
export async function fetchPurchases({ page = 1, perPage = 25, sort = '-created_at', customerId } = {}) {
  const token = await getAccessToken();
  const params = new URLSearchParams({
    'page[number]': String(page),
    'page[size]': String(perPage),
    sort,
  });
  if (customerId) params.set('filter[customer_id]', customerId);
  params.set('filter[site_id]', KAJABI_SITE_ID);
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
 * Fetch a single customer by id (name, email, and contact id for admin URL from relationships.contact.data.id).
 * GET https://api.kajabi.com/v1/customers/{id}
 * @param {string} id - Customer id
 * @returns {Promise<{ name?: string, email?: string, contact_id?: string }>}
 */
export async function fetchCustomer(id) {
  if (!id) return { name: null, email: null, contact_id: null };
  const token = await getAccessToken();
  const url = `${KAJABI_BASE}/customers/${encodeURIComponent(id)}`;
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
  // Same response: use relationships.contact.data.id for Kajabi admin URL (not attributes)
  const contactId = json.data?.relationships?.contact?.data?.id;
  return {
    name: attrs.name ?? null,
    email: attrs.email ?? null,
    contact_id: contactId != null ? String(contactId) : null,
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
  const token = await getAccessToken();
  const params = new URLSearchParams({
    'page[number]': String(page),
    'page[size]': String(perPage),
    'filter[site_id]': KAJABI_SITE_ID,
  });
  if (customerId) params.set('filter[customer_id]', customerId);
  if (sort) params.set('sort', sort);
  const url = `${KAJABI_BASE}/transactions?${params}`;
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
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.api+json',
    },
  });

  if (!res.ok) return null;
  const json = await res.json();
  const attrs = json.data?.attributes || {};
  return {
    id: json.data?.id,
    internal_title: attrs.internal_title ?? null,
  };
}
