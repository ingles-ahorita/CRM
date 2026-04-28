import React, { useCallback, useState } from "react";
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
  topClassName,
}) {
  const [tipVisible, setTipVisible] = useState(false);
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 });

  const onEnter = useCallback((e) => {
    if (!benchmarkLabel) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTipPos({ x: rect.left + rect.width / 2, y: rect.bottom });
    setTipVisible(true);
  }, [benchmarkLabel]);

  const onLeave = useCallback(() => setTipVisible(false), []);

  const onFocus = useCallback((e) => {
    if (!benchmarkLabel) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTipPos({ x: rect.left + rect.width / 2, y: rect.bottom });
    setTipVisible(true);
  }, [benchmarkLabel]);

  const midClass =
    midTone === "good"
      ? "text-emerald-600"
      : midTone === "warn"
        ? "text-amber-600"
        : midTone === "bad"
          ? "text-rose-600"
          : midTone === "great"
            ? "text-emerald-700"
          : midTone === "info"
            ? "text-blue-600"
            : "text-slate-500";

  const topClass =
    topClassName ?? (isAboveBenchmark ? "text-emerald-600" : "text-black");

  return (
    <div className="px-4 py-4 flex flex-col items-center justify-center text-center">
      <div
        className={cx(
          "text-[14px] font-extrabold leading-none",
          benchmarkLabel ? "cursor-help" : null,
          topClass,
        )}
        tabIndex={benchmarkLabel ? 0 : undefined}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onFocus}
        onBlur={onLeave}
      >
        {top}
      </div>

      {benchmarkLabel && tipVisible ? (
        <div
          className="fixed z-[9999] -translate-x-1/2"
          style={{ left: tipPos.x, top: tipPos.y + 8 }}
          aria-hidden="true"
        >
          <div
            className={cx(
              "rounded-lg border border-slate-200 bg-slate-950 text-white",
              "px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap",
              "shadow-[0_12px_30px_rgba(2,6,23,0.35)]",
            )}
          >
            <span className="text-white/80">Benchmark:</span>{" "}
            <span className="text-white">{benchmarkLabel}</span>
          </div>
        </div>
      ) : null}
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

  const showUpTone = (pct) => {
    if (!Number.isFinite(pct)) return "neutral";
    if (pct < 45) return "bad";
    if (pct < 55) return "warn";
    if (pct < 65) return "good";
    return "great";
  };

  const showUpTopClass = (tone) =>
    tone === "bad"
      ? "text-rose-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "good"
          ? "text-emerald-600"
          : tone === "great"
            ? "text-emerald-700"
            : "text-black";

  const showUpMtdPct = pctNum(showUpMtd.showed, showUpMtd.confirmed);
  const showUpHistPct = pctNum(showUpHist.showed, showUpHist.confirmed);
  const showUpMtdTone = showUpTone(showUpMtdPct);
  const showUpHistTone = showUpTone(showUpHistPct);

  const pifTone = (pct) => {
    if (!Number.isFinite(pct)) return "neutral";
    if (pct < 20) return "bad";
    if (pct < 25) return "warn";
    if (pct < 30) return "good";
    return "great";
  };

  const pifMtdPct = pctNum(pifMtd.pif, pifMtd.total);
  const pifHistPct = pctNum(pifHist.pif, pifHist.total);
  const pifMtdTone = pifTone(pifMtdPct);
  const pifHistTone = pifTone(pifHistPct);

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
            benchmarkLabel="Bad: <20% / Ok: 20–25% / Good: 25–30% / Amazing: 30%+"
            mid={`${pifMtd.pif} / ${pifMtd.total} PIF`}
            midTone={pifMtdTone}
            topClassName={showUpTopClass(pifMtdTone)}
          />
          <DataCell
            top={pctText(pifHist.pif, pifHist.total)}
            benchmarkLabel="Bad: <20% / Ok: 20–25% / Good: 25–30% / Amazing: 30%+"
            mid={`${pifHist.pif} / ${pifHist.total} PIF`}
            midTone={pifHistTone}
            topClassName={showUpTopClass(pifHistTone)}
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
            benchmarkLabel="Bad: <30% / Good: 30%+"
            mid={`${closingMtd.closed} / ${closingMtd.showedUp} closed`}
            midTone="good"
          />
          <DataCell
            top={pctText(closingHist.closed, closingHist.showedUp)}
            isAboveBenchmark={(pctNum(closingHist.closed, closingHist.showedUp) ?? -1) >= 30}
            benchmarkLabel="Bad: <30% / Good: 30%+"
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
            benchmarkLabel="Bad: <45% / Ok: 45–55% / Good: 55–65% / Great: 65%+"
            mid={`${showUpMtd.showed} / ${showUpMtd.confirmed}`}
            midTone={showUpMtdTone}
            topClassName={showUpTopClass(showUpMtdTone)}
          />
          <DataCell
            top={pctText(showUpHist.showed, showUpHist.confirmed)}
            benchmarkLabel="Bad: <45% / Ok: 45–55% / Good: 55–65% / Great: 65%+"
            mid={`${showUpHist.showed} / ${showUpHist.confirmed}`}
            midTone={showUpHistTone}
            topClassName={showUpTopClass(showUpHistTone)}
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
