import React from "react";
import { ArrowDown, ArrowUp, Banknote, Sparkles, Trophy } from "lucide-react";
import CloserBodyStatsShimmer from "../../../shimmers/closer-body/closer-body-stats";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function StatBlock({
  icon,
  label,
  value,
  valueClassName,
  subtext,
  footer,
  footerIcon,
  footerClassName,
  className,
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center justify-center px-6 py-4",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-[10px] tracking-[0.18em] uppercase text-slate-500">
        {icon}
        <span>{label}</span>
      </div>

      <div
        className={cx(
          "mt-2 text-[30px] font-semibold leading-none",
          valueClassName,
        )}
      >
        {value}
      </div>

      <div className="mt-2 text-xs text-slate-500 text-center">
        {subtext}
      </div>

      <div
        className={cx(
          "mt-2 text-xs font-medium flex items-center gap-1.5",
          footerClassName,
        )}
      >
        {footerIcon}
        <span>{footer}</span>
      </div>
    </div>
  );
}

export default function CloserBodyStats({
  commissionThisMonth,
  commissionBreakdown,
  commissionDelta,
  commissionDeltaDirection = "up",
  bestMonthValue,
  bestMonthSubtext,
  bestMonthFooter,
  loading = false,
}) {
  if (loading) {
    return <CloserBodyStatsShimmer />;
  }

  return (
    <div
      className={cx(
        "w-full overflow-hidden rounded-2xl",
        "border border-slate-200",
        "bg-gradient-to-r from-white via-white to-white",
      )}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2">
        <StatBlock
          icon={<Banknote size={14} className="text-emerald-600" />}
          label="Commission This Month"
          value={commissionThisMonth ?? "—"}
          valueClassName="text-black"
          subtext={commissionBreakdown ?? "—"}
          footer={commissionDelta ?? "—"}
          footerIcon={
            commissionDeltaDirection === "down" ? (
              <ArrowDown size={14} className="text-rose-600" />
            ) : (
              <ArrowUp size={14} className="text-emerald-600" />
            )
          }
          footerClassName={
            commissionDeltaDirection === "down"
              ? "text-rose-600"
              : "text-emerald-600"
          }
          className="md:border-r md:border-slate-200"
        />

        <StatBlock
          icon={<Trophy size={14} className="text-amber-600" />}
          label="Best Month Ever"
          value={bestMonthValue ?? "—"}
          valueClassName="text-black"
          subtext={bestMonthSubtext ?? "—"}
          footer={bestMonthFooter ?? "—"}
          footerIcon=""
          footerClassName="text-black"
          className="md:border-r md:border-slate-200"
        />

        {/* <StatBlock
          icon={<Circle size={10} className="fill-fuchsia-400 text-fuchsia-400" />}
          label="If All 5 Were PIF"
          value={pifIfAllValue}
          valueClassName="text-emerald-300"
          subtext={pifIfAllSubtext}
          footer={pifIfAllFooter}
          footerIcon={<Sparkles size={14} className="text-emerald-300" />}
          footerClassName="text-emerald-300"
        /> */}
      </div>
    </div>
  );
}
