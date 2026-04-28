import React, { useMemo, useState } from "react";
import { Medal, BarChart3, UserRound } from "lucide-react";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function getInitials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function RankIcon({ rank }) {
  if (rank === 1) return <Medal size={16} className="text-amber-500" />;
  if (rank === 2) return <Medal size={16} className="text-slate-400" />;
  if (rank === 3) return <Medal size={16} className="text-amber-700" />;
  return (
    <div className="h-5 w-5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold flex items-center justify-center">
      {rank}
    </div>
  );
}

function Avatar({ initials, highlight }) {
  return (
    <div
      className={cx(
        "h-10 w-10 rounded-full flex items-center justify-center text-xs font-semibold",
        "bg-slate-100 text-black",
      )}
    >
      <UserRound size={18} className="text-black/70" />
    </div>
  );
}

function money(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(v));
}

function aovColorClass(aov) {
  const v = Number(aov);
  if (!Number.isFinite(v)) return "text-black";
  if (v < 750) return "text-rose-600";
  if (v < 875) return "text-amber-600";
  if (v < 1000) return "text-emerald-600";
  return "text-emerald-700";
}

// Dropdown UI (reverted from tabs)

function Row({ rank, name, avatarUrl, aov, aoc, sales, isYou = false }) {
  return (
    <div
      className={cx(
        "flex items-center justify-between gap-3 rounded-xl px-3 py-2",
        isYou ? "bg-violet-50/70" : "bg-white",
      )}
    >
      <div className="flex items-center gap-1 min-w-0">
        <div className="w-6 flex items-center justify-center">
          <RankIcon rank={rank} />
        </div>
        <div
          className={cx(
            "h-10 w-10 rounded-full overflow-hidden flex items-center justify-center",
            "bg-slate-100",
          )}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <UserRound size={18} className="text-black/70" />
          )}
        </div>
        <div className="min-w-0 ml-1">
          <div className="text-sm font-semibold text-slate-900 truncate">
            {isYou ? `You (${name})` : name}
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {sales != null ? `${sales} sales` : "—"}
          </div>
        </div>
      </div>

      <div className="flex items-baseline gap-2 flex-shrink-0">
        <div className={cx("text-sm font-bold", aovColorClass(aov))}>
          {money(aov)}
           {/* / {money(aoc)} */}
        </div>
      </div>
    </div>
  );
}

export default function AovByCloser({
  loading = false,
  defaultRange = "this_month",
  range: controlledRange,
  onRangeChange,
  entries,
}) {
  const [range, setRange] = useState(defaultRange);
  const effectiveRange = controlledRange ?? range;

  const list = useMemo(() => {
    if (entries?.length) return entries;
    return [
      { name: "Ana", aov: 932, sales: 9, isYou: true },
      { name: "Matias", aov: 812, sales: 7 },
      { name: "Emiliano", aov: 799, sales: 2 },
      { name: "Daiana", aov: 623, sales: 4 },
    ];
  }, [entries]);

  const top5 = list.slice(0, 5);

  const overall = useMemo(() => {
    // Match ManagementPage formula:
    // overall AOV = total value across sales / total sales count (weighted average),
    // instead of averaging closer-level AOVs.
    let totalValue = 0;
    let totalSales = 0;

    for (const x of list) {
      const aov = Number(x?.aov);
      const sales = Number(x?.sales);
      if (!Number.isFinite(aov) || !Number.isFinite(sales) || sales <= 0) continue;
      totalValue += aov * sales;
      totalSales += sales;
    }

    return totalSales > 0 ? totalValue / totalSales : null;
  }, [list]);

  const overallAoc = useMemo(() => {
    const nums = list.map((x) => Number(x?.aoc)).filter((n) => Number.isFinite(n));
    if (!nums.length) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }, [list]);

  if (loading) return null;

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-indigo-600" />
            <div className="text-sm font-semibold text-slate-900">AOV by Closer</div>
          </div>

          <select
            value={effectiveRange}
            onChange={(e) => {
              const v = e.target.value;
              setRange(v);
              onRangeChange?.(v);
            }}
            className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none"
            aria-label="AOV range"
          >
            <option value="this_month">This month</option>
            <option value="last_month">Last month</option>
          </select>
        </div>

        <div className="mt-3 text-[11px] text-slate-400">
          Overall:{" "}
          <span className="text-slate-900 font-bold text-[15px] ml-1">
            {money(overall)}
             {/* / {money(overallAoc)} */}
          </span>
        </div>
      </div>

      <div className="pb-2 flex flex-col gap-2">
        {top5.map((e, idx) => (
          <Row
            key={`${e.name}-${idx}`}
            rank={idx + 1}
            name={e.name}
            avatarUrl={e.avatarUrl}
            aov={e.aov}
            aoc={e.aoc}
            sales={e.sales}
            isYou={!!e.isYou}
          />
        ))}
      </div>
    </div>
  );
}

