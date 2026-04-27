import React from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Clock,
  Percent,
  TrendingUp,
} from "lucide-react";
import CloserMetricsTableShimmer from "../../../shimmers/closer-body/closer-metrics-table";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function HeaderCell({ bg, icon, title, subtitle }) {
  return (
    <div className={cx("h-[40px] flex items-center justify-center gap-2", bg)}>
      {icon}
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold tracking-wide text-white/95">
          {title}
        </span>
        <span className="text-[10px] font-semibold text-white/80">
          {subtitle}
        </span>
      </div>
    </div>
  );
}

function MetricMeta({
  icon,
  title,
  subtitle,
  iconWrapClassName,
  iconClassName,
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-4">
      <div
        className={cx(
          "h-10 w-10 rounded-xl flex items-center justify-center",
          "shadow-[0_10px_25px_rgba(2,6,23,0.08)]",
          iconWrapClassName,
        )}
      >
        <span className={cx("text-slate-600", iconClassName)}>{icon}</span>
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="text-[11px] text-slate-400">{subtitle}</div>
      </div>
    </div>
  );
}

function DataCell({
  top,
  mid,
  isAboveBenchmark = false,
  benchmarkLabel,
  midTone = "neutral",
}) {
  const midClass =
    midTone === "good"
      ? "text-emerald-600"
      : midTone === "warn"
        ? "text-orange-600"
        : midTone === "bad"
          ? "text-rose-600"
          : midTone === "info"
            ? "text-blue-600"
            : "text-slate-500";

  return (
    <div className="px-4 py-4 flex flex-col items-center justify-center text-center">
      <div
        className={cx(
          "text-[14px] font-extrabold leading-none",
          isAboveBenchmark ? "text-emerald-600" : "text-black",
        )}
        title={benchmarkLabel ? `Benchmark: ${benchmarkLabel}` : undefined}
      >
        {top}
      </div>
      {mid ? (
        <div className={cx("mt-1 text-[11px] font-semibold text-slate-500", midClass)}>
          {mid}
        </div>
      ) : null}
    </div>
  );
}

export default function CloserMetricsTable({
  loading = false,
  mtdLabel = "",
  historicLabel = "TILL DATE",
  mtd,
  historic,
}) {
  if (loading) return <CloserMetricsTableShimmer />;

  const pctText = (num, den) => {
    const n = Number(num);
    const d = Number(den);
    if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return "—";
    const v = Math.round(((n / d) * 100) * 10) / 10;
    return `${String(v).endsWith(".0") ? Math.round(v) : v}%`;
  };

  const pctNum = (num, den) => {
    const n = Number(num);
    const d = Number(den);
    if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
    return (n / d) * 100;
  };

  const showUpMtd = mtd?.showUp || { showed: 0, confirmed: 0 };
  const showUpHist = historic?.showUp || { showed: 0, confirmed: 0 };
  const closingMtd = mtd?.closing || { closed: 0, showedUp: 0 };
  const closingHist = historic?.closing || { closed: 0, showedUp: 0 };
  const pifMtd = mtd?.pif || { pif: 0, total: 0 };
  const pifHist = historic?.pif || { pif: 0, total: 0 };

  return (
    <div className="w-full rounded-2xl bg-white shadow-sm overflow-hidden pb-2 border border-slate-200">
      <div className="grid grid-cols-[1.2fr_1fr_1fr]">
        <div className="h-[40px] flex items-center px-4 text-[11px] font-bold tracking-wide text-slate-500 bg-white">
          METRIC
        </div>
        <HeaderCell
          bg="bg-[#2b6fe0]"
          icon={<CalendarDays size={14} className="text-white/90" />}
          title="MTD"
          subtitle={mtdLabel}
        />
        <HeaderCell
          bg="bg-[#0f766e]"
          icon={<Clock size={14} className="text-white/90" />}
          title="HISTORIC"
          subtitle={historicLabel}
        />
      </div>

      <div className="divide-y divide-slate-100">
        <div className="grid grid-cols-[1.2fr_1fr_1fr]">
          <MetricMeta
            icon={<ArrowUpRight size={16} />}
            iconWrapClassName="bg-amber-50"
            iconClassName="text-amber-700"
            title="PIF Rate"
            subtitle="% of sales paid in full"
          />
          <DataCell
            top={pctText(pifMtd.pif, pifMtd.total)}
            isAboveBenchmark={(pctNum(pifMtd.pif, pifMtd.total) ?? -1) >= 25}
            benchmarkLabel="25%"
            mid={`${pifMtd.pif} / ${pifMtd.total} PIF`}
            midTone="good"
          />
          <DataCell
            top={pctText(pifHist.pif, pifHist.total)}
            isAboveBenchmark={(pctNum(pifHist.pif, pifHist.total) ?? -1) >= 25}
            benchmarkLabel="25%"
            mid={`${pifHist.pif} / ${pifHist.total} PIF`}
            midTone="good"
          />
        </div>

        <div className="grid grid-cols-[1.2fr_1fr_1fr]">
          <MetricMeta
            icon={<Percent size={16} />}
            iconWrapClassName="bg-violet-50"
            iconClassName="text-violet-600"
            title="Closing Rate"
            subtitle="% of calls that closed"
          />
          <DataCell
            top={pctText(closingMtd.closed, closingMtd.showedUp)}
            isAboveBenchmark={(pctNum(closingMtd.closed, closingMtd.showedUp) ?? -1) >= 30}
            benchmarkLabel="30%"
            mid={`${closingMtd.closed} / ${closingMtd.showedUp} closed`}
            midTone="good"
          />
          <DataCell
            top={pctText(closingHist.closed, closingHist.showedUp)}
            isAboveBenchmark={(pctNum(closingHist.closed, closingHist.showedUp) ?? -1) >= 30}
            benchmarkLabel="30%"
            mid={`${closingHist.closed} / ${closingHist.showedUp} closed`}
            midTone="good"
          />
        </div>

        <div className="grid grid-cols-[1.2fr_1fr_1fr]">
          <MetricMeta
            icon={<TrendingUp size={16} />}
            iconWrapClassName="bg-blue-50"
            iconClassName="text-blue-600"
            title="Show Up Rate"
            subtitle="% of confirmed who showed"
          />
          <DataCell
            top={pctText(showUpMtd.showed, showUpMtd.confirmed)}
            isAboveBenchmark={(pctNum(showUpMtd.showed, showUpMtd.confirmed) ?? -1) >= 55}
            benchmarkLabel="55%"
            mid={`${showUpMtd.showed} / ${showUpMtd.confirmed}`}
            midTone="good"
          />
          <DataCell
            top={pctText(showUpHist.showed, showUpHist.confirmed)}
            isAboveBenchmark={(pctNum(showUpHist.showed, showUpHist.confirmed) ?? -1) >= 55}
            benchmarkLabel="55%"
            mid={`${showUpHist.showed} / ${showUpHist.confirmed}`}
            midTone="good"
          />
        </div>

        {/* <div className="grid grid-cols-[1.2fr_1fr_1fr]">
          <MetricMeta
            icon={<ListChecks size={16} />}
            iconWrapClassName="bg-rose-50"
            iconClassName="text-rose-600"
            title="Follow-Ups Done"
            subtitle="Leads contacted after no-show"
          />
          <DataCell
            top="0"
            progressValue={0}
            progressMax={8}
            mid="of 8 no-shows"
            midTone="bad"
            accent="blue"
          />
          <DataCell
            top="8"
            progressValue={0}
            progressMax={8}
            mid="leads waiting"
            midTone="neutral"
            accent="blue"
          />
        </div> */}
      </div>
    </div>
  );
}
