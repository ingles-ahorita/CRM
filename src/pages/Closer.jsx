import {
  LeadItem,
  LeadItemCompact,
  LeadListHeader,
} from "./components/LeadItem";
import CloserDashboardCards from "./components/CloserDashboardCards";
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { HeaderTabsAndToolbar } from "./components/Header";
import { fetchAll } from "../utils/fetchLeads";
import { EndShiftModal } from "./components/EndShiftModal";
import { StartShiftModal } from "./components/StartShiftModal";
import { useRealtimeLeads } from "../hooks/useRealtimeLeads";
import { supabase } from "../lib/supabaseClient";
import { useSimpleAuth } from "../useSimpleAuth";
import CloserHeader from "./components/closer/closer-header";
import * as DateHelpers from "../utils/dateHelpers";
import CloserHeaderShimmer from "./components/closer/shimmers/closer-header";
import CloserBody from "./components/closer/closer-body";
import CloserAside from "./components/closer/closer-aside";
import {
  getCloserCommissionBreakdown,
  getCloserCommissionForMonth,
  shiftMonthKeyByMonths,
} from "../lib/closerCommission";

export default function Closer() {
  // Ensure the page starts at the top on first entry
  const didInitialScrollRef = useRef(false);
  useEffect(() => {
    if (didInitialScrollRef.current) return;
    didInitialScrollRef.current = true;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const [isEndShiftModalOpen, setIsEndShiftModalOpen] = useState(false);
  const [isStartShiftModalOpen, setIsStartShiftModalOpen] = useState(false);
  const [currentShift, setCurrentShift] = useState(null);
  const [isShiftActive, setIsShiftActive] = useState(false);

  const { email, userName, logout } = useSimpleAuth();

  const { closer } = useParams(); // 👈 this is the "best way" to get it
  const navigate = useNavigate();

  const handleStartShift = (shiftData) => {
    setCurrentShift(shiftData);
    setIsShiftActive(true);
    setIsStartShiftModalOpen(false);
  };

  const handleEndShift = () => {
    setIsEndShiftModalOpen(true);
  };

  const handleShiftEnded = () => {
    setCurrentShift(null);
    setIsShiftActive(false);
    setIsEndShiftModalOpen(false);
  };

  const [headerState, setHeaderState] = useState({
    showSearch: false,
    searchTerm: "",
    activeTab: "today",
    sortBy: "call_date",
    sortOrder: "asc",
    startDate: "",
    endDate: "",
    filters: {
      confirmed: false,
      cancelled: false,
      noShow: false,
      noShowState: "",
      transferred: false,
      noManychatId: false,
      noConversions: false,
    },
    currentCloser: closer,
    onEndShift: handleEndShift,
    onStartShift: () => setIsStartShiftModalOpen(true),
    isShiftActive: isShiftActive,
  });

  const [dataState, setDataState] = useState({
    leads: [],
    loading: true,
    calltimeLoading: false,
    setterMap: {},
    closerMap: {},
    closerList: [],
  });

  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const prevLoadingRef = useRef(true);
  useEffect(() => {
    const prev = prevLoadingRef.current;
    if (prev && !dataState.loading) setLastUpdatedAt(Date.now());
    prevLoadingRef.current = dataState.loading;
  }, [dataState.loading]);

  const monthLabel = new Date().toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
  const lastUpdatedLabel = lastUpdatedAt
    ? `Last updated: ${new Date(lastUpdatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
    : "Last updated: —";

  // const [promoLabel, setPromoLabel] = useState("");
  const [bodyStats, setBodyStats] = useState({
    loading: true,
    commissionThisMonth: null,
    commissionBreakdown: null,
    commissionDelta: null,
    commissionDeltaDirection: "up",
    bestMonthValue: null,
    bestMonthSubtext: null,
    bestMonthFooter: null,
  });

  const [pifLeaderboard, setPifLeaderboard] = useState({
    loading: true,
    entries: [],
    titleRight: "This month",
    footer: "",
  });

  const [showUpLeaderboard, setShowUpLeaderboard] = useState({
    loading: true,
    entries: [],
  });

  const [aovByCloser, setAovByCloser] = useState({
    loading: true,
    entries: [],
  });
  const [aovRange, setAovRange] = useState("this_month");

  const [payoffOpps, setPayoffOpps] = useState({
    loading: true,
    entries: [],
  });

  const [recoveredAside, setRecoveredAside] = useState({
    loading: true,
    range: "thisWeek",
    stats: { noShows: 0, recontacted: 0, rebooked: 0, showUps: 0, closed: 0 },
    neverContactedCount: 0,
    leads: [],
  });

  const [historicPerf, setHistoricPerf] = useState({
    loading: true,
    range: "6mo",
    labels: [],
    closingBars: [],
    pifBars: [],
    avgClosingRate: "—",
    avgPifRate: "—",
  });

  const [metricsTable, setMetricsTable] = useState({
    loading: true,
    mtdLabel: "",
    historicLabel: "TILL DATE",
    mtd: { showUp: { showed: 0, confirmed: 0 }, closing: { closed: 0, showedUp: 0 }, pif: { pif: 0, total: 0 } },
    historic: { showUp: { showed: 0, confirmed: 0 }, closing: { closed: 0, showedUp: 0 }, pif: { pif: 0, total: 0 } },
  });

  const formatMoney = (n) => {
    const num = Number(n);
    if (!Number.isFinite(num)) return "—";
    return `$${Math.round(num).toLocaleString()}`;
  };

  const checkActiveShift = async () => {
    try {
      const { data, error } = await supabase
        .from("closer_shifts")
        .select("*")
        .eq("closer_id", closer)
        .eq("status", "open")
        .order("start_time", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data && !error) {
        setCurrentShift(data);
        setIsShiftActive(true);
      } else {
        setCurrentShift(null);
        setIsShiftActive(false);
      }
    } catch (err) {
      console.error("Error checking active shift:", err);
    }
  };

  // Enable real-time updates for this closer
  useRealtimeLeads(
    dataState,
    setDataState,
    headerState.activeTab,
    null,
    closer,
    headerState.sortBy,
  );

  // useEffect(() => {
  //   let cancelled = false;

  //   async function loadPromo() {
  //     try {
  //       const ym = DateHelpers.getYearMonthInTimezone(
  //         new Date(),
  //         DateHelpers.DEFAULT_TIMEZONE,
  //       );
  //       const range = DateHelpers.getMonthRangeInTimezone(
  //         new Date(),
  //         DateHelpers.DEFAULT_TIMEZONE,
  //       );
  //       const startISO = range?.startDate?.toISOString?.();
  //       const endISO = range?.endDate?.toISOString?.();

  //       const avg = (nums) => {
  //         const values = (nums || []).filter((n) => Number.isFinite(n));
  //         if (values.length === 0) return null;
  //         const sum = values.reduce((a, b) => a + b, 0);
  //         return sum / values.length;
  //       };

  //       // 1) Prefer REAL current-month data for this closer from outcome_log
  //       if (closer && startISO && endISO) {
  //         const { data: logs, error: logsError } = await supabase
  //           .from("outcome_log")
  //           .select(
  //             "id, commission, purchase_date, calls!inner!call_id(closer_id), offers!inner!offer_id(installments, weekly_classes)",
  //           )
  //           .eq("outcome", "yes")
  //           .eq("calls.closer_id", closer)
  //           .gte("purchase_date", startISO)
  //           .lte("purchase_date", endISO)
  //           .then((r) => (r.error ? { data: [], error: r.error } : r));

  //         if (logsError) throw logsError;

  //         const rows = logs || [];
  //         const pifComms = rows
  //           .filter((r) => Number(r?.offers?.installments) === 0)
  //           .map((r) => Number(r?.commission));
  //         const downsellComms = rows
  //           .filter(
  //             (r) =>
  //               r?.offers?.weekly_classes !== null &&
  //               r?.offers?.weekly_classes !== undefined,
  //           )
  //           .map((r) => Number(r?.commission));

  //         const pifAvg = avg(pifComms);
  //         const downsellAvg = avg(downsellComms);

  //         if (pifAvg != null && downsellAvg != null && downsellAvg > 0) {
  //           const pif = Math.round(pifAvg);
  //           const downsell = Math.round(downsellAvg);
  //           const ratio = pif / downsell;
  //           const ratioText = `${Math.round(ratio * 10) / 10}x`;
  //           const label = `PIF - $${pif} commission vs Downsell - $${downsell} • Close PE: earn ${ratioText} more`;
  //           if (!cancelled) setPromoLabel(label);
  //           return;
  //         }
  //       }

  //       // 2) Fallback to offer-config baseline (same for all closers)
  //       const { data, error } = await supabase
  //         .from("offers")
  //         .select(
  //           "id, name, installments, weekly_classes, base_commission, payoff_commission, active",
  //         );
  //       if (error) throw error;

  //       const list = (data || []).filter((o) => o?.active !== false);

  //       const pifOffers = list.filter((o) => Number(o?.installments) === 0);
  //       const downsellOffers = list.filter(
  //         (o) => o?.weekly_classes !== null && o?.weekly_classes !== undefined,
  //       );

  //       const getCommission = (o) => {
  //         const p = Number(o?.payoff_commission);
  //         const b = Number(o?.base_commission);
  //         if (Number.isFinite(p) && p > 0) return p;
  //         if (Number.isFinite(b) && b > 0) return b;
  //         return null;
  //       };

  //       const pifBest = pifOffers
  //         .map((o) => ({ offer: o, commission: getCommission(o) }))
  //         .filter((x) => x.commission != null)
  //         .sort((a, b) => b.commission - a.commission)[0];

  //       const downsellBest = downsellOffers
  //         .map((o) => ({ offer: o, commission: getCommission(o) }))
  //         .filter((x) => x.commission != null)
  //         .sort((a, b) => a.commission - b.commission)[0];

  //       if (!pifBest?.commission || !downsellBest?.commission) {
  //         if (!cancelled) setPromoLabel("");
  //         return;
  //       }

  //       const pif = Math.round(pifBest.commission);
  //       const downsell = Math.round(downsellBest.commission);
  //       const ratio = downsell > 0 ? pif / downsell : null;
  //       const ratioText = ratio ? `${Math.round(ratio * 10) / 10}x` : "—";

  //       const label = `PIF - $${pif} commission vs Downsell - $${downsell} • Close PE: earn ${ratioText} more`;
  //       if (!cancelled) setPromoLabel(label);
  //     } catch (e) {
  //       console.warn("[Closer] promoLabel calc failed:", e?.message || e);
  //       if (!cancelled) setPromoLabel("");
  //     }
  //   }

  //   loadPromo();
  //   return () => {
  //     cancelled = true;
  //   };
  // }, [closer]);

  useEffect(() => {
    let cancelled = false;
    async function loadBodyStats() {
      if (!closer) return;
      setBodyStats((prev) => ({ ...prev, loading: true }));

      try {
        const ym = DateHelpers.getYearMonthInTimezone(
          new Date(),
          DateHelpers.DEFAULT_TIMEZONE,
        );
        const currentMonthKey =
          ym?.monthKey ??
          `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
        const prevMonthKey = shiftMonthKeyByMonths(currentMonthKey, -1);

        const [currentBreakdown, prevTotal] = await Promise.all([
          getCloserCommissionBreakdown(closer, currentMonthKey),
          prevMonthKey ? getCloserCommissionForMonth(closer, prevMonthKey) : Promise.resolve(0),
        ]);

        const base = currentBreakdown.base ?? 0;
        const payoff = currentBreakdown.payoffIncrements ?? 0;
        const second = currentBreakdown.secondInstallments ?? 0;
        const refundsAbs = Math.abs(currentBreakdown.refunds ?? 0);
        const sameMonthRefundsAbs = Math.abs(currentBreakdown.sameMonthRefunds ?? 0);
        const refundTotalAbs = refundsAbs + sameMonthRefundsAbs;
        const commissionThisMonthNum = currentBreakdown.total ?? 0;

        const breakdownStr = `Base ${formatMoney(base)} + ${formatMoney(payoff + second)} payoffs - ${formatMoney(refundTotalAbs)} refunds`;
        const deltaStr =
          prevTotal && Number.isFinite(prevTotal)
            ? `vs ${formatMoney(prevTotal)} last month`
            : "vs — last month";
        const deltaDirection =
          prevTotal && Number.isFinite(prevTotal)
            ? commissionThisMonthNum >= prevTotal
              ? "up"
              : "down"
            : "up";

        const monthsToScan = 24;
        const monthKeys = [];
        for (let i = 0; i < monthsToScan; i++) {
          const mk = shiftMonthKeyByMonths(currentMonthKey, -i);
          if (mk) monthKeys.push(mk);
        }
        const totals = await Promise.all(
          monthKeys.map((mk) => getCloserCommissionForMonth(closer, mk)),
        );
        let bestIdx = 0;
        for (let i = 1; i < totals.length; i++) {
          if ((totals[i] ?? 0) > (totals[bestIdx] ?? 0)) bestIdx = i;
        }
        const bestMonthKey = monthKeys[bestIdx];
        const bestTotal = totals[bestIdx] ?? 0;

        let bestPurchases = null;
        if (bestMonthKey) {
          const [yy, mm] = bestMonthKey.split("-").map(Number);
          const monthDate = new Date(Date.UTC(yy, mm - 1, 15));
          const range = DateHelpers.getMonthRangeInTimezone(
            monthDate,
            DateHelpers.DEFAULT_TIMEZONE,
          );
          const startISO = range?.startDate?.toISOString();
          const endISO = range?.endDate?.toISOString();
          if (startISO && endISO) {
            const { count } = await supabase
              .from("outcome_log")
              .select("id, calls!inner!call_id(closer_id)", {
                count: "exact",
                head: true,
              })
              .eq("outcome", "yes")
              .eq("calls.closer_id", closer)
              .gte("purchase_date", startISO)
              .lte("purchase_date", endISO);
            if (typeof count === "number") bestPurchases = count;
          }
        }

        const [bestY, bestM] = (bestMonthKey || currentMonthKey).split("-");
        const bestLabelDate = new Date(Date.UTC(Number(bestY), Number(bestM) - 1, 1));
        const bestMonthLabel = bestLabelDate.toLocaleString(undefined, {
          month: "long",
          year: "numeric",
        });
        const bestSubtext = `${bestMonthLabel}${bestPurchases != null ? ` - ${bestPurchases} purchases` : ""}`;

        // const bestFooter =
        //   commissionThisMonthNum >= bestTotal && bestTotal > 0
        //     ? "Set a new record this month!"
        //     : "Beat your record this month!";

        if (cancelled) return;
        setBodyStats({
          loading: false,
          commissionThisMonth: formatMoney(commissionThisMonthNum),
          commissionBreakdown: breakdownStr,
          commissionDelta: deltaStr,
          commissionDeltaDirection: deltaDirection,
          bestMonthValue: formatMoney(bestTotal),
          bestMonthSubtext: bestSubtext,
          bestMonthFooter: "",
        });
      } catch (e) {
        console.warn("[Closer] body stats load failed:", e?.message || e);
        if (cancelled) return;
        setBodyStats((prev) => ({ ...prev, loading: false }));
      }
    }

    loadBodyStats();
    return () => {
      cancelled = true;
    };
  }, [closer]);

  useEffect(() => {
    let cancelled = false;

    const getRange = () => {
      const now = new Date();
      if (recoveredAside.range === "thisWeek") {
        const { weekStart, weekEnd } = DateHelpers.getWeekBoundsUTC(now);
        return { start: weekStart.toISOString(), end: weekEnd.toISOString() };
      }
      if (recoveredAside.range === "lastWeek") {
        const { weekStart, weekEnd } = DateHelpers.getWeekBoundsForOffset(1);
        return { start: weekStart.toISOString(), end: weekEnd.toISOString() };
      }
      // mtd
      const monthRange = DateHelpers.getMonthRangeInTimezone(now, "UTC");
      return { start: monthRange.startDate.toISOString(), end: monthRange.endDate.toISOString() };
    };

    async function loadRecoveredAside() {
      if (!closer) return;
      const { start, end } = getRange();
      setRecoveredAside((p) => ({ ...p, loading: true }));

      const [
        noShowsRes,
        neverContactedRes,
        recontactedRes,
        rebookedRes,
        showUpsRes,
        closedRes,
        listRes,
      ] = await Promise.all([
        supabase
          .from("calls")
          .select("id", { count: "exact", head: true })
          .eq("closer_id", closer)
          .eq("confirmed", true)
          .eq("showed_up", false)
          .neq("cancelled", true)
          .gte("call_date", start)
          .lte("call_date", end),
        supabase
          .from("calls")
          .select("id", { count: "exact", head: true })
          .eq("closer_id", closer)
          .eq("confirmed", true)
          .eq("showed_up", false)
          .neq("cancelled", true)
          .is("no_show_state", null)
          .gte("call_date", start)
          .lte("call_date", end),
        supabase
          .from("calls")
          .select("id", { count: "exact", head: true })
          .eq("closer_id", closer)
          .eq("no_show_state", "contacted")
          .eq("confirmed", true)
          .eq("showed_up", false)
          .neq("cancelled", true)
          .gte("call_date", start)
          .lte("call_date", end),
        supabase
          .from("calls")
          .select("id", { count: "exact", head: true })
          .eq("closer_id", closer)
          .eq("recovered", true)
          .neq("cancelled", true)
          .gte("book_date", start)
          .lte("book_date", end),
        supabase
          .from("calls")
          .select("id", { count: "exact", head: true })
          .eq("closer_id", closer)
          .eq("recovered", true)
          .eq("showed_up", true)
          .neq("cancelled", true)
          .gte("call_date", start)
          .lte("call_date", end),
        supabase
          .from("outcome_log")
          .select("id, calls!inner!call_id(closer_id, recovered)")
          .eq("outcome", "yes")
          .gte("purchase_date", start)
          .lte("purchase_date", end)
          .then((r) => (r.error ? { data: [] } : r)),
        // list: recovered/rebooked leads in this range
        supabase
          .from("calls")
          .select("id,lead_id,book_date,leads(id,name,email,phone)")
          .eq("closer_id", closer)
          .eq("recovered", true)
          .neq("cancelled", true)
          .gte("book_date", start)
          .lte("book_date", end)
          .order("book_date", { ascending: false })
          .limit(5)
          .then((r) => (r.error ? { data: [] } : r)),
      ]);

      const closedCount = (closedRes.data || []).filter(
        (r) => String(r.calls?.closer_id) === String(closer) && r.calls?.recovered === true,
      ).length;

      const fmtAge = (iso) => {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "—";
        const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
        if (days <= 0) return "Today";
        if (days === 1) return "1 day ago";
        return `${days} days ago`;
      };

      const leads = (listRes.data || []).map((c) => ({
        leadId: c?.leads?.id ?? c?.lead_id ?? null,
        email: c?.leads?.email ?? c?.email ?? null,
        name: c?.leads?.name || c?.name || c?.leads?.email || c?.email || "—",
        ageLabel: fmtAge(c.book_date),
        actionLabel: "Recovered",
        actionVariant: "success",
      }));

      if (cancelled) return;
      setRecoveredAside((p) => ({
        ...p,
        loading: false,
        stats: {
          noShows: noShowsRes.count ?? 0,
          recontacted: recontactedRes.count ?? 0,
          rebooked: rebookedRes.count ?? 0,
          showUps: showUpsRes.count ?? 0,
          closed: closedCount,
        },
        neverContactedCount: neverContactedRes.count ?? 0,
        leads,
      }));
    }

    loadRecoveredAside();
    return () => {
      cancelled = true;
    };
  }, [closer, recoveredAside.range]);

  useEffect(() => {
    let cancelled = false;

    const getMonths = (rangeKey) => {
      const count = rangeKey === "3mo" ? 3 : rangeKey === "6mo" ? 6 : 12;
      const now = new Date();
      const base = new Date(now.getFullYear(), now.getMonth(), 1);
      const months = [];
      for (let i = count - 1; i >= 0; i--) {
        const d = new Date(base);
        d.setMonth(d.getMonth() - i);
        months.push(d);
      }
      return months;
    };

    const monthLabelShort = (date) => date.toLocaleString(undefined, { month: "short" });
    const monthKeyUTC = (date) =>
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

    const fmtPct = (r) => {
      if (r == null || !Number.isFinite(r)) return "—";
      const v = Math.round(r * 1000) / 10;
      return `${String(v).endsWith(".0") ? Math.round(v) : v}%`;
    };

    async function loadHistoricPerformance() {
      if (!closer) return;

      setHistoricPerf((p) => ({ ...p, loading: true }));

      try {
        const months = getMonths(historicPerf.range);
        const labels = months.map(monthLabelShort);
        const firstMonth = months[0];
        const lastMonth = months[months.length - 1];
        const firstRange = DateHelpers.getMonthRangeInTimezone(firstMonth, "UTC");
        const lastRange = DateHelpers.getMonthRangeInTimezone(lastMonth, "UTC");
        const startISO = firstRange?.startDate?.toISOString?.();
        const endISO = lastRange?.endDate?.toISOString?.();
        if (!startISO || !endISO) throw new Error("Missing month range");

        const [{ data: calls }, { data: yesLogs }] = await Promise.all([
          supabase
            .from("calls")
            .select("call_date,confirmed,showed_up,cancelled")
            .eq("closer_id", closer)
            .gte("call_date", startISO)
            .lte("call_date", endISO)
            .then((r) => (r.error ? { data: [] } : r)),
          supabase
            .from("outcome_log")
            .select("purchase_date,PIF,calls!inner!call_id(closer_id),offers!offer_id(installments)")
            .eq("outcome", "yes")
            .gte("purchase_date", startISO)
            .lte("purchase_date", endISO)
            .eq("calls.closer_id", closer)
            .then((r) => (r.error ? { data: [] } : r)),
        ]);

        const callList = calls || [];
        const saleList = yesLogs || [];

        const byMonth = new Map();
        for (const m of months) {
          byMonth.set(monthKeyUTC(m), {
            showedUp: 0,
            sales: 0,
            pifSales: 0,
          });
        }

        const isTrue = (v) => v === true || v === "true";

        for (const c of callList) {
          if (!c?.call_date) continue;
          if (c?.cancelled === true) continue;
          if (!isTrue(c?.confirmed)) continue;
          const d = new Date(c.call_date);
          const key = monthKeyUTC(d);
          const cur = byMonth.get(key);
          if (!cur) continue;
          if (isTrue(c.showed_up)) cur.showedUp += 1;
        }

        for (const r of saleList) {
          if (!r?.purchase_date) continue;
          const d = new Date(r.purchase_date);
          const key = monthKeyUTC(d);
          const cur = byMonth.get(key);
          if (!cur) continue;
          cur.sales += 1;
          const inst = Number(r?.offers?.installments);
          const isPif = isTrue(r?.PIF) || (Number.isFinite(inst) && inst === 0);
          if (isPif) cur.pifSales += 1;
        }

        const closingRates = months.map((m) => {
          const cur = byMonth.get(monthKeyUTC(m));
          if (!cur || cur.showedUp <= 0) return null;
          return cur.sales / cur.showedUp;
        });

        const pifRates = months.map((m) => {
          const cur = byMonth.get(monthKeyUTC(m));
          if (!cur || cur.sales <= 0) return null;
          return cur.pifSales / cur.sales;
        });

        const avg = (arr) => {
          const nums = (arr || []).filter((n) => Number.isFinite(n));
          if (!nums.length) return null;
          return nums.reduce((a, b) => a + b, 0) / nums.length;
        };

        const closingBars = closingRates.map((r) => (r == null ? 0 : Math.max(0, Math.min(1, r))));
        const pifBars = pifRates.map((r) => (r == null ? 0 : Math.max(0, Math.min(1, r))));

        if (cancelled) return;
        setHistoricPerf((p) => ({
          ...p,
          loading: false,
          labels,
          closingBars,
          pifBars,
          avgClosingRate: fmtPct(avg(closingRates)),
          avgPifRate: fmtPct(avg(pifRates)),
        }));
      } catch (e) {
        console.warn("[Closer] Historic performance load failed:", e?.message || e);
        if (cancelled) return;
        setHistoricPerf((p) => ({
          ...p,
          loading: false,
          labels: [],
          closingBars: [],
          pifBars: [],
          avgClosingRate: "—",
          avgPifRate: "—",
        }));
      }
    }

    loadHistoricPerformance();
    return () => {
      cancelled = true;
    };
  }, [closer, historicPerf.range]);

  useEffect(() => {
    let cancelled = false;

    const isTrue = (v) => v === true || v === "true";

    async function loadMetricsTable() {
      if (!closer) return;
      setMetricsTable((p) => ({ ...p, loading: true }));

      try {
        const now = new Date();
        const monthRange = DateHelpers.getMonthRangeInTimezone(now, "UTC");
        const startISO = monthRange?.startDate?.toISOString?.();
        const endISO = monthRange?.endDate?.toISOString?.();
        if (!startISO || !endISO) throw new Error("Missing month range");

        const mtdEndISO = now.toISOString() < endISO ? now.toISOString() : endISO;

        const [{ data: callsMtd }, { data: callsAll }, { data: salesMtd }, { data: salesAll }] =
          await Promise.all([
            supabase
              .from("calls")
              .select("confirmed,showed_up,cancelled,call_date")
              .eq("closer_id", closer)
              .gte("call_date", startISO)
              .lte("call_date", mtdEndISO)
              .then((r) => (r.error ? { data: [] } : r)),
            supabase
              .from("calls")
              .select("confirmed,showed_up,cancelled")
              .eq("closer_id", closer)
              .then((r) => (r.error ? { data: [] } : r)),
            supabase
              .from("outcome_log")
              .select("purchase_date,PIF,calls!inner!call_id(closer_id),offers!offer_id(installments)")
              .eq("outcome", "yes")
              .gte("purchase_date", startISO)
              .lte("purchase_date", mtdEndISO)
              .eq("calls.closer_id", closer)
              .then((r) => (r.error ? { data: [] } : r)),
            supabase
              .from("outcome_log")
              .select("PIF,calls!inner!call_id(closer_id),offers!offer_id(installments)")
              .eq("outcome", "yes")
              .eq("calls.closer_id", closer)
              .then((r) => (r.error ? { data: [] } : r)),
          ]);

        const cleanCallsMtd = (callsMtd || []).filter((c) => c?.cancelled !== true);
        const cleanCallsAll = (callsAll || []).filter((c) => c?.cancelled !== true);

        const confirmedMtd = cleanCallsMtd.filter((c) => isTrue(c.confirmed)).length;
        const showedMtd = cleanCallsMtd.filter((c) => isTrue(c.confirmed) && isTrue(c.showed_up)).length;
        const showedUpMtd = cleanCallsMtd.filter((c) => isTrue(c.showed_up)).length;

        const confirmedAll = cleanCallsAll.filter((c) => isTrue(c.confirmed)).length;
        const showedAll = cleanCallsAll.filter((c) => isTrue(c.confirmed) && isTrue(c.showed_up)).length;
        const showedUpAll = cleanCallsAll.filter((c) => isTrue(c.showed_up)).length;

        const salesM = salesMtd || [];
        const salesA = salesAll || [];

        const countPif = (rows) => {
          let total = 0;
          let pif = 0;
          for (const r of rows) {
            total += 1;
            const inst = Number(r?.offers?.installments);
            const isPifSale = isTrue(r?.PIF) || (Number.isFinite(inst) && inst === 0);
            if (isPifSale) pif += 1;
          }
          return { pif, total };
        };

        const pifM = countPif(salesM);
        const pifH = countPif(salesA);

        const mtdLabel = `${now.toLocaleString(undefined, { month: "short" }).toUpperCase()} 1-${now.getUTCDate()}`;

        if (cancelled) return;
        setMetricsTable({
          loading: false,
          mtdLabel,
          historicLabel: "TILL DATE",
          mtd: {
            showUp: { showed: showedMtd, confirmed: confirmedMtd },
            closing: { closed: salesM.length, showedUp: showedUpMtd },
            pif: pifM,
          },
          historic: {
            showUp: { showed: showedAll, confirmed: confirmedAll },
            closing: { closed: salesA.length, showedUp: showedUpAll },
            pif: pifH,
          },
        });
      } catch (e) {
        console.warn("[Closer] metrics table load failed:", e?.message || e);
        if (cancelled) return;
        setMetricsTable((p) => ({ ...p, loading: false }));
      }
    }

    loadMetricsTable();
    return () => {
      cancelled = true;
    };
  }, [closer]);

  useEffect(() => {
    let cancelled = false;

    async function loadPifLeaderboard() {
      // wait for closer map so we can label rows
      if (!dataState?.closerMap || Object.keys(dataState.closerMap).length === 0) return;

      setPifLeaderboard((p) => ({ ...p, loading: true }));

      try {
        const ym = DateHelpers.getYearMonthInTimezone(new Date(), DateHelpers.DEFAULT_TIMEZONE);
        const monthKey =
          ym?.monthKey ??
          `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
        const range = DateHelpers.getMonthRangeInTimezone(
          new Date(
            Date.UTC(
              parseInt(monthKey.slice(0, 4), 10),
              parseInt(monthKey.slice(5, 7), 10) - 1,
              15,
            ),
          ),
          DateHelpers.DEFAULT_TIMEZONE,
        );
        const startISO = range?.startDate?.toISOString?.();
        const endISO = range?.endDate?.toISOString?.();
        if (!startISO || !endISO) throw new Error("Missing month range");

        const { data: yesLogs } = await supabase
          .from("outcome_log")
          .select("id, calls!inner!call_id(closer_id), offers!offer_id(installments)")
          .eq("outcome", "yes")
          .gte("purchase_date", startISO)
          .lte("purchase_date", endISO)
          .then((r) => (r.error ? { data: [] } : r));

        const rows = yesLogs || [];
        const byCloser = new Map();
        for (const r of rows) {
          const cid = r?.calls?.closer_id;
          if (!cid) continue;
          const cur = byCloser.get(cid) || { total: 0, pif: 0 };
          cur.total += 1;
          const inst = r?.offers?.installments;
          if (inst !== null && inst !== undefined && Number(inst) === 0) cur.pif += 1;
          byCloser.set(cid, cur);
        }

        const list = Array.from(byCloser.entries()).map(([cid, v]) => {
          const rate = v.total > 0 ? Math.round((v.pif / v.total) * 1000) / 10 : null;
          const rateText =
            rate == null ? "—" : `${String(rate).endsWith(".0") ? Math.round(rate) : rate}%`;
          const name = dataState.closerMap?.[String(cid)] || dataState.closerMap?.[cid] || `Closer ${cid}`;
          return {
            closerId: cid,
            name,
            percent: rateText,
            subtitle: `${v.pif} / ${v.total} PIF`,
            isYou: String(cid) === String(closer),
            _rate: rate ?? -1,
            _pif: v.pif,
            _total: v.total,
          };
        });

        list.sort((a, b) => (b._rate - a._rate) || (b._total - a._total));

        const top5 = list.slice(0, 5);

        const top = top5[0];
        const you = list.find((x) => x.isYou);
        let footer = "";
        if (top && you && top._rate >= 0 && you._rate >= 0) {
          const gap = Math.max(0, Math.round((top._rate - you._rate) * 10) / 10);
          // How many additional PIF closes are needed so that:
          // (you._pif + x) / (you._total + x) >= (top._rate / 100)
          // Solving yields: x >= (r*t - p) / (1 - r)
          // (Important: adding a PIF also increases total.)
          const need = (() => {
            const r = top._rate / 100;
            if (!Number.isFinite(r) || r <= 0) return 0;
            if (r >= 1) return you._rate >= 100 ? 0 : null;
            if (you._total === 0) return 1; 
            const numer = r * you._total - you._pif;
            if (!Number.isFinite(numer) || numer <= 0) return 0;
            const x = numer / (1 - r);
            return Math.max(0, Math.ceil(x));
          })();
          footer = `Gap to #1: ${gap}%${need != null ? ` • Close ${need} more PIFs to catch up` : ""}`;
        }

        if (cancelled) return;
        setPifLeaderboard({
          loading: false,
          entries: top5,
          titleRight: "This month",
          footer,
        });
      } catch (e) {
        console.warn("[Closer] PIF leaderboard load failed:", e?.message || e);
        if (cancelled) return;
        setPifLeaderboard((p) => ({ ...p, loading: false, entries: [], footer: "" }));
      }
    }

    loadPifLeaderboard();
    return () => {
      cancelled = true;
    };
  }, [closer, Object.keys(dataState?.closerMap || {}).length]);

  useEffect(() => {
    let cancelled = false;

    async function loadAovByCloser() {
      if (!dataState?.closerMap || Object.keys(dataState.closerMap).length === 0) return;

      setAovByCloser((p) => ({ ...p, loading: true }));

      try {
        const ym = DateHelpers.getYearMonthInTimezone(new Date(), DateHelpers.DEFAULT_TIMEZONE);
        const monthKey =
          ym?.monthKey ??
          `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;

        const shiftMonthKey = (mk, delta) => {
          const [y, m] = String(mk).split("-").map(Number);
          if (!Number.isFinite(y) || !Number.isFinite(m)) return mk;
          const d = new Date(Date.UTC(y, m - 1 + delta, 15));
          return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        };

        const monthKeyForRange = aovRange === "last_month" ? shiftMonthKey(monthKey, -1) : monthKey;

        const shouldDateFilter = aovRange !== "all_time";
        const range = shouldDateFilter
          ? DateHelpers.getMonthRangeInTimezone(
              new Date(
                Date.UTC(
                  parseInt(monthKeyForRange.slice(0, 4), 10),
                  parseInt(monthKeyForRange.slice(5, 7), 10) - 1,
                  15,
                ),
              ),
              DateHelpers.DEFAULT_TIMEZONE,
            )
          : null;
        const startISO = range?.startDate?.toISOString?.();
        const endISO = range?.endDate?.toISOString?.();
        if (shouldDateFilter && (!startISO || !endISO)) throw new Error("Missing month range");

        const baseSelect =
          "commission,discount,purchase_date,payoff_date,kajabi_payoff_id,PIF,calls!inner!call_id(closer_id),offers!offer_id(price,installments,base_commission,payoff_commission)";

        const fetchPage = async (from, to) => {
          let q = supabase.from("outcome_log").select(baseSelect).eq("outcome", "yes");
          if (shouldDateFilter) q = q.gte("purchase_date", startISO).lte("purchase_date", endISO);
          // Paging for all_time (or large ranges)
          q = q.order("purchase_date", { ascending: false, nullsFirst: false }).range(from, to);
          const res = await q;
          return res?.error ? [] : res?.data || [];
        };

        let rows = [];
        if (shouldDateFilter) {
          rows = await fetchPage(0, 9999);
        } else {
          // "All time" can be large; fetch multiple pages up to a safe cap.
          const pageSize = 1000;
          const maxRows = 20000;
          for (let offset = 0; offset < maxRows; offset += pageSize) {
            const page = await fetchPage(offset, offset + pageSize - 1);
            rows.push(...page);
            if (page.length < pageSize) break;
          }
        }
        const adjustedBase = (offer, discount) => {
          if (!offer || offer.base_commission == null) return null;
          const base = Number(offer.base_commission);
          if (!Number.isFinite(base)) return null;
          if (discount == null || discount === "") return base;
          const d = parseFloat(String(discount).replace(/%/g, "").trim());
          if (!Number.isFinite(d)) return base;
          return base - (base * d) / 100;
        };

        const pifCommission = (row) => {
          const offer = row?.offers || null;
          const payoff = Number(offer?.payoff_commission);
          return Number.isFinite(payoff) ? payoff : null;
        };

        // Single-installment commission (first installment credit) for multipay.
        const installmentCommission = (row) => {
          const offer = row?.offers || null;
          return adjustedBase(offer, row?.discount);
        };

        const commissionForSale = (row) => {
          const offer = row?.offers || null;
          const inst = Number(offer?.installments);
          const isPifOffer = Number.isFinite(inst) && inst === 0;

          // Multipay: closer earns only first 2 installments => base * 2
          const base = adjustedBase(offer, row?.discount);
          if (base == null) return Number(row?.commission) || 0;

          // IMPORTANT (month filter correctness):
          // Do not "upgrade" a sale to payoff_commission just because it *eventually* paid off.
          // Otherwise last_month/this_month numbers drift as payoffs happen later.
          // Only treat it as payoff_commission when it is inherently a PIF offer (installments=0),
          // or as a legacy fallback when payoff is linked but payoff_date is missing.
          if (
            (isPifOffer || (row?.kajabi_payoff_id && !row?.payoff_date)) &&
            offer?.payoff_commission != null
          ) {
            const payoff = Number(offer.payoff_commission);
            if (Number.isFinite(payoff)) return payoff;
          }

          return base * 2;
        };

        const byCloser = new Map();
        for (const r of rows) {
          const cid = r?.calls?.closer_id;
          if (!cid) continue;
          const cur =
            byCloser.get(cid) || {
              sum: 0,
              sales: 0,
              // For AOV (Management-style): average offer price per sale
              aovValueSum: 0,
              // For AOC buckets (closer-specific):
              pifSum: 0,
              pifCount: 0,
              mainInstSum: 0,
              mainInstCount: 0,
              studentInstSum: 0,
              studentInstCount: 0,
            };
          cur.sum += commissionForSale(r); // keep AOC logic intact
          cur.sales += 1;

          // AOV should match ManagementPage: avg offer price (not commission)
          const offerPrice = Number(r?.offers?.price ?? 0);
          if (Number.isFinite(offerPrice) && offerPrice > 0) {
            cur.aovValueSum += offerPrice;
          }

          const inst = Number(r?.offers?.installments);
          const isPifSale = Number.isFinite(inst) && inst === 0;
          if (isPifSale) {
            const v = pifCommission(r);
            if (v != null) {
              cur.pifSum += v;
              cur.pifCount += 1;
            }
          } else if (inst === 4 || inst === 7) {
            const v = installmentCommission(r);
            if (v != null) {
              cur.mainInstSum += v;
              cur.mainInstCount += 1;
            }
          } else if (inst === 5) {
            const v = installmentCommission(r);
            if (v != null) {
              cur.studentInstSum += v;
              cur.studentInstCount += 1;
            }
          }
          byCloser.set(cid, cur);
        }

        const list = Array.from(byCloser.entries()).map(([cid, v]) => {
          // AOV: Management-style average offer price per sale
          const aov = v.sales > 0 ? v.aovValueSum / v.sales : null;

          // AOC = average of the available commission buckets for this closer+range.
          // IMPORTANT: do not inject zeros for missing buckets (that makes AOC look "wrong").
          // Multipay commission is only on the first two installments.
          const parts = [];
          if (v.pifCount > 0) parts.push(v.pifSum / v.pifCount);
          if (v.mainInstCount > 0) parts.push((v.mainInstSum / v.mainInstCount) * 2);
          if (v.studentInstCount > 0)
            parts.push((v.studentInstSum / v.studentInstCount) * 2);
          const aoc = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;

          const name =
            dataState.closerMap?.[String(cid)] ||
            dataState.closerMap?.[cid] ||
            `Closer ${cid}`;
          return {
            closerId: cid,
            name,
            aov,
            aoc,
            sales: v.sales,
            isYou: String(cid) === String(closer),
            _aov: aov ?? -1,
          };
        });

        list.sort((a, b) => b._aov - a._aov);

        if (cancelled) return;
        setAovByCloser({ loading: false, entries: list.slice(0, 5) });
      } catch (e) {
        console.warn("[Closer] AOV by closer load failed:", e?.message || e);
        if (cancelled) return;
        setAovByCloser((p) => ({ ...p, loading: false, entries: [] }));
      }
    }

    loadAovByCloser();
    return () => {
      cancelled = true;
    };
  }, [closer, Object.keys(dataState?.closerMap || {}).length, aovRange]);

  useEffect(() => {
    let cancelled = false;

    async function loadPayoffOpportunities() {
      setPayoffOpps((p) => ({ ...p, loading: true }));

      try {
        // "Early payoff" window is 30 days from first installment (purchase_date).
        const now = Date.now();
        const startISO = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
        const endISO = new Date(now).toISOString();

        const { data: rows } = await supabase
          .from("outcome_log")
          .select(
            "id,call_id,purchase_date,kajabi_purchase_id,kajabi_payoff_id,payoff_date,calls!inner!call_id(id,closer_id,closer_note_id,lead_id,name,email,phone,timezone,leads(id,name,email,phone)),offers!offer_id(installments)",
          )
          .eq("outcome", "yes")
          .not("kajabi_purchase_id", "is", null)
          // Not already paid off
          .is("kajabi_payoff_id", null)
          .is("payoff_date", null)
          .gte("purchase_date", startISO)
          .lte("purchase_date", endISO)
          .eq("calls.closer_id", closer)
          .then((r) => (r.error ? { data: [] } : r));

        const eligible = (rows || []).filter((r) => {
          const inst = Number(r?.offers?.installments);
          return inst === 4 || inst === 7 || inst === 5;
        });

        const purchaseIds = Array.from(
          new Set(eligible.map((r) => String(r?.kajabi_purchase_id || "")).filter(Boolean)),
        );

        const { data: purchases } =
          purchaseIds.length > 0
            ? await supabase
                .from("kajabi_purchases")
                .select("kajabi_purchase_id,multipay_payments_made,amount_in_cents,payment_type")
                .in("kajabi_purchase_id", purchaseIds)
                .then((r) => (r.error ? { data: [] } : r))
            : { data: [] };

        const purchaseMap = new Map(
          (purchases || []).map((p) => [String(p.kajabi_purchase_id), p]),
        );

        const toDays = (iso) => {
          const d = new Date(iso);
          if (Number.isNaN(d.getTime())) return null;
          return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
        };

        const entries = eligible
          .map((r) => {
            const inst = Number(r?.offers?.installments);
            const payoffTarget = inst === 5 ? 897 : 1497;
            const daysSince = toDays(r?.purchase_date);
            const daysLeft = daysSince == null ? null : Math.max(0, 30 - daysSince);
            const pid = String(r?.kajabi_purchase_id || "");
            const p = pid ? purchaseMap.get(pid) : null;
            const paysMade =
              p?.multipay_payments_made != null && Number.isFinite(Number(p.multipay_payments_made))
                ? Number(p.multipay_payments_made)
                : null;
            const amount =
              p?.amount_in_cents != null && Number.isFinite(Number(p.amount_in_cents))
                ? `$${(Number(p.amount_in_cents) / 100).toFixed(2)}`
                : null;

            const name =
              r?.calls?.leads?.name ||
              r?.calls?.name ||
              r?.calls?.leads?.email ||
              r?.calls?.email ||
              "—";

            const parts = [];
            parts.push(payoffTarget ? `$${payoffTarget} payoff target` : "Payoff target");
            if (paysMade != null) parts.push(`${paysMade} pays made`);
            if (daysLeft != null) parts.push(`${daysLeft}d left`);
            parts.push(`${inst} payments plan`);

            const meta = parts.join(" • ");
            return {
              name,
              meta,
              actionLabel: "Upgrade PIF",
              call: r?.calls || null,
              kajabiPurchaseId: pid || null,
              initialPurchaseDisplay: pid
                ? `Linked purchase: #${pid}${amount ? ` • ${amount}` : ""}`
                : null,
              _daysLeft: daysLeft ?? 999,
            };
          })
          .sort((a, b) => a._daysLeft - b._daysLeft)
          .slice(0, 50);

        if (cancelled) return;
        setPayoffOpps({ loading: false, entries });
      } catch (e) {
        console.warn("[Closer] Payoff opportunities load failed:", e?.message || e);
        if (cancelled) return;
        setPayoffOpps({ loading: false, entries: [] });
      }
    }

    if (!closer) return;
    loadPayoffOpportunities();
    return () => {
      cancelled = true;
    };
  }, [closer]);

  useEffect(() => {
    let cancelled = false;

    async function loadShowUpLeaderboard() {
      // wait for closer map so we can label rows
      if (!dataState?.closerMap || Object.keys(dataState.closerMap).length === 0) return;

      setShowUpLeaderboard((p) => ({ ...p, loading: true }));

      try {
        const ym = DateHelpers.getYearMonthInTimezone(new Date(), DateHelpers.DEFAULT_TIMEZONE);
        const monthKey =
          ym?.monthKey ??
          `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
        const range = DateHelpers.getMonthRangeInTimezone(
          new Date(
            Date.UTC(
              parseInt(monthKey.slice(0, 4), 10),
              parseInt(monthKey.slice(5, 7), 10) - 1,
              15,
            ),
          ),
          DateHelpers.DEFAULT_TIMEZONE,
        );
        const startISO = range?.startDate?.toISOString?.();
        const endISO = range?.endDate?.toISOString?.();
        if (!startISO || !endISO) throw new Error("Missing month range");

        // For "this month" show-up, only count calls up to now.
        const nowISO = new Date().toISOString();
        const toISO = nowISO < endISO ? nowISO : endISO;

        const { data: calls } = await supabase
          .from("calls")
          .select("closer_id, confirmed, showed_up")
          .gte("call_date", startISO)
          .lte("call_date", toISO)
          .not("closer_id", "is", null)
          .then((r) => (r.error ? { data: [] } : r));

        const list = calls || [];
        const isTrue = (v) => v === true || v === "true";

        const byCloser = new Map();
        for (const c of list) {
          const cid = c?.closer_id;
          if (!cid) continue;
          const cur = byCloser.get(cid) || { confirmed: 0, showedUp: 0 };
          if (isTrue(c.confirmed)) cur.confirmed += 1;
          if (isTrue(c.showed_up)) cur.showedUp += 1;
          byCloser.set(cid, cur);
        }

        const rows = Array.from(byCloser.entries())
          .map(([cid, v]) => {
            const rate =
              v.confirmed > 0
                ? Math.round((v.showedUp / v.confirmed) * 1000) / 10
                : null;
            const percent =
              rate == null ? "—" : `${String(rate).endsWith(".0") ? Math.round(rate) : rate}%`;
            const name =
              dataState.closerMap?.[String(cid)] ||
              dataState.closerMap?.[cid] ||
              `Closer ${cid}`;
            return {
              closerId: cid,
              name,
              percent,
              subtitle: `${v.showedUp} / ${v.confirmed} showed up`,
              isYou: String(cid) === String(closer),
              _rate: rate ?? -1,
              _confirmed: v.confirmed,
              _showedUp: v.showedUp,
            };
          })
          // Hide closers with no confirmed calls (rate null)
          .filter((r) => r._confirmed > 0)
          .sort((a, b) => (b._rate - a._rate) || (b._confirmed - a._confirmed));

        if (cancelled) return;
        setShowUpLeaderboard({ loading: false, entries: rows.slice(0, 5) });
      } catch (e) {
        console.warn("[Closer] ShowUp leaderboard load failed:", e?.message || e);
        if (cancelled) return;
        setShowUpLeaderboard((p) => ({ ...p, loading: false, entries: [] }));
      }
    }

    loadShowUpLeaderboard();
    return () => {
      cancelled = true;
    };
  }, [closer, Object.keys(dataState?.closerMap || {}).length]);

  // Check for active shift on component mount
  useEffect(() => {
    checkActiveShift();
  }, [closer]);

  // Update headerState when isShiftActive changes
  useEffect(() => {
    setHeaderState((prevState) => ({
      ...prevState,
      isShiftActive: isShiftActive,
    }));
  }, [isShiftActive]);

  useEffect(() => {
    fetchAll(
      headerState.searchTerm,
      headerState.activeTab,
      headerState.sortBy,
      headerState.sortOrder,
      setDataState,
      closer,
      null,
      headerState.filters,
      undefined,
      headerState.startDate,
      headerState.endDate,
      "",
      "",
      headerState.sortBy, // Filter by same field as sort toggle (book_date or call_date)
    );
  }, [
    headerState.searchTerm,
    headerState.activeTab,
    headerState.sortBy,
    headerState.sortOrder,
    headerState.filters,
    headerState.startDate,
    headerState.endDate,
  ]);

  return (
    <>
      {dataState.loading || !dataState?.closerMap?.[closer] ? (
        <CloserHeaderShimmer />
      ) : (
        <CloserHeader
          name={dataState.closerMap[closer] || ""}
          monthLabel={monthLabel}
          lastUpdatedLabel={lastUpdatedLabel}
          // promoLabel={promoLabel || undefined}
          onFullStats={() => navigate(`/closer-stats/${closer}`)}
          onStartShift={() =>
            isShiftActive ? handleEndShift() : setIsStartShiftModalOpen(true)
          }
          startShiftLabel={isShiftActive ? "End Shift" : "Start Shift"}
          isShiftActive={isShiftActive}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-7 gap-4 mt-2 p-2">
        <CloserBody
          {...bodyStats}
          metricsLoading={metricsTable.loading}
          metricsMtdLabel={metricsTable.mtdLabel}
          metricsHistoricLabel={metricsTable.historicLabel}
          metricsMtd={metricsTable.mtd}
          metricsHistoric={metricsTable.historic}
          historicLoading={historicPerf.loading}
          historicRange={historicPerf.range}
          onHistoricRangeChange={(r) =>
            setHistoricPerf((p) => ({ ...p, range: r || "6mo" }))
          }
          historicAvgClosingRate={historicPerf.avgClosingRate}
          historicAvgPifRate={historicPerf.avgPifRate}
          historicBestMonthValue={bodyStats.bestMonthValue}
          historicBestMonthSubtext={bodyStats.bestMonthSubtext}
          historicBestMonthHint={bodyStats.bestMonthFooter || ""}
          historicClosingBars={historicPerf.closingBars}
          historicPifBars={historicPerf.pifBars}
          historicLabels={historicPerf.labels}
          leadsLoading={dataState.loading}
          leads={dataState.leads}
          setterMap={dataState.setterMap}
          closerList={dataState.closerList}
          activeTab={headerState.activeTab}
          onTabChange={(tab) => setHeaderState((p) => ({ ...p, activeTab: tab }))}
          payoffLoading={payoffOpps.loading}
          payoffEntries={payoffOpps.entries}
          onLeadDeleted={(callId) =>
            setDataState((prev) => ({
              ...prev,
              leads: (prev.leads || []).filter((l) => l.id !== callId),
            }))
          }
        />
        <CloserAside
          loading={bodyStats.loading}
          pifRateLoading={pifLeaderboard.loading}
          pifRateEntries={pifLeaderboard.entries}
          pifRateTitleRight={pifLeaderboard.titleRight}
          pifRateFooter={pifLeaderboard.footer}
          showUpLoading={showUpLeaderboard.loading}
          showUpEntries={showUpLeaderboard.entries}
          recoveredLoading={recoveredAside.loading}
          recoveredStats={{
            ...recoveredAside.stats,
            neverContacted: recoveredAside.neverContactedCount,
          }}
          recoveredLeads={recoveredAside.leads}
          recoveredRange={recoveredAside.range}
          onRecoveredRangeChange={(r) =>
            setRecoveredAside((p) => ({ ...p, range: r || "thisWeek" }))
          }
          payoffLoading={payoffOpps.loading}
          payoffEntries={payoffOpps.entries.slice(0, 5)}
          aovLoading={aovByCloser.loading}
          aovEntries={aovByCloser.entries}
          aovRange={aovRange}
          onAovRangeChange={setAovRange}
        />
      </div>

      {/* <CloserDashboardCards closer={closer} />

      <HeaderTabsAndToolbar
        state={{
          ...headerState,
          setterMap: dataState.setterMap,
          closerMap: dataState.closerMap,
        }}
        setState={setHeaderState}
        mode="closer"
      />

      {dataState.loading ? (
        <div
          style={{
            padding: "24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "200px",
          }}
        >
          <div style={{ fontSize: "18px", color: "#6b7280" }}>
            Loading leads...
          </div>
        </div>
      ) : (
        <div style={{ marginTop: "16px" }}>
          {headerState.activeTab !== "all" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "0px" }}
            >
              {dataState.leads.map((lead) => (
                <LeadItem
                  key={lead.id}
                  lead={lead}
                  setterMap={dataState.setterMap}
                closerMap={dataState.closerMap}
                  closerList={dataState.closerList ?? []}
                  mode="closer"
                  currentUserId={closer}
                  calltimeLoading={dataState.calltimeLoading}
                  onLeadUpdated={(callId, updates) =>
                    setDataState((prev) => ({
                      ...prev,
                      leads: prev.leads.map((l) =>
                        l.id === callId ? { ...l, ...updates } : l,
                      ),
                    }))
                  }
                />
              ))}
              {dataState.leads.length === 0 && (
                <div
                  style={{
                    fontSize: "18px",
                    color: "#6b7280",
                    textAlign: "center",
                    marginTop: "24px",
                  }}
                >
                  No leads found.
                </div>
              )}
            </div>
          )}
          {headerState.activeTab === "all" && (
            <div>
              <LeadListHeader />
              {dataState.leads.map((lead) => (
                <LeadItemCompact
                  key={lead.id}
                  lead={lead}
                  setterMap={dataState.setterMap}
                  closerMap={dataState.closerMap}
                  closerList={dataState.closerList ?? []}
                  calltimeLoading={dataState.calltimeLoading}
                  mode="closer"
                />
              ))}
            </div>
          )}
        </div>
      )} */}

      {/* Start Shift Modal */}
      <StartShiftModal
        isOpen={isStartShiftModalOpen}
        onClose={() => setIsStartShiftModalOpen(false)}
        userId={closer}
        userName={userName}
        onShiftStarted={handleStartShift}
        mode="closer"
      />

      {/* End Shift Modal */}
      <EndShiftModal
        isOpen={isEndShiftModalOpen}
        onClose={() => setIsEndShiftModalOpen(false)}
        mode="closer"
        userId={closer}
        setterMap={dataState.setterMap}
        closerMap={dataState.closerMap}
        closerList={dataState.closerList ?? []}
        currentShiftId={currentShift?.id}
        onShiftEnded={handleShiftEnded}
        leads={dataState.leads}
      />
    </>
  );
}
