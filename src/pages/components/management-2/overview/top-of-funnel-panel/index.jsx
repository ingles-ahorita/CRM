import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip);

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
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
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

function mergeSeriesByDate(rows, field) {
  const m = {};
  for (const r of rows || []) {
    const iso = gaDateToISO(r?.date);
    if (!iso) continue;
    m[iso] = (m[iso] || 0) + (Number(r?.[field]) || 0);
  }
  return m;
}

function shimmer(className = "") {
  return <div className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} />;
}

function MiniBarChart({ color, values, labels, tooltipLabel, shouldAnimate = false }) {
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
    <div className="relative h-[68px] w-full">
      <Bar key={shouldAnimate ? "bars-animated" : "bars-static"} data={data} options={options} />
    </div>
  );
}

const ATTENDANCE_DONUT_BASE_OPTS = {
  responsive: true,
  maintainAspectRatio: true,
  rotation: -90,
  circumference: 360,
  cutout: "78%",
  animation: {
    animateRotate: true,
    animateScale: false,
    duration: 900,
    easing: "easeOutQuart",
  },
  plugins: {
    legend: { display: false },
    tooltip: { enabled: false },
  },
};

function AttendanceRing({ percent }) {
  const pct = Math.min(100, Math.max(0, Number(percent) || 0));

  const data = useMemo(() => {
    if (pct <= 0) {
      return {
        datasets: [
          {
            data: [100],
            backgroundColor: ["#e8ecf1"],
            borderWidth: 0,
            hoverOffset: 0,
          },
        ],
      };
    }
    if (pct >= 100) {
      return {
        datasets: [
          {
            data: [100],
            backgroundColor: ["#10b981"],
            borderWidth: 0,
            hoverOffset: 0,
          },
        ],
      };
    }
    return {
      datasets: [
        {
          data: [pct, 100 - pct],
          backgroundColor: ["#10b981", "#e8ecf1"],
          borderWidth: 0,
          spacing: 0,
          hoverOffset: 0,
        },
      ],
    };
  }, [pct]);

  return (
    <div className="relative h-[84px] w-[84px] shrink-0">
      <Doughnut data={data} options={ATTENDANCE_DONUT_BASE_OPTS} />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="text-[17px] font-extrabold tabular-nums tracking-tight text-slate-900">
          {pct}%
        </span>
      </div>
    </div>
  );
}

