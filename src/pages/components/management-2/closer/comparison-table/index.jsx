import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { COMPARISON_ROWS } from "./dummy-data";
import SegmentedTabs from "../../segmented-tabs";

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
  { key: "goal", label: "Goal %", align: "left", sortable: true },
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

function goalClass(v) {
  if (v < 50) return "text-rose-500";
  if (v < 80) return "text-amber-500";
  return "text-emerald-600";
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

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filteredRows = useMemo(() => {
    if (periodFilter === "all") return COMPARISON_ROWS;
    return COMPARISON_ROWS.filter((row) => row?.period === periodFilter);
  }, [periodFilter]);

  const sorted = useMemo(() => {
    const arr = [...filteredRows];
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
  }, [filteredRows, sortKey, sortDir]);

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
          <span className="ml-0 mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-[2px] text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <Sparkles size={11} className="text-emerald-600" />
            Core Feature
          </span>
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
           management wants to rank closers by any column. Toggle from the tabs
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
                <col className="w-[8%]" />
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
                {sorted.map((row) => (
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
                      <span className="font-medium tabular-nums text-slate-700">
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
                      >
                        {fmtPct(row.showUpRate)}
                      </span>
                    </td>

                    <td className="px-6 py-3.5 text-left">
                      <span className="font-extrabold tabular-nums text-slate-900">
                        {fmtUSD(row.commission)}
                      </span>
                    </td>

                    <td className="px-3 py-3.5 text-left">
                      <span
                        className={cx(
                          "font-bold tabular-nums",
                          goalClass(row.goal),
                        )}
                      >
                        {row.goal}%
                      </span>
                    </td>

                    <td className="px-8 py-3.5 text-left">
                      <span className="font-medium tabular-nums text-slate-500">
                        {row.recovered}
                      </span>
                    </td>

                    <td className="px-3 py-3.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        className="text-[12.5px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors !outline-none border-b border-transparent bg-slate-100/70 !border-none hover:border-indigo-300"
                      >
                        Open →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
