import React, { useMemo } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function RangeDropdown({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none"
      aria-label="Recovered leads range"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function Metric({ value, label, valueClassName }) {
  return (
    <div className="flex flex-col items-center justify-center py-2">
      <div className={cx("text-lg font-bold leading-none", valueClassName)}>
        {value}
      </div>
      <div className="mt-1 text-[10px] font-semibold tracking-wide uppercase text-slate-400 text-center">
        {label}
      </div>
    </div>
  );
}

function LeadRow({ name, email, leadId, ageLabel, actionLabel, actionVariant = "primary" }) {
  const kajabiContactsUrl = useMemo(() => {
    const e = email;
    if (!e) return null;
    return `https://app.kajabi.com/admin/sites/2147813413/contacts?page=1&search=${encodeURIComponent(
      e,
    )}`;
  }, [email]);
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900 truncate">
          {leadId ? (
            <a
              href={`/lead/${leadId}`}
              className="hover:underline underline-offset-2"
              title="Open lead"
            >
              {name}
            </a>
          ) : (
            name
          )}
        </div>
        <div className="text-[11px] text-slate-400 truncate">
          {ageLabel}
          {kajabiContactsUrl && email ? (
            <>
              <span> • </span>
              <a
                href={kajabiContactsUrl}
                target="_blank"
                rel="noreferrer"
                className="hover:underline underline-offset-2"
                title="Open in Kajabi"
                onClick={(e) => e.stopPropagation()}
              >
                {email}
              </a>
            </>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        className={cx(
          "rounded-full px-3 py-1 text-[11px] font-semibold",
          actionVariant === "success"
            ? "bg-emerald-100 text-emerald-700"
            : "bg-indigo-100 text-indigo-700",
        )}
      >
        {actionLabel}
      </button>
    </div>
  );
}

export default function RecoveredLeads({
  loading = false,
  range = "thisWeek",
  onRangeChange,
  stats,
  leads,
}) {
  const tabs = useMemo(
    () => [
      { value: "thisWeek", label: "This wk" },
      { value: "lastWeek", label: "Last wk" },
      { value: "mtd", label: "MTD" },
    ],
    [],
  );

  if (loading) return null;

  const s = stats || {
    noShows: 0,
    recontacted: 0,
    rebooked: 0,
    showUps: 0,
    closed: 0,
    neverContacted: 0,
  };

  const list = Array.isArray(leads) ? leads : [];
  const neverContacted =
    s.neverContacted != null ? Number(s.neverContacted) : Math.max(0, (s.noShows || 0) - (s.recontacted || 0));

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-slate-200 overflow-hidden pb-3">
      <div className="px-4 pt-3 pb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <RotateCcw size={16} className="text-emerald-500" />
          <div className="text-sm font-semibold text-slate-900">
            Recovered Leads
          </div>
        </div>
        <RangeDropdown value={range} onChange={(v) => onRangeChange?.(v)} options={tabs} />
      </div>

      <div className="px-4 pb-3">
        <div className="rounded-xl bg-slate-50 border border-slate-100 overflow-hidden">
          <div className="grid grid-cols-4">
            <div className="py-2">
              <Metric
                value={String(s.noShows ?? 0)}
                label="NO-SHOWS"
                valueClassName="text-rose-500"
              />
            </div>
            <div className="py-2 border-l border-slate-100">
              <Metric
                value={String(s.recontacted ?? 0)}
                label="CONTACTED"
                valueClassName="text-slate-900"
              />
            </div>
            <div className="py-2 border-l border-slate-100">
              <Metric
                value={String(s.rebooked ?? 0)}
                label="REBOOKED"
                valueClassName="text-slate-900"
              />
            </div>
            <div className="py-2 border-l border-slate-100">
              <Metric
                value={String(s.showUps ?? 0)}
                label="SHOW-UPS"
                valueClassName="text-slate-900"
              />
            </div>
            {/* <div className="py-2 border-l border-slate-100">
              <Metric
                value={String(s.closed ?? 0)}
                label="CLOSED"
                valueClassName="text-emerald-600"
              />
            </div> */}
          </div>
        </div>

        {neverContacted > 0 ? (
          <div className="mt-3 rounded-xl bg-rose-50 border border-rose-100 px-3 py-2 text-[11px] font-semibold text-rose-700 text-center flex items-center justify-center gap-2">
            <AlertTriangle size={14} className="text-rose-600" />
            <span>
              {neverContacted} no-shows never contacted
            </span>
          </div>
        ) : null}
      </div>

      <div className="px-4 divide-y divide-slate-100">
        {list.length === 0 ? (
          <div className="py-6 text-center text-[12px] text-slate-500">
            No recovered leads in this range.
          </div>
        ) : (
          list.slice(0, 5).map((l, idx) => (
            <LeadRow
              key={`${l.name}-${idx}`}
              name={l.name}
              email={l.email}
              leadId={l.leadId}
              ageLabel={l.ageLabel}
              actionLabel={l.actionLabel}
              actionVariant={l.actionVariant}
            />
          ))
        )}
      </div>
    </div>
  );
}
