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
  const excludePagePath = (req.query?.excludePagePath || '').trim();
  const pagePaths = (req.query?.pagePaths || '').trim().split(',').map((p) => p.trim()).filter(Boolean);
  const wholeSite = req.query?.wholeSite === '1' || req.query?.wholeSite === 'true';
  const metric = (req.query?.metric || 'screenPageViews').trim().toLowerCase();
  const useSessions = metric === 'sessions';
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
    excludePagePath: excludePagePath || '(none)',
    pagePaths: pagePaths.length ? pagePaths : '(none)',
    metric: useSessions ? 'sessions' : 'screenPageViews',
    wholeSite,
    startDate,
    endDate,
    propertyId: effectivePropertyId || '(missing)',
    hasCredentialsJson,
    hasCredentialsPath,
  });

  if (!effectivePropertyId) {
    console.warn('[google-analytics] Missing GA4_PROPERTY_ID – returning mock data. Set GA4_PROPERTY_ID and GOOGLE_SERVICE_ACCOUNT_JSON in your deployed environment for real data.');
    const mock = getMockViewsPerDay(startDate, endDate, useSessions);
    const payload = wholeSite
      ? { rows: mock.rows.map((r) => ({ date: r.date, eventCount: r.eventCount ?? 0 })), pagePath: '(whole site)', startDate, endDate, wholeSite: true, mock: true }
      : excludePagePath
        ? { rows: mock.rows, pagePath: `(all except ${excludePagePath})`, startDate, endDate, mock: true }
        : pagePaths.length
          ? { rows: mock.rows, pagePath: `(${pagePaths.join(', ')})`, startDate, endDate, mock: true }
          : { rows: mock.rows, pagePath, startDate, endDate, mock: true };
    return res.status(200).json(payload);
  }

  try {
    let BetaAnalyticsDataClient;
    try {
      const mod = await import('@google-analytics/data');
      BetaAnalyticsDataClient = mod.BetaAnalyticsDataClient;
    } catch (importErr) {
      console.warn('[google-analytics] @google-analytics/data not installed:', importErr.message, importErr.stack);
      const mockRows = getMockViewsPerDay(startDate, endDate, useSessions).rows;
      const payload = wholeSite
        ? { rows: mockRows.map((r) => ({ date: r.date, eventCount: r.eventCount ?? 0 })), pagePath: '(whole site)', startDate, endDate, wholeSite: true, mock: true }
        : excludePagePath
          ? { rows: mockRows, pagePath: `(all except ${excludePagePath})`, startDate, endDate, mock: true }
          : pagePaths.length
            ? { rows: mockRows, pagePath: `(${pagePaths.join(', ')})`, startDate, endDate, mock: true }
            : { rows: mockRows, pagePath, startDate, endDate, mock: true };
      return res.status(200).json(payload);
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
    console.log('[google-analytics] Calling runReport (views), property:', property);

    // Whole-site call_booked only (no page path filter)
    if (wholeSite) {
      let eventReportResult = { rows: [] };
      try {
        console.log('[google-analytics] Calling runReport (call_booked whole site)');
        const [eventResult] = await client.runReport({
          property,
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: 'date' }],
          dimensionFilter: {
            filter: {
              fieldName: 'eventName',
              stringFilter: {
                matchType: 'EXACT',
                value: 'call_booked',
                caseSensitive: false,
              },
            },
          },
          metrics: [{ name: 'eventCount' }],
        });
        eventReportResult = eventResult;
      } catch (eventErr) {
        console.warn('[google-analytics] Whole-site event report failed:', eventErr?.message);
      }
      const rows = (eventReportResult.rows || []).map((row) => {
        const date = row.dimensionValues?.[0]?.value;
        const metric = row.metricValues?.[0]?.value;
        const eventCount = date && metric !== undefined ? parseInt(metric, 10) || 0 : 0;
        return { date: date || '', eventCount };
      }).filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date));
      return res.status(200).json({
        rows,
        pagePath: '(whole site)',
        startDate,
        endDate,
        wholeSite: true,
      });
    }

    // Build dimension filter: include pagePath, exclude pagePath, or multiple pagePaths (OR)
    let pagePathFilter;
    if (excludePagePath) {
      pagePathFilter = {
        notExpression: {
          filter: {
            fieldName: 'pagePath',
            stringFilter: { matchType: 'CONTAINS', value: excludePagePath, caseSensitive: false },
          },
        },
      };
    } else if (pagePaths.length > 0) {
      pagePathFilter = {
        orGroup: {
          expressions: pagePaths.map((p) => ({
            filter: {
              fieldName: 'pagePath',
              stringFilter: {
                matchType: 'EXACT',
                value: p,
                caseSensitive: false,
              },
            },
          })),
        },
      };
    } else {
      pagePathFilter = {
        filter: {
          fieldName: 'pagePath',
          stringFilter: { matchType: 'CONTAINS', value: pagePath, caseSensitive: false },
        },
      };
    }

    // Run main report (views or sessions)
    const reportMetric = useSessions ? 'sessions' : 'screenPageViews';
    const [viewsReportResult] = await client.runReport({
      property,
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: 'date' },
        { name: 'pagePath' },
      ],
      dimensionFilter: pagePathFilter,
      metrics: [{ name: reportMetric }],
    });

    const byDate = {};
    const includeByPath = pagePaths.length > 0;
    (viewsReportResult.rows || []).forEach((row) => {
      const date = row.dimensionValues?.[0]?.value;
      const path = row.dimensionValues?.[1]?.value ?? '';
      const metricVal = row.metricValues?.[0]?.value;
      if (date && metricVal !== undefined) {
        const val = parseInt(metricVal, 10) || 0;
        const prev = byDate[date] || { views: 0, sessions: 0 };
        if (useSessions) {
          prev.sessions = (prev.sessions || 0) + val;
        } else {
          prev.views = (prev.views || 0) + val;
        }
        if (includeByPath) {
          prev.byPath = prev.byPath || {};
          const key = path === '/' || path === '' ? '/' : path.startsWith('/pro') ? '/pro' : path;
          prev.byPath[key] = (prev.byPath[key] || 0) + val;
        }
        byDate[date] = prev;
      }
    });

    console.log('[google-analytics] Report rows:', (viewsReportResult.rows || []).length, 'metric:', reportMetric);

    // Run event report separately (only for screenPageViews - not needed for sessions)
    let eventReportResult = { rows: [] };
    if (!useSessions) try {
      console.log('[google-analytics] Calling runReport (call_booked events)');
      const eventPagePathFilter = excludePagePath
        ? {
            notExpression: {
              filter: {
                fieldName: 'pagePath',
                stringFilter: { matchType: 'CONTAINS', value: excludePagePath, caseSensitive: false },
              },
            },
          }
        : pagePaths.length > 0
          ? {
              orGroup: {
                expressions: pagePaths.map((p) => ({
                  filter: {
                    fieldName: 'pagePath',
                    stringFilter: {
                      matchType: 'EXACT',
                      value: p,
                      caseSensitive: false,
                    },
                  },
                })),
              },
            }
          : {
              filter: {
                fieldName: 'pagePath',
                stringFilter: { matchType: 'CONTAINS', value: pagePath, caseSensitive: false },
              },
            };

      const [eventResult] = await client.runReport({
        property,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'date' }, { name: 'eventName' }],
        dimensionFilter: {
          andGroup: {
            expressions: [
              {
                filter: {
                  fieldName: 'eventName',
                  stringFilter: {
                    matchType: 'EXACT',
                    value: 'call_booked',
                    caseSensitive: false,
                  },
                },
              },
              eventPagePathFilter,
            ],
          },
        },
        metrics: [{ name: 'eventCount' }],
      });
      eventReportResult = eventResult;
      console.log('[google-analytics] Event report rows:', (eventResult?.rows || []).length);
    } catch (eventErr) {
      console.warn('[google-analytics] Event report failed (returning views only):', eventErr?.message);
    }

    if (!useSessions) (eventReportResult.rows || []).forEach((row) => {
      const date = row.dimensionValues?.[0]?.value;
      const metric = row.metricValues?.[0]?.value;
      if (date && metric !== undefined) {
        const eventCount = parseInt(metric, 10) || 0;
        if (!byDate[date]) byDate[date] = { views: 0 };
        byDate[date].eventCount = (byDate[date].eventCount || 0) + eventCount;
      }
    });

    const rows = Object.entries(byDate)
      .map(([date, o]) => {
        const r = { date };
        if (useSessions) {
          r.sessions = o.sessions || 0;
        } else {
          r.views = o.views || 0;
          r.eventCount = o.eventCount || 0;
          r.bookingRate = (o.views || 0) > 0 ? Math.round((o.eventCount || 0) / (o.views || 0) * 10000) / 100 : null;
        }
        if (includeByPath && o.byPath) r.byPath = o.byPath;
        return r;
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const responsePagePath = excludePagePath
      ? `(all except ${excludePagePath})`
      : pagePaths.length
        ? `(${pagePaths.join(', ')})`
        : pagePath;
    return res.status(200).json({ rows, pagePath: responsePagePath, startDate, endDate });
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

function getMockViewsPerDay(startDate, endDate, useSessions = false) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const rows = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    if (useSessions) {
      rows.push({ date, sessions: Math.floor(Math.random() * 80) + 10 });
    } else {
      const views = Math.floor(Math.random() * 80) + 10;
      const eventCount = Math.floor(Math.random() * Math.min(views, 15));
      const bookingRate = views > 0 ? Math.round((eventCount / views) * 10000) / 100 : null;
      rows.push({ date, views, eventCount, bookingRate });
    }
  }
  return { rows };
}
