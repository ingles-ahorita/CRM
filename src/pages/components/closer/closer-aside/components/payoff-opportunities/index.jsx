import React, { useMemo, useState } from "react";
import { HandCoins, UserRound } from "lucide-react";
import { NotesModal } from "../../../../Modal";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function Avatar({ initials }) {
  return (
    <div className="h-10 w-10 rounded-full bg-slate-100 text-black flex items-center justify-center">
      <UserRound size={18} className="text-black/70" />
    </div>
  );
}

function OppRow({ initials, name, meta, actionLabel, onAction, actionDisabled = false }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <Avatar initials={initials} />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 truncate">{name}</div>
          <div className="text-[11px] text-slate-400 truncate" title={meta}>{meta}</div>
        </div>
      </div>

      <button
        type="button"
        disabled={actionDisabled}
        onClick={onAction}
        className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold px-2 py-2 transition whitespace-nowrap"
      >
        {actionLabel}
      </button>
    </div>
  );
}

export default function PayoffOpportunities({ loading = false, entries }) {
  if (loading) return null;

  const [openEntry, setOpenEntry] = useState(null);

  const list =
    entries?.length
      ? entries
      : [
          { name: "Luis", meta: "$1497 payoff target • 12d left", actionLabel: "Upgrade PIF" },
          { name: "Jasmina Ortez", meta: "$1497 payoff target • 19d left", actionLabel: "Upgrade PIF" },
          { name: "Jesus", meta: "$897 payoff target • 8d left", actionLabel: "Upgrade PIF" },
        ];

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <HandCoins size={16} className="text-orange-500" />
            <div className="text-sm font-semibold text-slate-900">Payoff Opportunities</div>
          </div>
          <div className="text-[11px] text-slate-400">(Kajabi multi-pay → PIF upgrade)</div>
        </div>
      </div>

      <div className="px-4 divide-y divide-slate-100">
        {list.length === 0 ? (
          <div className="py-6 text-center text-[12px] text-slate-500">
            No payoff opportunities right now.
          </div>
        ) : (
          list.slice(0, 5).map((e, idx) => (
            <OppRow
              key={`${e.name}-${idx}`}
              initials={e.initials || "—"}
              name={e.name || "—"}
              meta={e.meta || ""}
              actionLabel={e.actionLabel || "Upgrade PIF"}
              actionDisabled={!e?.call?.id}
              onAction={() => setOpenEntry(e)}
            />
          ))
        )}
      </div>

      <div className="px-4 py-3 text-[11px] text-slate-400 text-center">
        💡 Convert any of these → full PIF commission
      </div>

      <NotesModal
        isOpen={!!openEntry}
        onClose={() => setOpenEntry(null)}
        lead={openEntry?.call || null}
        callId={openEntry?.call?.id}
        mode="closer"
        initialKajabiPurchaseId={openEntry?.kajabiPurchaseId || null}
        initialPurchaseDisplay={openEntry?.initialPurchaseDisplay || null}
      />
    </div>
  );
}

