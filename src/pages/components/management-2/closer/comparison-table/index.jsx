import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import SegmentedTabs from "../../segmented-tabs";
import { supabase } from "../../../../../lib/supabaseClient";
import { aocForOffer, fetchCompletionRatesInst2 } from "../../../../../lib/aoc";
import * as DateHelpers from "../../../../../utils/dateHelpers";

function cx(...p) {
  return p.filter(Boolean).join(" ");
}

const COLUMNS = [
  {
    key: "name",
    label: "Closer",
    align: "left",
    sortable: true,
    width: "w-[14%]",
  },
  { key: "aov", label: "AOV", align: "left", sortable: true },
  { key: "aoc", label: "AOC", align: "left", sortable: true },
  { key: "sales", label: "Sales", align: "left", sortable: true },
  { key: "closingRate", label: "Closing %", align: "left", sortable: true },
  { key: "pifRate", label: "PIF %", align: "left", sortable: true },
  { key: "showUpRate", label: "Show-up %", align: "left", sortable: true },
  { key: "commission", label: "Commission", align: "left", sortable: true },
  { key: "recovered", label: "Recovered", align: "left", sortable: true },
  { key: "open", label: "", align: "right", sortable: false },
];

// Threshold helpers — mirror the rest of the app.
function closingRateClass(v) {
  if (v < 25) return "text-rose-600";
  if (v < 30) return "text-amber-600";
  if (v < 35) return "text-emerald-500";
  return "text-emerald-800";
}

function pifRateClass(v) {
  if (v < 20) return "text-rose-600";
  if (v < 25) return "text-amber-600";
  if (v < 30) return "text-emerald-500";
  return "text-emerald-800";
}

function showUpRateClass(v) {
  if (v < 45) return "text-rose-600";
  if (v < 55) return "text-amber-600";
  if (v < 65) return "text-emerald-500";
  return "text-emerald-800";
}

function aovClass(v) {
  if (v < 750) return "text-rose-600";
  if (v < 875) return "text-amber-600";
  if (v < 1000) return "text-emerald-500";
  return "text-emerald-800";
}

const fmtUSD = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

const fmtPct = (n) => `${(Number(n) || 0).toFixed(1)}%`;

const PERIOD_FILTER_ITEMS = [
  { id: "thisWeek", label: "This week" },
  { id: "lastWeek", label: "Last week" },
  { id: "all", label: "All" },
];

function shimmer(className = "") {
  return <div className={cx("animate-pulse rounded-md bg-slate-200/70", className)} />;
}

function pct(num, den) {
  const n = Number(num);
  const d = Number(den);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return 0;
  return (n / d) * 100;
}

function getPeriodBounds(periodFilter) {
  if (periodFilter === "thisWeek") {
    const { weekStart, weekEnd } = DateHelpers.getWeekBoundsUTC(new Date());
    return { startISO: weekStart.toISOString(), endISO: weekEnd.toISOString() };
  }
  if (periodFilter === "lastWeek") {
    const { weekStart, weekEnd } = DateHelpers.getWeekBoundsForOffset(1);
    return { startISO: weekStart.toISOString(), endISO: weekEnd.toISOString() };
  }
  return null;
}

