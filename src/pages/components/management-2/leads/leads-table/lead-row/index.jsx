import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Clock,
  MoreVertical,
  StickyNote,
  UserRound,
} from "lucide-react";
import StatusDropdown from "../status-dropdown";
import {
  getCountryFlagFromPhone,
  getCountryFromPhone,
} from "../../../../../../utils/phoneNumberParser";

function cx(...p) {
  return p.filter(Boolean).join(" ");
}

// Same colour mapping as CloserTodaysLeads `callTimeColor`.
function callTimeColor(time, isRescheduled, called) {
  if (time === undefined) return "#e5e7eb";
  if (isRescheduled && !called) return "#dd86ddff";
  if (!called) return "#cfcfcfff";
  if (time < 6) return "#88ff2dff";
  if (time < 15) return "#fdd329ff";
  if (time >= 15) return "#ff8b8bff";
  return "#e5e7eb";
}

function ResponsePill({ lead }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-md px-2 py-1 text-[12px] font-semibold"
      style={{
        backgroundColor: callTimeColor(
          lead?.responseTimeMinutes,
          lead?.is_reschedule,
          lead?.called,
        ),
        color: "#343434ff",
      }}
      title="Response"
    >
      {lead?.called ? `${lead?.responseTimeMinutes}m` : "Not called"}
    </span>
  );
}

function ActionMenu({ open, onToggle, canReschedule }) {
  const anchorRef = useRef(null);
  const menuRef = useRef(null);
  const [menuPos, setMenuPos] = useState({ left: 0, top: 0 });

  useEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    if (!anchor) return;

    const gap = 8;
    const computeAndSetPos = () => {
      const rect = anchor.getBoundingClientRect();
      const menuEl = menuRef.current;
      const menuRect = menuEl?.getBoundingClientRect?.();
      if (!menuRect) {
        setMenuPos({ left: rect.right, top: rect.bottom + gap });
        return;
      }

      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < menuRect.height + gap;
      const top = openUp
        ? Math.max(gap, rect.top - menuRect.height - gap)
        : rect.bottom + gap;
      const left = Math.min(
        window.innerWidth - gap,
        Math.max(gap, rect.right - menuRect.width),
      );
      setMenuPos({ left, top });
    };

    computeAndSetPos();
    const raf = requestAnimationFrame(computeAndSetPos);
    window.addEventListener("resize", computeAndSetPos);
    window.addEventListener("scroll", computeAndSetPos, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", computeAndSetPos);
      window.removeEventListener("scroll", computeAndSetPos, true);
    };
  }, [open]);

  const noop = (e) => {
    e?.stopPropagation?.();
    onToggle?.();
  };

  return (
    <div className="relative">
      <span
        onClick={onToggle}
        className="cursor-pointer"
        aria-label="Actions"
        ref={anchorRef}
      >
        <MoreVertical size={20} color="#000" />
      </span>
      {open ? (
        <>
          <div
            ref={menuRef}
            className="fixed w-56 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden z-[10000]"
            style={{ left: menuPos.left, top: menuPos.top }}
          >
            <button
              type="button"
              onClick={noop}
              className="w-full px-3 py-2 text-left text-[12px] font-medium text-slate-600 cursor-pointer bg-white hover:bg-slate-50 active:bg-slate-100"
            >
              Copy call id
            </button>
            <button
              type="button"
              onClick={noop}
              className="w-full px-3 py-2 text-left text-[12px] font-medium text-slate-600 cursor-pointer bg-white hover:bg-slate-50 active:bg-slate-100"
            >
              Transfer
            </button>
            <button
              type="button"
              onClick={noop}
              className="w-full px-3 py-2 text-left text-[12px] font-medium text-slate-600 cursor-pointer bg-white hover:bg-slate-50 active:bg-slate-100"
            >
              Recover lead
            </button>
            <button
              type="button"
              onClick={noop}
              className="w-full px-3 py-2 text-left text-[12px] font-medium text-slate-600 cursor-pointer bg-white hover:bg-slate-50 active:bg-slate-100"
            >
              Setter Notes
            </button>
            <button
              type="button"
              onClick={noop}
              className="w-full px-3 py-2 text-left text-[12px] font-medium text-slate-600 cursor-pointer bg-white hover:bg-slate-50 active:bg-slate-100"
            >
              Closer Notes
            </button>
            <button
              type="button"
              onClick={noop}
              className="w-full px-3 py-2 text-left text-[12px] font-medium text-blue-600 cursor-pointer bg-white hover:bg-slate-50 active:bg-slate-100"
            >
              Send to ManyChat
            </button>
            {canReschedule ? (
              <button
                type="button"
                onClick={noop}
                className="w-full px-3 py-2 text-left text-[12px] font-medium text-blue-600 cursor-pointer bg-white hover:bg-slate-50 active:bg-slate-100"
              >
                Reschedule Call
              </button>
            ) : null}
            <button
              type="button"
              onClick={noop}
              className="w-full px-3 py-2 text-left text-[12px] font-medium text-red-600 cursor-pointer bg-white hover:bg-slate-50 active:bg-slate-100"
            >
              Delete call
            </button>
            <button
              type="button"
              onClick={noop}
              className="w-full px-3 py-2 text-left text-[12px] font-medium text-red-600 cursor-pointer bg-white hover:bg-slate-50 active:bg-slate-100"
            >
              Report
            </button>
          </div>
          <div
            className="fixed inset-0 z-[9999]"
            onClick={(e) => {
              e.stopPropagation();
              onToggle?.();
            }}
          />
        </>
      ) : null}
    </div>
  );
}

