/**
 * Private page: Multipayment completion rate for specific offers.
 * Fetches purchases from Kajabi API, filters by offer_id, calculates:
 *   - % who paid each installment (of those whose installment was due)
 */
import React, { useState, useEffect } from 'react';
import { fetchPurchases } from '../lib/kajabiApi';

const OFFERS = [
  { id: '2150763469', installments: 4, title: '4×$449' },
  { id: '2150757348', installments: 7, title: '7×$299' },
  { id: '2150473800', installments: 3, title: '3×$299' },
  { id: '2150511913', installments: 7, title: '7×$199' },
  { id: '2149979884', installments: 2, title: '2×$499' },
];
const DAYS_BETWEEN = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function computeStats(purchases, installments) {
  if (purchases.length === 0) return [];
  const now = Date.now();
  const rows = [];
  for (let inst = 2; inst <= installments; inst++) {
    const daysUntilDue = (inst - 1) * DAYS_BETWEEN;
    const cutoff = now - daysUntilDue * MS_PER_DAY;
    const shouldHavePaid = purchases.filter((p) => {
      const created = p.attributes?.created_at;
      if (!created) return false;
      return new Date(created).getTime() <= cutoff;
    });
    const didPay = shouldHavePaid.filter((p) => {
      const n = p.attributes?.multipay_payments_made;
      return n != null && Number(n) >= inst;
    });
    rows.push({
      installment: inst,
      shouldHavePaid: shouldHavePaid.length,
      didPay: didPay.length,
      pct: shouldHavePaid.length > 0
        ? Math.round((didPay.length / shouldHavePaid.length) * 1000) / 10
        : null,
    });
  }
  return rows;
}

export default function MultipayCompletionPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [purchasesByOffer, setPurchasesByOffer] = useState({});

  useEffect(() => {
    let cancelled = false;
    const offerIds = new Set(OFFERS.map((o) => String(o.id)));
    const load = async () => {
      setLoading(true);
      setError(null);
      const byOffer = {};
      offerIds.forEach((id) => { byOffer[id] = []; });
      let page = 1;
      const perPage = 250;
      try {
        while (true) {
          const result = await fetchPurchases({ page, perPage, sort: '-created_at' });
          const data = result.data || [];
          if (data.length === 0) break;
          for (const p of data) {
            const offerId = p.relationships?.offer?.data?.id;
            const sid = offerId != null ? String(offerId) : null;
            if (sid && offerIds.has(sid)) {
              byOffer[sid].push(p);
            }
          }
          if (data.length < perPage) break;
          page++;
          if (page > 50) break;
        }
        if (!cancelled) setPurchasesByOffer(byOffer);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to fetch');
        if (!cancelled) setPurchasesByOffer({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const pageStyle = { padding: 24, fontFamily: 'system-ui', maxWidth: 800, marginLeft: 32 };

  if (loading) {
    return (
      <div style={pageStyle}>
        <h1 style={{ fontSize: 18, marginBottom: 16 }}>Multipay completion</h1>
        <p>Loading purchases from Kajabi...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={pageStyle}>
        <h1 style={{ fontSize: 18, marginBottom: 16 }}>Multipay completion</h1>
        <p style={{ color: '#dc2626' }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <h1 style={{ fontSize: 18, marginBottom: 24 }}>Multipay completion</h1>
      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 32 }}>
        Installments every {DAYS_BETWEEN} days.
      </p>

      {OFFERS.map((offer) => {
        const purchases = purchasesByOffer[String(offer.id)] || [];
        const stats = computeStats(purchases, offer.installments);
        return (
          <div key={offer.id} style={{ marginBottom: 48 }}>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>{offer.title || `Offer ${offer.id}`} — {offer.id}</h2>
            <p style={{ color: '#6b7280', fontSize: 12, marginBottom: 12 }}>
              {purchases.length} purchase{purchases.length !== 1 ? 's' : ''} found
            </p>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px' }}>Installment</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px' }}>Should've paid</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px' }}>Did pay</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px' }}>Completion %</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((row) => (
                  <tr key={row.installment} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '8px 12px' }}>#{row.installment}</td>
                    <td style={{ textAlign: 'right', padding: '8px 12px' }}>{row.shouldHavePaid}</td>
                    <td style={{ textAlign: 'right', padding: '8px 12px' }}>{row.didPay}</td>
                    <td style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600 }}>
                      {row.pct != null ? `${row.pct}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <details style={{ marginTop: 16 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, color: '#6b7280' }}>Purchase list</summary>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12, marginTop: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Date</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Payments made</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>ID</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases
                    .sort((a, b) => new Date(b.attributes?.created_at || 0) - new Date(a.attributes?.created_at || 0))
                    .map((p) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '6px 8px' }}>
                          {p.attributes?.created_at
                            ? new Date(p.attributes.created_at).toLocaleDateString('en-US', { dateStyle: 'short' })
                            : '—'}
                        </td>
                        <td style={{ textAlign: 'right', padding: '6px 8px' }}>
                          {p.attributes?.multipay_payments_made ?? '—'}
                        </td>
                        <td style={{ padding: '6px 8px', color: '#9ca3af' }}>{p.id}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </details>
          </div>
        );
      })}
    </div>
  );
}
