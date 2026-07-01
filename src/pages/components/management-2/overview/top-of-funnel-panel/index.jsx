import React, { useEffect, useMemo, useRef, useState } from "react";
import SectionInfoHint from "../section-info-hint";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

function clampPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function formatPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

function gaDateToISO(s) {
  const raw = String(s || "");
  if (/^\d{8}$/.test(raw))
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

function getLastNDaysISO(days) {
  const out = [];
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i -= 1) {
    const x = new Date(d);
    x.setUTCDate(x.getUTCDate() - i);
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
}

// A GA4 default channel group is "paid" if it's a Paid* channel or Cross-network.
function isPaidChannel(ch) {
  return /paid|cross-network/i.test(String(ch || ""));
}

// Custom-dimension rows ({ dimensions: { date, sessionDefaultChannelGroup }, metric }).
// Returns per-day paid/organic maps plus paid/organic totals.
function splitByDayChannel(payload) {
  const paid = {};
  const org = {};
  let paidTotal = 0;
  let orgTotal = 0;
  for (const r of payload?.rows || []) {
    const iso = gaDateToISO(r?.dimensions?.date);
    const v = Number(r?.metric) || 0;
    const paidRow = isPaidChannel(r?.dimensions?.sessionDefaultChannelGroup);
    if (paidRow) paidTotal += v;
    else orgTotal += v;
    if (!iso) continue;
    const bucket = paidRow ? paid : org;
    bucket[iso] = (bucket[iso] || 0) + v;
  }
  return { paid, org, paidTotal, orgTotal };
}

// Compact arm block: colored dot + label with the % on the first row, and the raw
// count on its own row beneath so nothing overflows the narrow card.
function RateRow({ color, label, pct, count }) {
  return (
    <div className="leading-tight">
      <div className="flex items-center justify-between gap-1">
        <span className="inline-flex items-center gap-1 text-[10px] font-bold" style={{ color }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
          {label}
        </span>
        <span className="text-[12px] font-bold tabular-nums" style={{ color }}>{pct}</span>
      </div>
      {count ? (
        <div className="text-right text-[9px] font-medium tabular-nums text-slate-400">{count}</div>
      ) : null}
    </div>
  );
}

function shimmer(className = "") {
  return (
    <div className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} />
  );
}

function MiniBarChart({
  color,
  values,
  labels,
  tooltipLabel,
  shouldAnimate = false,
  chartHeight = 68,
}) {
  const max = Math.max(...values, 1);

  const data = useMemo(
    () => ({
      labels: ["", "", "", "", "", "", ""],
      datasets: [
        {
          data: values,
          backgroundColor: color,
          borderWidth: 0,
          borderRadius: 4,
          barPercentage: 0.72,
          categoryPercentage: 0.88,
        },
      ],
    }),
    [color, values],
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: shouldAnimate
        ? {
            duration: 1500,
            easing: "easeOutCubic",
            delay: (ctx) => (ctx.type === "data" ? ctx.dataIndex * 70 : 0),
          }
        : false,
      animations: shouldAnimate
        ? {
            y: {
              from: 0,
            },
          }
        : undefined,
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: "rgba(17,24,39,0.92)",
          titleFont: { size: 11, weight: "600" },
          bodyFont: { size: 11, weight: "600" },
          displayColors: false,
          callbacks: {
            title: (items) => {
              const idx = items?.[0]?.dataIndex ?? 0;
              return labels?.[idx] || "";
            },
            label: (ctx) => `${tooltipLabel}: ${formatPct(ctx.raw)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { display: false },
          border: { display: false },
        },
        y: {
          display: false,
          min: 0,
          max: max * 1.2,
          grid: { display: false },
          border: { display: false },
        },
      },
    }),
    [max, labels, shouldAnimate, tooltipLabel],
  );

  return (
    <div className="relative w-full" style={{ height: chartHeight }}>
      <Bar
        key={shouldAnimate ? "bars-animated" : "bars-static"}
        data={data}
        options={options}
      />
    </div>
  );
}

export default function TopOfFunnelPanel() {
  const CHART_DAYS = 7;
  // Ads vs organic is decided by GA traffic channel (sessionDefaultChannelGroup): a session
  // is "ads" if it arrived via a paid/cross-network channel, "organic" otherwise. This is a
  // property of where the visitor came from — consistent across both cards and mutually
  // exclusive (a session has exactly one channel).
  //   Opt-in rate  = opt-ins (form_submit on opt-in pages) ÷ all sessions, per channel.
  //   Booking rate = bookings (call_booked) ÷ opt-ins, per channel.
  const OPT_IN_EVENT = "form_submit";
  const BOOKING_EVENT = "call_booked";
  const CHANNEL_DIM = "sessionDefaultChannelGroup";
  // Opt-in landing pages where a real opt-in form fires. Login/password/checkout forms live
  // on other paths and are excluded so the opt-in count is not inflated.
  const OPT_IN_PATHS =
    "/ads-opt-in-masterclass,/ads-opt-in-masterclass-non-us,/,/pro,/opt-in-demo,/100-frases,/10-errores-opt-in,/50-respuestas-opt-in";

  const [gaState, setGaState] = useState({
    loading: true,
    optInAds: null,
    optInOrganic: null,
    bookingAds: null,
    bookingOrganic: null,
    optInBars: [],
    bookingBars: [],
    // Raw counts (numerator / denominator) for display next to each %.
    counts: null,
  });
  const [attendanceState, setAttendanceState] = useState({
    loading: true,
    showUpRate: null,
    avgAttendance: null,
    numberOfClasses: null,
    numberOfStudents: null,
    attendancePresent: null,
    attendanceTotal: null,
    error: null,
  });
  const [occupancyState, setOccupancyState] = useState({
    loading: true,
    availableSlots: null,
    occupancyPct: null,
    error: null,
  });
  const [animatedOccupancyPct, setAnimatedOccupancyPct] = useState(0);
  const panelRef = useRef(null);
  const [shouldAnimateBars, setShouldAnimateBars] = useState(false);

  const dayKeys = useMemo(() => getLastNDaysISO(CHART_DAYS), []);
  const dayLabels = useMemo(
    () =>
      dayKeys.map((d) =>
        new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
      ),
    [dayKeys],
  );

  useEffect(() => {
    let cancelled = false;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (CHART_DAYS - 1));
    const startStr = startDate.toISOString().slice(0, 10);
    const endStr = endDate.toISOString().slice(0, 10);
    const params = { startDate: startStr, endDate: endStr };

    async function loadGaRates() {
      setGaState((p) => ({ ...p, loading: true }));
      try {
        const byChannelDay = { ...params, dimensions: `date,${CHANNEL_DIM}` };
        const [resSessions, resOptIns, resBookings] = await Promise.all([
          // Denominator: ALL sessions, per day and per traffic channel.
          fetch(
            `/api/google-analytics?${new URLSearchParams({ ...byChannelDay, metric: "sessions" }).toString()}`,
          ),
          // Opt-ins: SESSIONS in which a form_submit fired on an opt-in page, per day and
          // channel. Counted as sessions (not raw events) so it matches the sessions-based
          // denominator — a session that submits twice still counts once.
          fetch(
            `/api/google-analytics?${new URLSearchParams({ ...byChannelDay, metric: "sessions", eventName: OPT_IN_EVENT, pagePaths: OPT_IN_PATHS }).toString()}`,
          ),
          // Bookings: call_booked events, per day and channel.
          fetch(
            `/api/google-analytics?${new URLSearchParams({ ...byChannelDay, metricName: "eventCount", eventName: BOOKING_EVENT }).toString()}`,
          ),
        ]);

        const parse = async (res) => {
          const json = await res.json().catch(() => ({}));
          return res.ok ? json : null;
        };
        const [sessions, optIns, bookings] = await Promise.all([
          parse(resSessions),
          parse(resOptIns),
          parse(resBookings),
        ]);

        if (cancelled) return;
        const sess = splitByDayChannel(sessions);
        const opt = splitByDayChannel(optIns);
        const book = splitByDayChannel(bookings);

        const rate = (num, den) => (den > 0 ? (num / den) * 100 : null);
        // Opt-in rate = opt-ins ÷ all sessions, per channel.
        const optInAds = rate(opt.paidTotal, sess.paidTotal);
        const optInOrganic = rate(opt.orgTotal, sess.orgTotal);
        // Booking rate = bookings ÷ opt-ins, per channel.
        const bookingAds = rate(book.paidTotal, opt.paidTotal);
        const bookingOrganic = rate(book.orgTotal, opt.orgTotal);

        const optInBars = dayKeys.map((k) => {
          const subs = (opt.paid[k] || 0) + (opt.org[k] || 0);
          const total = (sess.paid[k] || 0) + (sess.org[k] || 0);
          return clampPct(total > 0 ? (subs / total) * 100 : 0);
        });
        const bookingBars = dayKeys.map((k) => {
          const bk = (book.paid[k] || 0) + (book.org[k] || 0);
          const optK = (opt.paid[k] || 0) + (opt.org[k] || 0);
          return clampPct(optK > 0 ? (bk / optK) * 100 : 0);
        });

        setGaState({
          loading: false,
          optInAds,
          optInOrganic,
          bookingAds,
          bookingOrganic,
          optInBars,
          bookingBars,
          counts: {
            optInAds: { n: opt.paidTotal, d: sess.paidTotal },
            optInOrg: { n: opt.orgTotal, d: sess.orgTotal },
            bookAds: { n: book.paidTotal, d: opt.paidTotal },
            bookOrg: { n: book.orgTotal, d: opt.orgTotal },
          },
        });
      } catch (e) {
        if (cancelled) return;
        setGaState({
          loading: false,
          optInAds: null,
          optInOrganic: null,
          bookingAds: null,
          bookingOrganic: null,
          optInBars: Array(CHART_DAYS).fill(0),
          bookingBars: Array(CHART_DAYS).fill(0),
          counts: null,
        });
      }
    }

    loadGaRates();
    return () => {
      cancelled = true;
    };
  }, [dayKeys]);

  useEffect(() => {
    let cancelled = false;
    async function loadAttendance() {
      setAttendanceState((p) => ({ ...p, loading: true }));
      try {
        const res = await fetch("/api/academic-stats");
        const raw = await res.text();
        let data = {};
        if (raw.trim()) data = JSON.parse(raw);
        if (cancelled) return;
        setAttendanceState({
          loading: false,
          showUpRate: data?.showUpRate ?? null,
          avgAttendance: data?.avgAttendance ?? null,
          numberOfClasses: data?.numberOfClasses ?? null,
          numberOfStudents: data?.numberOfStudents ?? null,
          attendancePresent: data?.attendancePresent ?? null,
          attendanceTotal: data?.attendanceTotal ?? null,
          error: data?.error || null,
        });
      } catch (e) {
        if (cancelled) return;
        setAttendanceState({
          loading: false,
          showUpRate: null,
          avgAttendance: null,
          numberOfClasses: null,
          numberOfStudents: null,
          attendancePresent: null,
          attendanceTotal: null,
          error: e?.message || "Failed to load attendance",
        });
      }
    }
    loadAttendance();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadOccupancy() {
      setOccupancyState((p) => ({ ...p, loading: true }));
      try {
        const res = await fetch("/api/closer-availability");
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setOccupancyState({
            loading: false,
            availableSlots: null,
            occupancyPct: null,
            error: data?.error || `HTTP ${res.status}`,
          });
          return;
        }

        const now = new Date();
        const refTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const refToday = now.toLocaleDateString("en-CA", { timeZone: refTz });
        const refD = new Date(now);
        const next3Dates = [refToday];
        for (let i = 1; i < 3; i += 1) {
          refD.setDate(refD.getDate() + 1);
          next3Dates.push(
            refD.toLocaleDateString("en-CA", { timeZone: refTz }),
          );
        }
        const next3Set = new Set(next3Dates);
        const refHour =
          parseInt(
            now.toLocaleString("en-US", {
              timeZone: refTz,
              hour: "numeric",
              hour12: false,
            }),
            10,
          ) || 0;
        const refMinute =
          parseInt(
            now.toLocaleString("en-US", { timeZone: refTz, minute: "numeric" }),
            10,
          ) || 0;
        const refMinsIntoDay = refHour * 60 + refMinute;
        const firstCountableBlockHour = Math.ceil((refMinsIntoDay + 60) / 60);

        let totalAvailableSlots = 0;
        let totalBusySlots = 0;
        (data?.hoursGrid || []).forEach((row) => {
          (row?.days || []).forEach((day) => {
            if (day?.date && next3Set.has(day.date)) {
              const isToday = day.date === refToday;
              const availableSlots = Math.round(day.hours || 0);
              const busySlots = Math.floor(day.busyHours ?? 0);
              let avail;
              let busy;
              if (isToday && firstCountableBlockHour >= 24) {
                avail = 0;
                busy = 0;
              } else if (isToday) {
                const lastBlockHour = 20;
                const countableBlocks = Math.max(
                  0,
                  lastBlockHour - firstCountableBlockHour + 1,
                );
                avail = Math.min(availableSlots, countableBlocks);
                busy = Math.min(busySlots, countableBlocks);
              } else {
                avail = availableSlots;
                busy = busySlots;
              }
              totalAvailableSlots += avail;
              totalBusySlots += busy;
            }
          });
        });

        const freeSlots = Math.max(0, totalAvailableSlots - totalBusySlots);
        const occupancyPct =
          totalAvailableSlots > 0
            ? Math.round((totalBusySlots / totalAvailableSlots) * 100)
            : null;
        setOccupancyState({
          loading: false,
          availableSlots: freeSlots,
          occupancyPct,
          error: null,
        });
      } catch (e) {
        if (cancelled) return;
        setOccupancyState({
          loading: false,
          availableSlots: null,
          occupancyPct: null,
          error: e?.message || "Failed to load occupancy",
        });
      }
    }
    loadOccupancy();
    return () => {
      cancelled = true;
    };
  }, []);

  const avgAttendanceDisplay =
    attendanceState.avgAttendance != null
      ? Number(attendanceState.avgAttendance).toFixed(1)
      : "0.0";
  const attendancePresentDisplay = attendanceState.attendancePresent ?? 0;
  const attendanceClassesDisplay = attendanceState.numberOfClasses ?? 0;
  const attendanceStudentsDisplay = attendanceState.numberOfStudents ?? 0;
  const occupancyPct = clampPct(occupancyState.occupancyPct);

  useEffect(() => {
    if (occupancyState.loading) {
      setAnimatedOccupancyPct(0);
      return;
    }
    const target = clampPct(occupancyState.occupancyPct);
    setAnimatedOccupancyPct(0);
    const t = setTimeout(() => setAnimatedOccupancyPct(target), 40);
    return () => clearTimeout(t);
  }, [occupancyState.loading, occupancyState.occupancyPct]);

  useEffect(() => {
    if (shouldAnimateBars) return undefined;
    const node = panelRef.current;
    if (!node) return undefined;

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries?.[0];
        if (entry?.isIntersecting) {
          setShouldAnimateBars(true);
          obs.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [shouldAnimateBars]);

  return (
    <div
      ref={panelRef}
      className="border border-slate-200 rounded-2xl p-2 bg-white"
    >
      <div className="mb-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 text-[18px] font-bold tracking-tight text-[#374151]">
            Top of funnel
          </h2>
          <SectionInfoHint text="Ads and booking activity, yesterday's show rate, and how full upcoming call slots look." />
          {/* <span className="inline-flex rounded-full bg-[#ede9fe] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#8b5cf6] ring-1 ring-violet-200/80">
            CURRENT
          </span> */}
        </div>
        {/* <p className="mt-2 max-w-4xl text-[13px] font-medium italic leading-relaxed text-[#9ca3af]">
          Combines Opt-in &amp; booking, Yesterday&apos;s avg attendance, and
          Occupancy cards — with bars instead of dashes.
        </p> */}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Card 1 */}
        <div className="flex min-h-0 min-w-0 flex-col rounded-xl border border-slate-200/90 bg-white p-2 shadow-sm">
          <div className="flex items-start justify-between gap-1">
            <div className="text-[10px] font-bold uppercase leading-tight tracking-wide text-black">
              OPT-IN CONVERSION
            </div>
            <SectionInfoHint text="Last 7 days. Opt-ins ÷ all sessions, per traffic channel. Opt-ins = sessions with a form submit on an opt-in page. Ads = paid/cross-network channels; organic = all other channels. Counts shown as opt-ins / sessions." />
          </div>
          {gaState.loading ? (
            <>
              {shimmer("mt-2 h-4 w-full")}
              {shimmer("mt-2 h-[52px] w-full")}
            </>
          ) : (
            <>
              <div className="mt-2 flex flex-col gap-1.5">
                <RateRow
                  color="#3b82f6"
                  label="Ads"
                  pct={formatPct(gaState.optInAds)}
                  count={gaState.counts && `${gaState.counts.optInAds.n.toLocaleString()} / ${gaState.counts.optInAds.d.toLocaleString()}`}
                />
                <RateRow
                  color="#f59e0b"
                  label="Organic"
                  pct={formatPct(gaState.optInOrganic)}
                  count={gaState.counts && `${gaState.counts.optInOrg.n.toLocaleString()} / ${gaState.counts.optInOrg.d.toLocaleString()}`}
                />
              </div>
              <MiniBarChart
                color="#3b82f6"
                values={gaState.optInBars}
                labels={dayLabels}
                tooltipLabel="Opt-in rate"
                shouldAnimate={shouldAnimateBars}
                chartHeight={52}
              />
            </>
          )}
          <p className="mt-0.5 text-[9px] font-medium leading-snug text-[#9ca3af]">
            Opt-ins ÷ sessions · by channel
          </p>
        </div>

        {/* Card 2 */}
        <div className="flex min-h-0 min-w-0 flex-col rounded-xl border border-slate-200/90 bg-white p-2 shadow-sm">
          <div className="flex items-start justify-between gap-1">
            <div className="text-[10px] font-bold uppercase leading-tight tracking-wide text-black">
              BOOKING RATE
            </div>
            <SectionInfoHint text="Last 7 days. Bookings ÷ opt-ins, per traffic channel. Bookings = call_booked events. Ads = paid/cross-network channels; organic = all other channels. Counts shown as bookings / opt-ins." />
          </div>
          {gaState.loading ? (
            <>
              {shimmer("mt-2 h-4 w-full")}
              {shimmer("mt-2 h-[52px] w-full")}
            </>
          ) : (
            <>
              <div className="mt-2 flex flex-col gap-1.5">
                <RateRow
                  color="#3b82f6"
                  label="Ads"
                  pct={formatPct(gaState.bookingAds)}
                  count={gaState.counts && `${gaState.counts.bookAds.n.toLocaleString()} / ${gaState.counts.bookAds.d.toLocaleString()}`}
                />
                <RateRow
                  color="#f59e0b"
                  label="Organic"
                  pct={formatPct(gaState.bookingOrganic)}
                  count={gaState.counts && `${gaState.counts.bookOrg.n.toLocaleString()} / ${gaState.counts.bookOrg.d.toLocaleString()}`}
                />
              </div>
              <MiniBarChart
                color="#f59e0b"
                values={gaState.bookingBars}
                labels={dayLabels}
                tooltipLabel="Booking rate"
                shouldAnimate={shouldAnimateBars}
                chartHeight={52}
              />
            </>
          )}
          <p className="mt-0.5 text-[9px] font-medium leading-snug text-[#9ca3af]">
            Opt-ins → bookings
          </p>
        </div>

        {/* Card 3 */}
        <div className="flex min-h-0 min-w-0 flex-col rounded-xl border border-slate-200/90 bg-white p-2 shadow-sm">
          <div className="text-[10px] font-bold uppercase leading-tight tracking-wide text-black">
            YESTERDAY&apos;S ATTENDANCE
          </div>
          {attendanceState.loading ? (
            <div className="mt-2 flex flex-1 items-center gap-2">
              {shimmer("h-[56px] w-[56px] rounded-full")}
              <div className="min-w-0 flex-1">
                {shimmer("h-6 w-16")}
                {shimmer("mt-1.5 h-3 w-full")}
              </div>
            </div>
          ) : attendanceState.error ? (
            <div className="mt-2 flex min-h-[56px] items-center text-[11px] font-semibold leading-snug text-[#9ca3af]">
              Academic app unavailable
            </div>
          ) : (
            <div className="mt-2 flex flex-1 flex-col justify-center gap-2">
              <div className="flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[9px] font-bold uppercase leading-none tracking-wide text-[#9ca3af]">
                    Avg / class
                  </div>
                  <div className="mt-0.5 text-[20px] font-extrabold leading-none tracking-tight text-[#111827]">
                    {avgAttendanceDisplay}
                  </div>
                </div>
                <div className="text-right text-[9px] font-semibold leading-tight text-[#9ca3af]">
                  {attendancePresentDisplay} check-ins
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <div className="rounded-md bg-slate-50 px-1.5 py-1">
                  <div className="text-[11px] font-extrabold leading-none tabular-nums text-[#111827]">
                    {attendanceClassesDisplay}
                  </div>
                  <div className="mt-0.5 text-[8px] font-bold uppercase leading-none tracking-wide text-[#9ca3af]">
                    Classes
                  </div>
                </div>
                <div className="rounded-md bg-slate-50 px-1.5 py-1">
                  <div className="text-[11px] font-extrabold leading-none tabular-nums text-[#111827]">
                    {attendanceStudentsDisplay}
                  </div>
                  <div className="mt-0.5 text-[8px] font-bold uppercase leading-none tracking-wide text-[#9ca3af]">
                    Students
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Card 4 */}
        <div className="flex min-h-0 min-w-0 flex-col rounded-xl border border-slate-200/90 bg-white p-2 shadow-sm">
          <div className="text-[10px] font-bold uppercase leading-tight tracking-wide text-black">
            OCCUPANCY (NEXT 3 DAYS)
          </div>
          <div className="mt-2 flex min-h-[52px] flex-1 flex-col justify-center">
            {occupancyState.loading ? (
              <>
                {shimmer("h-4 w-full rounded-full")}
                {shimmer("mt-2 h-3 w-20")}
              </>
            ) : (
              <>
                <div className="h-4 w-full overflow-hidden rounded-full bg-[#e8ecf1]">
                  <div
                    className="h-full rounded-full bg-[#3b82f6] transition-all duration-[900ms] ease-out"
                    style={{ width: `${animatedOccupancyPct}%` }}
                    title={formatPct(occupancyState.occupancyPct)}
                  />
                </div>
                <p className="mt-1.5 text-[11px] font-medium text-[#9ca3af]">
                  {occupancyState.occupancyPct != null
                    ? `${occupancyState.occupancyPct}% occupied`
                    : "—"}
                </p>
              </>
            )}
          </div>
          <p className="mt-auto pt-1.5 text-[9px] font-medium leading-snug text-[#9ca3af]">
            {occupancyState.loading
              ? "Loading availability..."
              : occupancyState.availableSlots != null
                ? `${occupancyState.availableSlots} free slots • 45-min blocks`
                : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}
