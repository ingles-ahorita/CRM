import React, { useEffect, useState } from "react";
import SectionInfoHint from "../../overview/section-info-hint";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// --- Paid/organic split rule (matches the overview top-of-funnel cards) ---------------
// Paid/ads = any page path CONTAINING "masterclass"; organic = every other page.
const PAID_PATH_TOKEN = "masterclass";
const OPT_IN_EVENT = "form_submit";
const BOOKING_EVENT = "call_booked";
// Opt-in pages where a real opt-in form lives (login/password/checkout forms sit elsewhere
// and would otherwise inflate the count, so the opt-in numerator is scoped to these).
const ADS_OPT_IN_PATHS = "/ads-opt-in-masterclass,/ads-opt-in-masterclass-non-us";
const ORGANIC_OPT_IN_PATHS =
  "/,/pro,/opt-in-demo,/100-frases,/10-errores-opt-in,/50-respuestas-opt-in";
// VSL (video sales letter) pages — the booking-rate denominator ("VSL visitors").
const VSL_PATHS = "/masterclass-job,/ads-new-masterclass-job";

const ADS_COLOR = "#3b82f6";
const ORG_COLOR = "#f59e0b";

function gaDateToISO(s) {
  const raw = String(s || "");
  if (/^\d{8}$/.test(raw))
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

function listDaysISO(startISO, endISO) {
  const out = [];
  const d = new Date(`${startISO}T00:00:00Z`);
  const end = new Date(`${endISO}T00:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function pct(num, den) {
  if (!den || den <= 0) return null;
  const v = (num / den) * 100;
  if (!Number.isFinite(v)) return null;
  return Math.round(Math.min(100, Math.max(0, v)) * 10) / 10;
}

// GA channel groups beginning with "Paid" (plus Cross-network) are paid traffic.
function isPaidChannel(ch) {
  return /paid|cross-network/i.test(String(ch || ""));
}

// Default-dimension payload: rows are { date, sessions }. Aggregate sessions per ISO day.
function sessionsByDay(payload) {
  const m = {};
  for (const r of payload?.rows || []) {
    const iso = gaDateToISO(r?.date);
    if (iso) m[iso] = (m[iso] || 0) + (Number(r?.sessions) || 0);
  }
  return m;
}

// Custom-dimension payload: rows are { dimensions: { date, sessionDefaultChannelGroup }, metric }.
// Split the metric into paid vs organic buckets, keyed by ISO day.
function byDayChannel(payload) {
  const paid = {};
  const org = {};
  for (const r of payload?.rows || []) {
    const iso = gaDateToISO(r?.dimensions?.date);
    if (!iso) continue;
    const v = Number(r?.metric) || 0;
    const bucket = isPaidChannel(r?.dimensions?.sessionDefaultChannelGroup)
      ? paid
      : org;
    bucket[iso] = (bucket[iso] || 0) + v;
  }
  return { paid, org };
}

// Tooltip showing each arm's percentage plus the raw numerator / denominator counts.
function makeCountsTooltip(adsKey, orgKey, counts, noun) {
  return function CountsTooltip({ active, payload, label }) {
    if (!active || !payload || !payload.length) return null;
    const row = payload[0].payload || {};
    const fmt = (v) => (v == null ? "—" : `${v}%`);
    return (
      <div className="rounded border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-medium leading-snug shadow-[0_4px_14px_rgba(15,23,42,0.1)]">
        <div className="font-semibold text-slate-600">{label}</div>
        <div style={{ color: ADS_COLOR }}>
          Ads: {fmt(row[adsKey])}{" "}
          <span className="text-slate-400">
            ({row[counts.adsN] ?? 0} {noun} / {row[counts.adsD] ?? 0})
          </span>
        </div>
        <div style={{ color: ORG_COLOR }}>
          Organic: {fmt(row[orgKey])}{" "}
          <span className="text-slate-400">
            ({row[counts.orgN] ?? 0} {noun} / {row[counts.orgD] ?? 0})
          </span>
        </div>
      </div>
    );
  };
}

function RateChart({ title, subtitle, info, loading, error, data, adsKey, orgKey, yDomain, counts, noun }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase leading-tight tracking-wide text-black">
            {title}
          </div>
          <p className="mt-0.5 text-[9px] font-medium leading-snug text-slate-400">
            {subtitle}
          </p>
        </div>
        <SectionInfoHint text={info} />
      </div>
      {loading ? (
        <div className="mt-2 h-[120px] w-full animate-pulse rounded-md bg-slate-200/70" />
      ) : error ? (
        <p className="mt-2 text-[10px] font-medium text-red-600">{error}</p>
      ) : (
        <div className="mt-2 h-[120px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 8, fill: "#94a3b8" }}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                domain={yDomain}
                tick={{ fontSize: 8, fill: "#94a3b8" }}
                width={30}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip content={makeCountsTooltip(adsKey, orgKey, counts, noun)} />
              <Legend wrapperStyle={{ fontSize: 9 }} iconSize={8} />
              <Line
                type="monotone"
                dataKey={adsKey}
                name="Ads"
                stroke={ADS_COLOR}
                strokeWidth={1.75}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey={orgKey}
                name="Organic"
                stroke={ORG_COLOR}
                strokeWidth={1.75}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/**
 * Daily opt-in rate and booking rate graphs, split by ads vs organic.
 * - Opt-in rate = opt-ins (form_submit on opt-in pages) ÷ all sessions for the arm,
 *   where the arm is decided by page path (paid = "masterclass", organic = rest).
 * - Booking rate = bookings (call_booked) ÷ VSL visitors, split by GA traffic channel
 *   (paid channels vs organic).
 * All data comes from GA4 via /api/google-analytics; tracks the page's date range.
 */
export default function RateGraphs({ rangeBounds, className = "" }) {
  const startISO = rangeBounds?.start
    ? rangeBounds.start.toISOString().slice(0, 10)
    : null;
  const endISO = rangeBounds?.end
    ? rangeBounds.end.toISOString().slice(0, 10)
    : null;
  const [state, setState] = useState({ loading: true, data: [], error: "" });

  useEffect(() => {
    if (!startISO || !endISO) return undefined;
    let cancelled = false;
    const base = { startDate: startISO, endDate: endISO };
    const sess = { ...base, metric: "sessions" };
    const url = (params) =>
      `/api/google-analytics?${new URLSearchParams(params).toString()}`;

    async function load() {
      setState((p) => ({ ...p, loading: true, error: "" }));
      try {
        const fetchJson = async (params) => {
          const res = await fetch(url(params));
          const json = await res.json().catch(() => ({}));
          return res.ok ? json : null;
        };
        const [adsSess, orgSess, adsOpt, orgOpt, vslByChan, bookByChan] =
          await Promise.all([
            // Opt-in denominators: all paid vs all organic sessions (page-based split).
            fetchJson({ ...sess, pagePath: PAID_PATH_TOKEN }),
            fetchJson({ ...sess, excludePagePath: PAID_PATH_TOKEN }),
            // Opt-in numerators: sessions with a form_submit on the opt-in pages.
            fetchJson({ ...sess, eventName: OPT_IN_EVENT, pagePaths: ADS_OPT_IN_PATHS }),
            fetchJson({ ...sess, eventName: OPT_IN_EVENT, pagePaths: ORGANIC_OPT_IN_PATHS }),
            // Booking denominator: VSL-page visitors per day, split by traffic channel.
            fetchJson({
              ...sess,
              pagePaths: VSL_PATHS,
              dimensions: "date,sessionDefaultChannelGroup",
            }),
            // Booking numerator: call_booked per day, split by traffic channel.
            fetchJson({
              ...base,
              eventName: BOOKING_EVENT,
              metricName: "eventCount",
              dimensions: "date,sessionDefaultChannelGroup",
            }),
          ]);
        if (cancelled) return;

        const adsSessD = sessionsByDay(adsSess);
        const orgSessD = sessionsByDay(orgSess);
        const adsOptD = sessionsByDay(adsOpt);
        const orgOptD = sessionsByDay(orgOpt);
        const vsl = byDayChannel(vslByChan);
        const book = byDayChannel(bookByChan);

        const data = listDaysISO(startISO, endISO).map((iso) => ({
          date: iso,
          label: iso.slice(5),
          optInAds: pct(adsOptD[iso] || 0, adsSessD[iso] || 0),
          optInOrg: pct(orgOptD[iso] || 0, orgSessD[iso] || 0),
          bookAds: pct(book.paid[iso] || 0, vsl.paid[iso] || 0),
          bookOrg: pct(book.org[iso] || 0, vsl.org[iso] || 0),
          // Raw counts (numerator / denominator) for tooltips.
          optInAdsN: adsOptD[iso] || 0,
          optInAdsD: adsSessD[iso] || 0,
          optInOrgN: orgOptD[iso] || 0,
          optInOrgD: orgSessD[iso] || 0,
          bookAdsN: book.paid[iso] || 0,
          bookAdsD: vsl.paid[iso] || 0,
          bookOrgN: book.org[iso] || 0,
          bookOrgD: vsl.org[iso] || 0,
        }));
        setState({ loading: false, data, error: "" });
      } catch (e) {
        if (!cancelled)
          setState({ loading: false, data: [], error: e?.message || "Failed to load graphs" });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [startISO, endISO]);

  return (
    <div className={`grid grid-cols-2 gap-2 ${className}`}>
      <RateChart
        title="Opt-in rate"
        subtitle="Opt-ins ÷ all sessions · Ads vs Organic"
        info="Daily. Opt-ins = sessions with a form submit on an opt-in page, divided by all sessions for that arm. Paid/ads = pages containing “masterclass”; organic = all other pages."
        loading={state.loading}
        error={state.error}
        data={state.data}
        adsKey="optInAds"
        orgKey="optInOrg"
        yDomain={[0, 100]}
        counts={{ adsN: "optInAdsN", adsD: "optInAdsD", orgN: "optInOrgN", orgD: "optInOrgD" }}
        noun="opt-ins"
      />
      <RateChart
        title="Booking rate"
        subtitle="Bookings ÷ VSL visitors · Ads vs Organic"
        info="Daily. Bookings (call_booked) divided by VSL-page visitors, both split by GA traffic channel: ads = paid/cross-network channels; organic = all other channels."
        loading={state.loading}
        error={state.error}
        data={state.data}
        adsKey="bookAds"
        orgKey="bookOrg"
        yDomain={[0, "auto"]}
        counts={{ adsN: "bookAdsN", adsD: "bookAdsD", orgN: "bookOrgN", orgD: "bookOrgD" }}
        noun="bookings"
      />
    </div>
  );
}
