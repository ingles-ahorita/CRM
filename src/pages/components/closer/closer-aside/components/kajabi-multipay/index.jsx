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

        <div className="mt-2 text-[10px] text-slate-400">
          Gray / red (1 pay, &gt;1 mo) / green (2 pay)
        </div>
      </div>

      <div className="px-4 pb-3 space-y-1.5 flex flex-col gap-2">
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
                <span className="shrink-0 text-[10px] text-slate-400">
                  {row.date}
                </span>
              </div>
              <div
                className="mt-0.5 text-[10px] text-slate-500 truncate"
                title={row.email}
              >
                {row.email}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