// Compact PCSP status badges for the "All" tab — solid colour per label,
// matching the brand palette (P=amber, C=indigo, S=emerald, $=rose).
const STATUS_BADGE_COLOURS = {
  P: "bg-amber-500",
  C: "bg-indigo-600",
  S: "bg-emerald-500",
  $: "bg-rose-500",
};

function StatusBadge({ value, label, title }) {
  const isUnset = value === null || value === undefined;
  const baseColour = STATUS_BADGE_COLOURS[label] || "bg-slate-400";
  return (
    <span
      title={title}
      className={cx(
        "inline-flex h-[25px] w-[25px] items-center justify-center rounded-md text-[12px] font-extrabold text-white shadow-[0_1px_2px_rgba(15,23,42,0.18)]",
        isUnset ? "bg-slate-300" : baseColour,
      )}
    >
      {label}
    </span>
  );
}

export default function LeadRow({
  lead,
  setterName,
  actionsOpen,
  onToggleActions,
  useCompactStatusBadges = false,
}) {
  const profile = lead?.leads || {};
  const name = profile?.name || "—";
  const email = profile?.email || "—";
  const phone = profile?.phone || "—";

  const manyChatUrl = useMemo(() => {
    if (!phone || phone === "—") return null;
    const digits = String(phone).replace(/\D/g, "");
    if (!digits) return null;
    const template =
      "https://app.manychat.com/signin?return=%2Ffb1237190%2Fchat%2F256311379";
    return template.replace(/(chat%2F)\d+$/, `$1${encodeURIComponent(digits)}`);
  }, [phone]);

  const kajabiContactsUrl = useMemo(() => {
    const e = profile?.email;
    if (!e) return null;
    return `https://app.kajabi.com/admin/sites/2147813413/contacts?page=1&search=${encodeURIComponent(
      e,
    )}`;
  }, [profile?.email]);

  const emojiStack = (() => {
    const callSource = lead?.source_type || profile?.source || "organic";
    const isAds = String(callSource).toLowerCase().includes("ad");
    const callCampaign = lead?.utm_campaign;
    return (
      <>
        <span className="text-[16px] leading-4">{isAds ? "💰" : "🌱"}</span>
        {(callCampaign === "dm-setter" || callCampaign === "ai-setting") && (
          <span className="text-[16px] leading-4">💬</span>
        )}
        {(lead?.recovered || lead?.is_reschedule) && (
          <span
            className="text-[16px] leading-4"
            title={lead?.recovered ? "Recovered lead" : "Reschedule"}
          >
            {lead?.recovered ? "♻️" : "🔁"}
          </span>
        )}
        {lead?.cancelled && <span className="text-[16px] leading-4">❌</span>}
      </>
    );
  })();

  const timeIso = lead?.call_date || lead?.book_date;
  const timeLabel = timeIso
    ? new Date(timeIso).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  const [pickUpValue, setPickUpValue] = useState(() =>
    formatStatusValue(lead?.picked_up),
  );
  const [confirmedValue, setConfirmedValue] = useState(() =>
    formatStatusValue(lead?.confirmed),
  );
  const [showUpValue, setShowUpValue] = useState(() =>
    formatStatusValue(lead?.showed_up),
  );
  const [purchaseValue, setPurchaseValue] = useState(() =>
    formatStatusValue(lead?.purchased),
  );

  return (
    <div
      className={cx(
        "px-3",
        lead?.cancelled ? "bg-red-500/5 text-slate-500" : null,
      )}
    >
      <div
        className={cx(
          "grid items-center gap-4 py-2",
          useCompactStatusBadges
            ? "grid-cols-[24px_minmax(200px,1fr)_130px_84px_200px_110px_86px_56px]"
            : "grid-cols-[24px_minmax(240px,1fr)_140px_90px_260px_86px_56px]",
        )}
      >
        <div className="flex flex-col items-center justify-center gap-1">
          {emojiStack}
        </div>

        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 truncate">
            {name}
          </div>
          <div className="mt-1 text-[11px] text-slate-400 truncate">
            <div className="flex items-start gap-1 flex-col">
              {kajabiContactsUrl && email && email !== "—" ? (
                <a
                  href={kajabiContactsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline underline-offset-2 text-slate-900"
                  title="Open in Kajabi"
                  onClick={(e) => e.stopPropagation()}
                >
                  {email}
                </a>
              ) : (
                email
              )}
              <div className="flex items-center gap-1">
                {manyChatUrl ? (
                  <a
                    href={manyChatUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline underline-offset-2 text-slate-900"
                    title="Open in ManyChat"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {phone}
                  </a>
                ) : (
                  phone
                )}
                {phone && getCountryFlagFromPhone(phone) ? (
                  <span className="ml-1" title={getCountryFromPhone(phone)}>
                    {getCountryFlagFromPhone(phone)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-1.5 bg-slate-100/80 rounded-full px-2 py-1 text-[11px] text-slate-600 w-auto">
          <UserRound size={14} className="text-slate-400 flex-shrink-0" />
          <span className="truncate">
            <span className="font-semibold text-slate-700">
              {setterName || "—"}
            </span>
          </span>
        </div>

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-600">
          <Clock size={14} className="text-slate-400" />
          <span className="font-semibold text-slate-700">{timeLabel}</span>
        </div>

        <div className="flex items-center justify-center">
          {useCompactStatusBadges ? (
            <div className="flex items-center gap-1.5">
              <StatusBadge value={lead?.picked_up} label="P" title="Picked Up" />
              <StatusBadge value={lead?.confirmed} label="C" title="Confirmed" />
              <StatusBadge
                value={lead?.showed_up}
                label="S"
                title="Showed Up"
              />
              <StatusBadge
                value={lead?.purchased}
                label="$"
                title="Purchased"
              />
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <StatusDropdown
                value={pickUpValue}
                onChange={setPickUpValue}
                label="PICK UP"
                disabled
              />
              <StatusDropdown
                value={confirmedValue}
                onChange={setConfirmedValue}
                label="CONFIRMED"
                disabled
              />
              <StatusDropdown
                value={showUpValue}
                onChange={setShowUpValue}
                label="SHOW UP"
                outcomeLog={lead?.outcome_log}
              />
              <StatusDropdown
                value={purchaseValue}
                outcomeLog={lead?.outcome_log}
                label="PURCHASED"
                disabled={lead?.showed_up === false}
                onChange={setPurchaseValue}
              />
            </div>
          )}
        </div>

        {useCompactStatusBadges ? (
          <div className="flex items-center justify-center">
            <ResponsePill lead={lead} />
          </div>
        ) : null}

        <div className="flex items-center justify-center gap-1">
          <div className="flex items-center justify-center">
            <button
              type="button"
              className="h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-2.5 text-[11px] font-semibold text-slate-700 inline-flex items-center gap-1.5 transition focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              aria-label="Add note"
              title="Add note"
            >
              <StickyNote size={14} className="text-slate-500" />
              Note
            </button>
          </div>

          <div className="flex items-center justify-end">
            <ActionMenu
              open={actionsOpen}
              onToggle={onToggleActions}
              canReschedule={!!lead?.reschedule_link}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function formatStatusValue(value) {
  if (value === true) return "true";
  if (value === false) return "false";
  if (value === null || value === undefined) return "null";
  return value;
}