export default function TopOfFunnelPanel() {
  const CHART_DAYS = 7;
  const ADS_VSL_PATH = "/ads-new-masterclass-job";
  const ADS_OPT_IN_PATH = "/ads-opt-in-masterclass";
  const ORGANIC_VSL_PATH = "/masterclass-job";
  const ORGANIC_OPT_IN_PATHS = "/pro,/";

  const [gaState, setGaState] = useState({
    loading: true,
    optInAds: null,
    optInOrganic: null,
    bookingAds: null,
    bookingOrganic: null,
    optInBars: [],
    bookingBars: [],
  });
  const [attendanceState, setAttendanceState] = useState({
    loading: true,
    showUpRate: null,
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
        new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
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
    const sessionParams = { ...params, metric: "sessions" };

    async function loadGaRates() {
      setGaState((p) => ({ ...p, loading: true }));
      try {
        const [
          resAdsVsl,
          resAdsOptIn,
          resOrgVsl,
          resOrgOptIn,
          resAdsViews,
          resOrgViews,
        ] = await Promise.all([
          fetch(`/api/google-analytics?${new URLSearchParams({ ...sessionParams, pagePath: ADS_VSL_PATH }).toString()}`),
          fetch(`/api/google-analytics?${new URLSearchParams({ ...sessionParams, pagePath: ADS_OPT_IN_PATH }).toString()}`),
          fetch(`/api/google-analytics?${new URLSearchParams({ ...sessionParams, pagePath: ORGANIC_VSL_PATH }).toString()}`),
          fetch(`/api/google-analytics?${new URLSearchParams({ ...sessionParams, pagePaths: ORGANIC_OPT_IN_PATHS }).toString()}`),
          fetch(`/api/google-analytics?${new URLSearchParams({ ...params, pagePath: ADS_VSL_PATH }).toString()}`),
          fetch(`/api/google-analytics?${new URLSearchParams({ ...params, pagePath: ORGANIC_VSL_PATH }).toString()}`),
        ]);

        const parse = async (res) => {
          const json = await res.json().catch(() => ({}));
          return res.ok ? json : null;
        };
        const [adsVsl, adsOptIn, orgVsl, orgOptIn, adsViews, orgViews] = await Promise.all([
          parse(resAdsVsl),
          parse(resAdsOptIn),
          parse(resOrgVsl),
          parse(resOrgOptIn),
          parse(resAdsViews),
          parse(resOrgViews),
        ]);

        if (cancelled) return;
        const sum = (rows, field) => (rows || []).reduce((a, r) => a + (Number(r?.[field]) || 0), 0);

        const sessAdsVsl = sum(adsVsl?.rows, "sessions");
        const sessAdsOptIn = sum(adsOptIn?.rows, "sessions");
        const sessOrgVsl = sum(orgVsl?.rows, "sessions");
        const sessOrgOptIn = sum(orgOptIn?.rows, "sessions");
        const adsViewsTotal = sum(adsViews?.rows, "views");
        const adsEventsTotal = sum(adsViews?.rows, "eventCount");
        const orgViewsTotal = sum(orgViews?.rows, "views");
        const orgEventsTotal = sum(orgViews?.rows, "eventCount");

        const optInAds = sessAdsOptIn > 0 ? (sessAdsVsl / sessAdsOptIn) * 100 : null;
        const optInOrganic = sessOrgOptIn > 0 ? (sessOrgVsl / sessOrgOptIn) * 100 : null;
        const bookingAds = adsViewsTotal > 0 ? (adsEventsTotal / adsViewsTotal) * 100 : null;
        const bookingOrganic = orgViewsTotal > 0 ? (orgEventsTotal / orgViewsTotal) * 100 : null;

        const adsVslByDay = mergeSeriesByDate(adsVsl?.rows, "sessions");
        const adsOptByDay = mergeSeriesByDate(adsOptIn?.rows, "sessions");
        const orgVslByDay = mergeSeriesByDate(orgVsl?.rows, "sessions");
        const orgOptByDay = mergeSeriesByDate(orgOptIn?.rows, "sessions");
        const adsViewsByDay = mergeSeriesByDate(adsViews?.rows, "views");
        const adsEventsByDay = mergeSeriesByDate(adsViews?.rows, "eventCount");
        const orgViewsByDay = mergeSeriesByDate(orgViews?.rows, "views");
        const orgEventsByDay = mergeSeriesByDate(orgViews?.rows, "eventCount");

        const optInBars = dayKeys.map((k) => {
          const vsl = (adsVslByDay[k] || 0) + (orgVslByDay[k] || 0);
          const opt = (adsOptByDay[k] || 0) + (orgOptByDay[k] || 0);
          return clampPct(opt > 0 ? (vsl / opt) * 100 : 0);
        });
        const bookingBars = dayKeys.map((k) => {
          const views = (adsViewsByDay[k] || 0) + (orgViewsByDay[k] || 0);
          const events = (adsEventsByDay[k] || 0) + (orgEventsByDay[k] || 0);
          return clampPct(views > 0 ? (events / views) * 100 : 0);
        });

        setGaState({
          loading: false,
          optInAds,
          optInOrganic,
          bookingAds,
          bookingOrganic,
          optInBars,
          bookingBars,
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
          next3Dates.push(refD.toLocaleDateString("en-CA", { timeZone: refTz }));
        }
        const next3Set = new Set(next3Dates);
        const refHour = parseInt(
          now.toLocaleString("en-US", { timeZone: refTz, hour: "numeric", hour12: false }),
          10,
        ) || 0;
        const refMinute = parseInt(
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
                const countableBlocks = Math.max(0, lastBlockHour - firstCountableBlockHour + 1);
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
          totalAvailableSlots > 0 ? Math.round((totalBusySlots / totalAvailableSlots) * 100) : null;
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

  const attendancePct = clampPct(attendanceState.showUpRate);
  const attendancePresentDisplay =
    attendanceState.attendancePresent != null
      ? attendanceState.attendancePresent
      : attendanceState.numberOfStudents;
  const attendanceTotalDisplay =
    attendanceState.attendanceTotal != null
      ? attendanceState.attendanceTotal
      : attendanceState.numberOfClasses;
  const hasAttendanceRatio =
    attendancePresentDisplay != null && attendanceTotalDisplay != null;
  const attendanceMainLabel = hasAttendanceRatio
    ? `${attendancePresentDisplay} / ${attendanceTotalDisplay}`
    : attendanceState.showUpRate != null
      ? formatPct(attendanceState.showUpRate)
      : attendanceState.error
        ? "—"
        : "0 / 0";
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
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
    >
      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-bold tracking-tight text-[#374151]">
            Top of funnel
          </h2>
          {/* <span className="inline-flex rounded-full bg-[#ede9fe] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#8b5cf6] ring-1 ring-violet-200/80">
            CURRENT
          </span> */}
        </div>
        {/* <p className="mt-2 max-w-4xl text-[13px] font-medium italic leading-relaxed text-[#9ca3af]">
          Combines Opt-in &amp; booking, Yesterday&apos;s avg attendance, and
          Occupancy cards — with bars instead of dashes.
        </p> */}
      </div>

      <div className="rounded-xl border-[2px] border-dashed border-slate-300 bg-slate-50/35 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Card 1 */}
          <div className="flex flex-col rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
            <div className="text-[14px] font-bold uppercase tracking-wide text-black">
              OPT-IN CONVERSION
            </div>
            {gaState.loading ? (
              <>
                {shimmer("mt-3 h-5 w-full")}
                {shimmer("mt-3 h-[68px] w-full")}
              </>
            ) : (
              <>
                <div className="mt-3 flex items-baseline justify-between gap-2 text-[13px] font-bold">
                  <span className="text-[#3b82f6]">Ads {formatPct(gaState.optInAds)}</span>
                  <span className="text-[#f59e0b]">Organic {formatPct(gaState.optInOrganic)}</span>
                </div>
                <MiniBarChart
                  color="#3b82f6"
                  values={gaState.optInBars}
                  labels={dayLabels}
                  tooltipLabel="Opt-in rate"
                  shouldAnimate={shouldAnimateBars}
                />
              </>
            )}
            <p className="mt-1 text-[11px] font-medium text-[#9ca3af]">
              VSL sessions → opt-ins
            </p>
          </div>

          {/* Card 2 */}
          <div className="flex flex-col rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
            <div className="text-[14px] font-bold uppercase tracking-wide text-black">
              BOOKING RATE
            </div>
            {gaState.loading ? (
              <>
                {shimmer("mt-3 h-5 w-full")}
                {shimmer("mt-3 h-[68px] w-full")}
              </>
            ) : (
              <>
                <div className="mt-3 flex items-baseline justify-between gap-2 text-[13px] font-bold">
                  <span className="text-[#3b82f6]">Ads {formatPct(gaState.bookingAds)}</span>
                  <span className="text-[#f59e0b]">Organic {formatPct(gaState.bookingOrganic)}</span>
                </div>
                <MiniBarChart
                  color="#f59e0b"
                  values={gaState.bookingBars}
                  labels={dayLabels}
                  tooltipLabel="Booking rate"
                  shouldAnimate={shouldAnimateBars}
                />
              </>
            )}
            <p className="mt-1 text-[11px] font-medium text-[#9ca3af]">
              Opt-ins → bookings
            </p>
          </div>

          {/* Card 3 */}
          <div className="flex flex-col rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
            <div className="text-[14px] font-bold uppercase tracking-wide text-black">
              YESTERDAY&apos;S ATTENDANCE
            </div>
            {attendanceState.loading ? (
              <div className="mt-3 flex flex-1 items-center gap-5">
                {shimmer("h-[84px] w-[84px] rounded-full")}
                <div className="min-w-0 flex-1">
                  {shimmer("h-8 w-24")}
                  {shimmer("mt-2 h-4 w-28")}
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-1 items-center gap-5">
                <AttendanceRing percent={attendancePct} />
                <div className="min-w-0 flex-1">
                  <div className="text-[28px] font-bold tabular-nums leading-none tracking-tight text-[#111827]">
                    {attendanceMainLabel}
                  </div>
                  <p className="mt-2 text-[12px] font-medium text-[#9ca3af]">
                    {attendanceState.error ? "Academic app unavailable" : "From academic app"}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Card 4 */}
          <div className="flex flex-col rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
            <div className="text-[14px] font-bold uppercase tracking-wide text-black">
              OCCUPANCY (NEXT 3 DAYS)
            </div>
            <div className="mt-8 flex flex-1 flex-col justify-center">
              {occupancyState.loading ? (
                <>
                  {shimmer("h-5 w-full rounded-full")}
                  {shimmer("mt-2.5 h-4 w-24")}
                </>
              ) : (
                <>
                  <div className="h-5 w-full overflow-hidden rounded-full bg-[#e8ecf1]">
                    <div
                      className="h-full rounded-full bg-[#3b82f6] transition-all duration-[900ms] ease-out"
                      style={{ width: `${animatedOccupancyPct}%` }}
                      title={formatPct(occupancyState.occupancyPct)}
                    />
                  </div>
                  <p className="mt-2.5 text-[14px] font-medium text-[#9ca3af]">
                    {occupancyState.occupancyPct != null ? `${occupancyState.occupancyPct}% occupied` : "—"}
                  </p>
                </>
              )}
            </div>
            <p className="mt-auto pt-4 text-[11px] font-medium leading-relaxed text-[#9ca3af]">
              {occupancyState.loading
                ? "Loading availability..."
                : occupancyState.availableSlots != null
                  ? `${occupancyState.availableSlots} free slots • 45-min blocks`
                  : "—"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
