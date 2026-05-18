import React from "react";
import { useNavigate } from "react-router-dom";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function statusClasses(status) {
  if (status === "red") return "bg-red-50 border-red-100";
  if (status === "green") return "bg-green-50 border-green-100";
  return "bg-gray-100 border-gray-200";
}

function tagClasses(status) {
  if (status === "red") return "bg-red-100/80 text-red-800 ring-red-200/60";
  if (status === "green") return "bg-green-100/80 text-green-800 ring-green-200/60";
  return "bg-slate-200/70 text-slate-600 ring-slate-300/50";
}

const LEGEND = [
  {
    status: "gray",
    text: "Under 30 days",
    textClass: "text-slate-500",
  },
  {
    status: "red",
    text: "1 Kajabi pay, 30+ days, no payoff",
    textClass: "text-red-600",
  },
  {
    status: "green",
    text: "2 Kajabi pays or payoff in CRM",
    textClass: "text-green-700",
  },
];

function LegendSwatch({ status }) {
  const swatch =
    status === "red"
      ? "bg-red-400"
      : status === "green"
        ? "bg-green-500"
        : "bg-slate-300";
  return (
    <span
      className={cx("h-1.5 w-1.5 shrink-0 rounded-sm", swatch)}
      aria-hidden
    />
  );
}

export default function KajabiMultipay({ loading = false, entries }) {
  const navigate = useNavigate();
  const rows = Array.isArray(entries) ? entries : [];

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-4 pt-3 pb-2">
        <div className="text-sm font-semibold text-slate-900">
          Kajabi Multipay{" "}
          <span className="text-[12px] text-slate-500">(Last month)</span>
        </div>

        <ul
          className="mt-1.5 space-y-0.5"
          aria-label="Row color legend"
        >
          {LEGEND.map((item) => (
            <li
              key={item.status}
              className="flex items-center gap-1.5 text-[9px] leading-tight"
            >
              <LegendSwatch status={item.status} />
              <span className={item.textClass}>{item.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="px-4 pb-3 flex flex-col gap-2">
        {loading ? (
          <div className="py-2 text-[12px] text-slate-500">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="py-2 text-[12px] text-slate-500">
            No multipay in last month
          </div>
        ) : (
          rows.map((row, i) => (
            <div
              key={`${row?.lead_id ?? "na"}-${row?.email ?? "na"}-${i}`}
              role={row.lead_id ? "button" : undefined}
              tabIndex={row.lead_id ? 0 : undefined}
              onClick={
                row.lead_id ? () => navigate(`/lead/${row.lead_id}`) : undefined
              }
              onKeyDown={
                row.lead_id
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/lead/${row.lead_id}`);
                      }
                    }
                  : undefined
              }
              className={cx(
                "rounded-xl border px-2.5 py-2 text-xs min-w-0",
                statusClasses(row.status),
                row.lead_id ? "cursor-pointer hover:opacity-80 transition" : "",
              )}
            >
              <div className="flex items-baseline justify-between gap-2 min-w-0">
                <span
                  className="font-semibold text-slate-900 truncate"
                  title={row.name}
                >
                  {row.name}
                </span>
                <span className="shrink-0 text-[10px] text-slate-400 tabular-nums">
                  {row.date}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2 min-w-0">
                <span
                  className="text-[10px] text-slate-500 truncate min-w-0"
                  title={row.email}
                >
                  {row.email}
                </span>
                {row.statusLabel ? (
                  <span
                    className={cx(
                      "shrink-0 inline-flex rounded px-1 py-px text-[9px] font-semibold leading-tight ring-1 ring-inset max-w-[52%] truncate",
                      tagClasses(row.status),
                    )}
                    title={row.statusTitle || row.statusLabel}
                  >
                    {row.statusLabel}
                  </span>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