async function fetchAllRows(buildQuery, pageSize = 1000, maxRows = 50000) {
  const out = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await buildQuery().range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

function SortHeader({ col, sortKey, sortDir, onChange }) {
  const isActive = sortKey === col.key;
  return (
    <span
      onClick={() => col.sortable && onChange?.(col.key)}
      className={cx(
        "group inline-flex items-center gap-1 select-none transition-colors !outline-none bg-slate-100/70 hover:border-none ring-0 hover:ring-0",
        col.sortable ? "cursor-pointer hover:text-black" : "cursor-default",
        isActive ? "text-black" : "text-black/70",
      )}
    >
      <span className="text-black font-bold text-[13px] whitespace-nowrap">
        {col.label}
      </span>
      {col.sortable ? (
        <span
          className={cx(
            "transition-opacity",
            isActive ? "opacity-100" : "opacity-0 group-hover:opacity-60",
          )}
        >
          {sortDir === "asc" ? (
            <ChevronUp size={11} className="text-black" />
          ) : (
            <ChevronDown size={11} className="text-black" />
          )}
        </span>
      ) : null}
    </span>
  );
}

export default function CloserComparisonTable() {
  const [sortKey, setSortKey] = useState("commission");
  const [sortDir, setSortDir] = useState("desc");
  const [periodFilter, setPeriodFilter] = useState("thisWeek");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function loadRows() {
      setLoading(true);
      setErrorMsg("");
      try {
        const bounds = getPeriodBounds(periodFilter);

        const { data: closersData, error: closersErr } = await supabase
          .from("closers")
          .select("*")
          .eq("active", true)
          .order("name", { ascending: true });
        if (closersErr) throw closersErr;

        const completionRatesPromise = fetchCompletionRatesInst2();

        const [callsRows, recoveredRows, salesRows, completionRates] = await Promise.all([
          fetchAllRows(() => {
            let q = supabase
              .from("calls")
              .select("closer_id, confirmed, showed_up, cancelled")
              .not("closer_id", "is", null);
            if (bounds) q = q.gte("call_date", bounds.startISO).lte("call_date", bounds.endISO);
            return q;
          }),
          fetchAllRows(() => {
            let q = supabase
              .from("calls")
              .select("closer_id, recovered, cancelled")
              .not("closer_id", "is", null);
            if (bounds) q = q.gte("book_date", bounds.startISO).lte("book_date", bounds.endISO);
            return q;
          }),
          fetchAllRows(() => {
            let q = supabase
              .from("outcome_log")
              .select(
                "PIF, commission, discount, calls!inner!call_id(closer_id), offers!offer_id(kajabi_id, price, installments, base_commission, payoff_commission)",
              )
              .eq("outcome", "yes");
            if (bounds) q = q.gte("purchase_date", bounds.startISO).lte("purchase_date", bounds.endISO);
            return q;
          }),
          completionRatesPromise,
        ]);

        const byCloser = new Map();
        for (const c of closersData || []) {
          byCloser.set(String(c.id), {
            id: c.id,
            name: c.name || `Closer ${c.id}`,
            confirmed: 0,
            showed: 0,
            sales: 0,
            pifSales: 0,
            commission: 0,
            recovered: 0,
            aovSum: 0,
            aocSum: 0,
            aocCount: 0,
          });
        }

        for (const row of callsRows || []) {
          if (row?.cancelled === true) continue;
          const k = String(row?.closer_id || "");
          const cur = byCloser.get(k);
          if (!cur) continue;
          if (row?.confirmed === true) cur.confirmed += 1;
          if (row?.showed_up === true) cur.showed += 1;
        }

        for (const row of recoveredRows || []) {
          if (row?.cancelled === true || row?.recovered !== true) continue;
          const k = String(row?.closer_id || "");
          const cur = byCloser.get(k);
          if (!cur) continue;
          cur.recovered += 1;
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
        const commissionForSale = (sale) => {
          const offer = sale?.offers || null;
          const inst = Number(offer?.installments);
          const isPifOffer = Number.isFinite(inst) && inst === 0;
          const base = adjustedBase(offer, sale?.discount);
          if (base == null) return Number(sale?.commission) || 0;
          if (
            (isPifOffer || (sale?.kajabi_payoff_id && !sale?.payoff_date)) &&
            offer?.payoff_commission != null
          ) {
            const payoff = Number(offer.payoff_commission);
            if (Number.isFinite(payoff)) return payoff;
          }
          return base * 2;
        };

        for (const sale of salesRows || []) {
          const k = String(sale?.calls?.closer_id || "");
          const cur = byCloser.get(k);
          if (!cur) continue;
          cur.sales += 1;
          if (sale?.PIF === true) cur.pifSales += 1;
          cur.commission += commissionForSale(sale);

          const offerPrice = Number(sale?.offers?.price);
          if (Number.isFinite(offerPrice) && offerPrice > 0) cur.aovSum += offerPrice;

          const aoc = aocForOffer(sale?.offers, completionRates);
          if (aoc != null && Number.isFinite(aoc)) {
            cur.aocSum += aoc;
            cur.aocCount += 1;
          }
        }

        const nextRows = Array.from(byCloser.values()).map((r) => {
          const showUpRate = pct(r.showed, r.confirmed);
          const closingRate = pct(r.sales, r.showed);
          const pifRate = pct(r.pifSales, r.sales);
          return {
            id: String(r.id),
            name: r.name,
            aov: r.sales > 0 ? r.aovSum / r.sales : 0,
            aoc: r.aocCount > 0 ? r.aocSum / r.aocCount : 0,
            sales: r.sales,
            pifSales: r.pifSales,
            closingRate,
            pifRate,
            showUpRate,
            commission: r.commission,
            recovered: r.recovered,
          };
        });

        if (cancelled) return;
        setRows(nextRows);
      } catch (e) {
        if (cancelled) return;
        setRows([]);
        setErrorMsg(e?.message || "Failed to load closer comparison");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadRows();
    return () => {
      cancelled = true;
    };
  }, [periodFilter]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = useMemo(() => {
    const arr = [...rows];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const av = a?.[sortKey];
      const bv = b?.[sortKey];
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av || "").localeCompare(String(bv || "")) * dir;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  return (
    // <div className="relative w-full max-w-[1400px]">
    //   <div className="mb-3 flex flex-col items-start gap-1">
    //     <div className="flex items-center gap-2">
    //       <h2 className="text-[20px] font-extrabold tracking-tight text-[#0f172a]">
    //         <span className="text-slate-400 font-black mr-1">3.</span>
    //         Closer comparison table{" "}
    //         <span className="text-slate-500 font-semibold">
    //           (alternative view)
    //         </span>
    //       </h2>
    //       <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-[2px] text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-200">
    //         <Sparkles size={11} className="text-emerald-600" />
    //         Core Feature
    //       </span>
    //     </div>
    //     <p className="max-w-[820px] text-[13px] font-medium text-slate-500">
    //       Same closer data in a sortable comparison table. Useful when
    //       management wants to rank closers by any column. Toggle from the tabs
    //       above.
    //     </p>
    //   </div>

    //   <div className="rounded-[20px] border-[2px] border-dashed border-slate-300/80 bg-slate-50/30 p-4">
    //     <div className="rounded-xl bg-white">
    //       <table className="w-full text-[13px] table-fixed">
    //         <colgroup>
    //           <col className="w-[12%]" />
    //           <col className="w-[8%]" />
    //           <col className="w-[7%]" />
    //           <col className="w-[7%]" />
    //           <col className="w-[9%]" />
    //           <col className="w-[8%]" />
    //           <col className="w-[10%]" />
    //           <col className="w-[10%]" />
    //           <col className="w-[8%]" />
    //           <col className="w-[10%]" />
    //           <col className="w-[7%]" />
    //         </colgroup>
    //         <thead>
    //           <tr className="border-b border-slate-100 text-[11.5px] font-bold tracking-wide">
    //             {COLUMNS.map((col) => (
    //               <th
    //                 key={col.key}
    //                 scope="col"
    //                 className={cx(
    //                   "px-3 py-3 text-slate-500 font-semibold bg-slate-100/90 rounded-lg",
    //                   col.align === "right" ? "text-right" : "text-left",
    //                 )}
    //               >
    //                 {col.sortable ? (
    //                   <SortHeader
    //                     col={col}
    //                     sortKey={sortKey}
    //                     sortDir={sortDir}
    //                     onChange={handleSort}
    //                   />
    //                 ) : (
    //                   <span>{col.label}</span>
    //                 )}
    //               </th>
    //             ))}
    //           </tr>
    //         </thead>
    //         <tbody>
    //           {sorted.map((row) => (
    //             <tr
    //               key={row.id}
    //               className="border-b border-slate-200 last:border-b-0 transition-colors hover:bg-slate-50/70"
    //             >
    //               <td className="px-3 py-3.5 text-left">
    //                 <span className="text-[13.5px] font-bold text-slate-900">
    //                   {row.name}
    //                 </span>
    //               </td>

    //               <td className="px-3 py-3.5 text-left">
    //                 <span
    //                   className={cx(
    //                     "font-bold tabular-nums",
    //                     aovClass(row.aov),
    //                   )}
    //                 >
    //                   {fmtUSD(row.aov)}
    //                 </span>
    //               </td>

    //               <td className="px-3 py-3.5 text-left">
    //                 <span className="font-medium tabular-nums text-slate-700">
    //                   {fmtUSD(row.aoc)}
    //                 </span>
    //               </td>

    //               <td className="px-5 py-3.5 text-left">
    //                 <span className="font-bold tabular-nums text-slate-800">
    //                   {row.sales}
    //                 </span>
    //               </td>

    //               <td className="px-4 py-3.5 text-left">
    //                 <span
    //                   className={cx(
    //                     "font-bold tabular-nums",
    //                     closingRateClass(row.closingRate),
    //                   )}
    //                 >
    //                   {fmtPct(row.closingRate)}
    //                 </span>
    //               </td>

    //               <td className="px-3 py-3.5 text-left">
    //                 <span
    //                   className={cx(
    //                     "font-bold tabular-nums",
    //                     pifRateClass(row.pifRate),
    //                   )}
    //                 >
    //                   {fmtPct(row.pifRate)}
    //                 </span>
    //               </td>

    //               <td className="px-5 py-3.5 text-left">
    //                 <span
    //                   className={cx(
    //                     "font-bold tabular-nums",
    //                     showUpRateClass(row.showUpRate),
    //                   )}
    //                 >
    //                   {fmtPct(row.showUpRate)}
    //                 </span>
    //               </td>

    //               <td className="px-6 py-3.5 text-left">
    //                 <span className="font-extrabold tabular-nums text-slate-900">
    //                   {fmtUSD(row.commission)}
    //                 </span>
    //               </td>

    //               <td className="px-3 py-3.5 text-left">
    //                 <span
    //                   className={cx(
    //                     "font-bold tabular-nums",
    //                     goalClass(row.goal),
    //                   )}
    //                 >
    //                   {row.goal}%
    //                 </span>
    //               </td>

    //               <td className="px-8 py-3.5 text-left">
    //                 <span className="font-medium tabular-nums text-slate-500">
    //                   {row.recovered}
    //                 </span>
    //               </td>

    //               <td className="px-3 py-3.5 text-right whitespace-nowrap">
    //                 <button
    //                   type="button"
    //                   className="text-[12.5px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors !outline-none border-b border-transparent bg-slate-100/70 !border-none hover:border-indigo-300"
    //                 >
    //                   Open →
    //                 </button>
    //               </td>
    //             </tr>
    //           ))}
    //         </tbody>
    //       </table>
    //     </div>
    //   </div>
    // </div>

    <div className="w-full max-w-[1400px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Header Area */}
      <div className="mb-1 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-[20px] font-bold tracking-tight text-[#0f172a]">
            Closer comparison table
          </h2>
          {/* <span className="ml-0 mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-[2px] text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <Sparkles size={11} className="text-emerald-600" />
            Core Feature
          </span> */}
        </div>
        <SegmentedTabs
          items={PERIOD_FILTER_ITEMS}
          activeId={periodFilter}
          onChange={setPeriodFilter}
          size="sm"
          className="self-center"
        />
        {/* <p className="text-[13px] font-medium text-slate-500">
         Same closer data in a sortable comparison table. Useful when
           management wants to rank closers by any column. Toggle from t he tabs
           above.
  </p> */}
      </div>

      {/* Dashed Container Area */}
      <div className="relative mt-5">
        {/* Outer Dashed Box */}
        <div className="rounded-[16px] border-[2px] border-dashed border-slate-300/80 bg-slate-50/50 p-4">
          <div className="rounded-xl bg-white">
            <table className="w-full text-[13px] table-fixed">
              <colgroup>
                <col className="w-[12%]" />
                <col className="w-[8%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[9%]" />
                <col className="w-[8%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[7%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-100 text-[11.5px] font-bold tracking-wide">
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      scope="col"
                      className={cx(
                        "px-3 py-3 text-slate-500 font-semibold bg-slate-100/90 rounded-lg",
                        col.align === "right" ? "text-right" : "text-left",
                      )}
                    >
                      {col.sortable ? (
                        <SortHeader
                          col={col}
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onChange={handleSort}
                        />
                      ) : (
                        <span>{col.label}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, idx) => (
                      <tr key={`shimmer-${idx}`} className="border-b border-slate-200 last:border-b-0">
                        {COLUMNS.map((c, cidx) => (
                          <td key={`${idx}-${c.key}-${cidx}`} className="px-3 py-3.5">
                            {shimmer(c.key === "open" ? "ml-auto h-7 w-16" : "h-4 w-full")}
                          </td>
                        ))}
                      </tr>
                    ))
                  : sorted.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-200 last:border-b-0 transition-colors hover:bg-slate-50/70"
                  >
                    <td className="px-3 py-3.5 text-left">
                      <span className="text-[13.5px] font-bold text-slate-900">
                        {row.name}
                      </span>
                    </td>

                    <td className="px-3 py-3.5 text-left">
                      <span
                        className={cx(
                          "font-bold tabular-nums",
                          aovClass(row.aov),
                        )}
                      >
                        {fmtUSD(row.aov)}
                      </span>
                    </td>

                    <td className="px-3 py-3.5 text-left">
                      <span
                        className={cx(
                          "font-bold tabular-nums",
                          aovClass(row.aoc),
                        )}
                      >
                        {fmtUSD(row.aoc)}
                      </span>
                    </td>

                    <td className="px-5 py-3.5 text-left">
                      <span className="font-bold tabular-nums text-slate-800">
                        {row.sales}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-left">
                      <span
                        className={cx(
                          "font-bold tabular-nums",
                          closingRateClass(row.closingRate),
                        )}
                        title={`${row.sales} / ${row.showed} showed up`}
                      >
                        {fmtPct(row.closingRate)}
                      </span>
                    </td>

                    <td className="px-3 py-3.5 text-left">
                      <span
                        className={cx(
                          "font-bold tabular-nums",
                          pifRateClass(row.pifRate),
                        )}
                        title={`${row.pifSales ?? 0} / ${row.sales} sales are PIF`}
                      >
                        {fmtPct(row.pifRate)}
                      </span>
                    </td>

                    <td className="px-5 py-3.5 text-left">
                      <span
                        className={cx(
                          "font-bold tabular-nums",
                          showUpRateClass(row.showUpRate),
                        )}
                        title={`${row.showed} / ${row.confirmed} confirmed`}
                      >
                        {fmtPct(row.showUpRate)}
                      </span>
                    </td>

                    <td className="px-6 py-3.5 text-left">
                      <span className="font-extrabold tabular-nums text-slate-900">
                        {fmtUSD(row.commission)}
                      </span>
                    </td>

                    <td className="px-8 py-3.5 text-left">
                      <span className="font-medium tabular-nums text-slate-500">
                        {row.recovered}
                      </span>
                    </td>

                    <td className="px-3 py-3.5 text-right whitespace-nowrap">
                      <a
                        href={`/closer/${encodeURIComponent(row.id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12.5px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors !outline-none border-b border-transparent bg-slate-100/70 !border-none hover:border-indigo-300"
                      >
                        Open →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && sorted.length === 0 ? (
              <div className="px-3 py-8 text-center text-[13px] text-slate-500">
                No closer comparison data found for this period.
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {errorMsg ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800">
          {errorMsg}
        </div>
      ) : null}
    </div>
  );
}
