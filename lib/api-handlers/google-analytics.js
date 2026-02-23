/**
 * GET /api/google-analytics?pagePath=/some-path&startDate=2024-01-01&endDate=2024-01-31
 * Returns views per day for the given page path from GA4.
 * Env: GA4_PROPERTY_ID (numeric), GOOGLE_APPLICATION_CREDENTIALS (path to service account JSON)
 * Or: GOOGLE_SERVICE_ACCOUNT_JSON (stringified JSON) for serverless.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const pagePath = (req.query?.pagePath || '').trim() || '/';
  const startDate = (req.query?.startDate || '').trim();
  const endDate = (req.query?.endDate || '').trim();
  const propertyId = req.query?.propertyId || process.env.GA4_PROPERTY_ID;

  if (!startDate || !endDate) {
    return res.status(400).json({
      error: 'Missing startDate or endDate',
      usage: '?pagePath=/pricing&startDate=2024-01-01&endDate=2024-01-31',
    });
  }

  const effectivePropertyId = propertyId || process.env.GA4_PROPERTY_ID;
  const hasCredentialsJson = !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const hasCredentialsPath = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;

  console.log('[google-analytics] Request:', {
    pagePath,
    startDate,
    endDate,
    propertyId: effectivePropertyId || '(missing)',
    hasCredentialsJson,
    hasCredentialsPath,
  });

  if (!effectivePropertyId) {
    console.warn('[google-analytics] Missing GA4_PROPERTY_ID');
    return res.status(400).json({
      error: 'GA4 property not configured',
      message: 'Set GA4_PROPERTY_ID in env or pass propertyId in query.',
      mock: getMockViewsPerDay(startDate, endDate),
    });
  }

  try {
    let BetaAnalyticsDataClient;
    try {
      const mod = await import('@google-analytics/data');
      BetaAnalyticsDataClient = mod.BetaAnalyticsDataClient;
    } catch (importErr) {
      console.warn('[google-analytics] @google-analytics/data not installed:', importErr.message, importErr.stack);
      return res.status(200).json({
        rows: getMockViewsPerDay(startDate, endDate).rows,
        pagePath,
        startDate,
        endDate,
        mock: true,
      });
    }

    let credentials;
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      try {
        credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
        console.log('[google-analytics] Using GOOGLE_SERVICE_ACCOUNT_JSON, client_email:', credentials?.client_email ? '(set)' : '(missing)');
      } catch (parseErr) {
        console.error('[google-analytics] Invalid GOOGLE_SERVICE_ACCOUNT_JSON (not valid JSON):', parseErr.message);
        return res.status(503).json({
          error: 'Invalid GOOGLE_SERVICE_ACCOUNT_JSON',
          details: parseErr.message,
          mock: getMockViewsPerDay(startDate, endDate),
        });
      }
    } else {
      console.log('[google-analytics] Using GOOGLE_APPLICATION_CREDENTIALS path:', process.env.GOOGLE_APPLICATION_CREDENTIALS || '(not set)');
    }

    const client = new BetaAnalyticsDataClient(credentials ? { credentials } : undefined);
    const property = `properties/${String(effectivePropertyId).replace(/^properties\/?/, '')}`;
    console.log('[google-analytics] Calling runReport, property:', property);

    const [response] = await client.runReport({
      property,
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: 'date' },
        { name: 'pagePath' },
      ],
      dimensionFilter: {
        filter: {
          fieldName: 'pagePath',
          stringFilter: {
            matchType: 'CONTAINS',
            value: pagePath,
            caseSensitive: false,
          },
        },
      },
      metrics: [{ name: 'screenPageViews' }],
    });

    const byDate = {};
    (response.rows || []).forEach((row) => {
      const date = row.dimensionValues?.[0]?.value;
      const metric = row.metricValues?.[0]?.value;
      if (date && metric !== undefined) {
        const views = parseInt(metric, 10) || 0;
        byDate[date] = (byDate[date] || 0) + views;
      }
    });

    const rows = Object.entries(byDate)
      .map(([date, views]) => ({ date, views }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return res.status(200).json({ rows, pagePath, startDate, endDate });
  } catch (err) {
    const message = err?.message || String(err);
    const code = err?.code ?? err?.status ?? err?.statusCode;
    const details = err?.details ?? err?.response?.data ?? err?.errors;
    const stack = err?.stack;

    console.error('[google-analytics] FAILED:', {
      message,
      code,
      name: err?.name,
      details: details != null ? (typeof details === 'object' ? JSON.stringify(details) : details) : undefined,
      stack: stack ? stack.split('\n').slice(0, 8).join('\n') : undefined,
    });
    if (details && typeof details === 'object' && !err.details) {
      console.error('[google-analytics] Error details object:', JSON.stringify(details, null, 2));
    }

    const isCredentialError = /credential|auth|403|401|PERMISSION_DENIED|UNAUTHENTICATED/i.test(message) || code === 403 || code === 401;
    return res.status(isCredentialError ? 503 : 500).json({
      error: 'Google Analytics request failed',
      details: message,
      code: code != null ? String(code) : undefined,
      detailsPayload: details != null ? (typeof details === 'object' ? details : { raw: details }) : undefined,
      hint: isCredentialError
        ? 'Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_JSON and grant the service account access to the GA4 property.'
        : undefined,
      mock: getMockViewsPerDay(startDate, endDate),
    });
  }
}

function getMockViewsPerDay(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const rows = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    rows.push({ date, views: Math.floor(Math.random() * 80) + 10 });
  }
  return { rows };
}
