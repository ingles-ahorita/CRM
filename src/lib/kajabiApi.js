/**
 * Kajabi API – token from GET /api/kajabi-token (OAuth client_credentials), then direct calls.
 * Server env: KAJABI_CLIENT_ID, KAJABI_CLIENT_SECRET.
 * @see https://developers.kajabi.com/api-reference/purchases/list-purchases
 */

const KAJABI_BASE = 'https://api.kajabi.com/v1';
const KAJABI_SITE_ID = import.meta.env.VITE_KAJABI_SITE_ID || '2147813413';

let tokenCache = { token: null, expiresAt: 0 };
const BUFFER_MS = 60 * 1000;

async function getToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - BUFFER_MS) {
    return tokenCache.token;
  }
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const res = await fetch(`${base}/api/kajabi-token`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(data?.error || data?.detail || `Token ${res.status}`);
  }
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 7200;
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  return tokenCache.token;
}

async function kajabiFetch(pathAndQuery) {
  const token = await getToken();
  const url = `${KAJABI_BASE}/${pathAndQuery}`;
  return fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.api+json',
    },
  });
}

async function parseJsonResponse(res) {
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) {
    throw new Error(`Kajabi API got HTML (status ${res.status}). ${trimmed.slice(0, 80)}...`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Kajabi API invalid JSON (status ${res.status}): ${e.message}`);
  }
}

export async function fetchPurchases({ page = 1, perPage = 25, sort = '-created_at', customerId } = {}) {
  const params = new URLSearchParams({
    'page[number]': String(page),
    'page[size]': String(perPage),
    sort,
  });
  if (customerId) params.set('filter[customer_id]', customerId);
  params.set('filter[site_id]', KAJABI_SITE_ID);
  const res = await kajabiFetch(`purchases?${params}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kajabi API ${res.status}: ${text}`);
  }
  const json = await parseJsonResponse(res);
  return { data: json.data || [], links: json.links || {}, meta: json.meta };
}

export async function fetchPurchase(id) {
  if (!id) return null;
  const res = await kajabiFetch(`purchases/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  const json = await parseJsonResponse(res);
  return json.data || null;
}

export async function fetchCustomer(id) {
  if (!id) return { name: null, email: null, contact_id: null };
  const res = await kajabiFetch(`customers/${encodeURIComponent(id)}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kajabi API ${res.status}: ${text}`);
  }
  const json = await parseJsonResponse(res);
  const attrs = json.data?.attributes || {};
  const contactId = json.data?.relationships?.contact?.data?.id;
  return {
    name: attrs.name ?? null,
    email: attrs.email ?? null,
    contact_id: contactId != null ? String(contactId) : null,
  };
}

export async function listCustomers({ page = 1, perPage = 100, sort = '-created_at' } = {}) {
  const params = new URLSearchParams({
    'page[number]': String(page),
    'page[size]': String(perPage),
    sort,
    'fields[customers]': 'name,email,created_at',
  });
  params.set('filter[site_id]', KAJABI_SITE_ID);
  const res = await kajabiFetch(`customers?${params}`);
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
  return { data, links: json.links || {}, meta: json.meta };
}

export async function searchCustomers({ search, siteId, page = 1, perPage = 25 } = {}) {
  if (!search || !String(search).trim()) return { data: [], links: {}, meta: null };
  const params = new URLSearchParams({
    'filter[search]': String(search).trim(),
    'fields[customers]': 'name,email',
    'page[number]': String(page),
    'page[size]': String(perPage),
  });
  params.set('filter[site_id]', String(siteId ?? KAJABI_SITE_ID));
  const res = await kajabiFetch(`customers?${params}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kajabi API ${res.status}: ${text}`);
  }
  const json = await parseJsonResponse(res);
  const data = (json.data || []).map((c) => {
    const attrs = c.attributes || {};
    return { id: c.id, name: attrs.name ?? null, email: attrs.email ?? null };
  });
  return { data, links: json.links || {}, meta: json.meta };
}

export async function findCustomerByEmail(email) {
  if (!email || !String(email).trim()) return null;
  const trimmed = String(email).trim().toLowerCase();
  const params = new URLSearchParams({
    'filter[email_contains]': trimmed,
    'fields[customers]': 'name,email',
    'page[number]': '1',
    'page[size]': '5',
  });
  params.set('filter[site_id]', KAJABI_SITE_ID);
  const res = await kajabiFetch(`customers?${params}`);
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
  return { id: chosen.id, name: attrs.name ?? null, email: attrs.email ?? null };
}

export async function fetchTransactions({ page = 1, perPage = 25, sort = '-created_at', customerId } = {}) {
  const params = new URLSearchParams({
    'page[number]': String(page),
    'page[size]': String(perPage),
    'filter[site_id]': KAJABI_SITE_ID,
  });
  if (customerId) params.set('filter[customer_id]', customerId);
  if (sort) params.set('sort', sort);
  const res = await kajabiFetch(`transactions?${params}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kajabi API ${res.status}: ${text}`);
  }
  const json = await parseJsonResponse(res);
  return { data: json.data || [], links: json.links || {}, meta: json.meta };
}

export async function fetchTransaction(id) {
  if (!id) return null;
  const res = await kajabiFetch(`transactions/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  const json = await parseJsonResponse(res);
  const attrs = json.data?.attributes || {};
  return {
    amount_in_cents: attrs.amount_in_cents != null ? Number(attrs.amount_in_cents) : null,
    currency: attrs.currency || 'USD',
  };
}

export async function listOffers({ page = 1, perPage = 50 } = {}) {
  const params = new URLSearchParams({
    'page[number]': String(page),
    'page[size]': String(perPage),
    'fields[offers]': 'internal_title',
  });
  const res = await kajabiFetch(`offers?${params}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kajabi API ${res.status}: ${text}`);
  }
  const json = await parseJsonResponse(res);
  const data = (json.data || []).map((o) => ({
    id: o.id,
    internal_title: o.attributes?.internal_title ?? null,
  }));
  return { data, links: json.links || {}, meta: json.meta };
}

export async function fetchOffer(id) {
  if (!id) return null;
  const params = new URLSearchParams({ 'fields[offers]': 'internal_title' });
  const res = await kajabiFetch(`offers/${encodeURIComponent(id)}?${params}`);
  if (!res.ok) return null;
  const json = await parseJsonResponse(res);
  const attrs = json.data?.attributes || {};
  return { id: json.data?.id, internal_title: attrs.internal_title ?? null };
}
