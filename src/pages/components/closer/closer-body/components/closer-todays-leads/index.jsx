import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Contact,
  Copy,
  Filter,
  Search,
  MessageCircle,
  MoreVertical,
  StickyNote,
  UserRound,
  X,
} from "lucide-react";
import CloserTodaysLeadsShimmer from "../../../shimmers/closer-body/closer-todays-leads";
import { Modal, NotesModal, ViewNotesModal } from "../../../../Modal";
import RecoverLeadModal from "../../../../RecoverLeadModal";
import { TransferSetterModal } from "../../../../TransferSetterModal";
import { deleteCallWithDependencies, StatusBadge } from "../../../../LeadItem";
import { supabase } from "../../../../../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import {
  buildCallDataFromLead,
  sendToCloserMC,
  setManychatFieldsByName,
  updateManychatField,
  updateManychatCallFields,
} from "../../../../../../utils/manychatService";
import {
  getCountryFlagFromPhone,
  getCountryFromPhone,
} from "../../../../../../utils/phoneNumberParser";
import NoShowStateModal from "../../../../NoShowStateModal";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

const MAIN_TABS = {
  leads: "leads",
  payoff: "payoff",
};

const TABS = [
  { key: "yesterday", label: "Yesterday" },
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "tomorrow + 1", label: "+1" },
  { key: "no shows", label: "No Shows" },
  { key: "follow ups", label: "Follow Ups" },
  { key: "all", label: "All" },
];

function MainTabs({ value, onChange, leadsCount = 0, payoffCount = 0 }) {
  const tabs = [
    { key: MAIN_TABS.leads, label: "Leads", count: leadsCount },
    {
      key: MAIN_TABS.payoff,
      label: "Payoff Opportunities",
      count: payoffCount,
      redDot: payoffCount > 0,
    },
  ];

  return (
    <div className="inline-flex rounded-lg bg-slate-100/80 p-1">
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange?.(t.key)}
            className={cx(
              "px-3 py-1 text-[11px] font-semibold rounded-md transition !outline-none",
              active
                ? "bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.10)]"
                : "text-slate-500 hover:text-slate-700 bg-slate-100/80",
            )}
          >
            <span className="inline-flex items-center gap-2">
              {t.redDot ? (
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              ) : null}
              <span>{t.label}</span>
              <span
                className={cx(
                  "rounded-md px-2 py-0.5 text-[10px] font-bold",
                  active
                    ? "bg-slate-100 text-slate-700"
                    : "bg-white text-slate-600 border border-slate-200",
                )}
              >
                {t.count}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Tabs({ value, onChange }) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100/80 p-1">
      {TABS.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange?.(t.key)}
            className={cx(
              "px-3 py-1 text-[11px] font-semibold rounded-md transition !outline-none",
              active
                ? "bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.10)]"
                : "text-slate-500 hover:text-slate-700 bg-slate-100/80",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function StatusPill({
  children,
  tone = "neutral",
  as: As = "span",
  className,
  ...props
}) {
  const cls =
    tone === "good"
      ? "bg-emerald-100 text-emerald-700"
      : tone === "warn"
        ? "bg-amber-100 text-amber-700"
        : tone === "bad"
          ? "bg-rose-100 text-rose-700"
          : "bg-slate-100 text-slate-600";
  return (
    <As
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[9px] font-semibold",
        cls,
        className,
      )}
      {...props}
    >
      {children}
    </As>
  );
}

const formatStatusValue = (value) => {
  if (value === true) return "true";
  if (value === false) return "false";
  if (value === null || value === undefined) return "null";
  return value;
};

async function firePifConfetti() {
  try {
    const mod = await import("canvas-confetti");
    const confetti = mod?.default || mod;
    confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.6 },
      scalar: 0.9,
      ticks: 220,
    });
    confetti({
      particleCount: 70,
      spread: 100,
      origin: { y: 0.65 },
      startVelocity: 35,
      scalar: 0.8,
      ticks: 200,
    });
  } catch (e) {
    console.warn("[CloserTodaysLeads] confetti failed to load:", e);
  }
}

function StatusPillControl({
  label,
  value,
  onChange,
  goodTone = "good",
  badTone = "neutral",
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const s =
    value === "true" || value === true
      ? "yes"
      : value === "false" || value === false
        ? "no"
        : "unknown";
  const pillTone = s === "yes" ? goodTone : s === "no" ? badTone : "warn";
  const pillText = s === "yes" ? "✓" : s === "no" ? "✕" : "?";

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const triggerEl = triggerRef.current;
      if (!triggerEl) return;
      const rect = triggerEl.getBoundingClientRect();
      const menuHeight = menuRef.current?.offsetHeight || 108;
      const openUp = rect.bottom + menuHeight + 8 > window.innerHeight;
      const top = openUp
        ? Math.max(8, rect.top - menuHeight - 8)
        : Math.min(window.innerHeight - menuHeight - 8, rect.bottom + 8);
      const left = Math.max(8, Math.min(window.innerWidth - 120, rect.left));
      setMenuPosition({ top, left });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  return (
    <div className="relative flex justify-center items-center">
      <span ref={triggerRef} className="inline-flex">
        <StatusPill
          as="button"
          type="button"
          disabled={disabled}
          onClick={() => {
            // TEMP: For PURCHASED, don't open dropdown — just show celebration animation.
            if (label === "PURCHASED") {
              firePifConfetti();
              return;
            }
            setOpen((v) => !v);
          }}
          className={cx(
            "focus:outline-none focus:ring-2 focus:ring-indigo-500/40",
            disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          )}
          aria-label={label}
          title={label}
          tone={pillTone}
        >
          {label} {pillText}
        </StatusPill>
      </span>

      {open && !disabled ? (
        <>
          <div
            ref={menuRef}
            className="fixed z-[80] w-28 rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden"
            style={{
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onChange?.("true");
              }}
              className="w-full px-3 py-2 text-left text-[12px] font-semibold bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100"
            >
              YES
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onChange?.("false");
              }}
              className="w-full px-3 py-2 text-left text-[12px] font-semibold bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100"
            >
              NO
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onChange?.("null");
              }}
              className="w-full px-3 py-2 text-left text-[12px] font-semibold bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100"
            >
              TBD
            </button>
          </div>
          <div
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            onClick={() => setOpen(false)}
            aria-label="Close status menu"
            role="button"
            tabIndex={-1}
          />
        </>
      ) : null}
    </div>
  );
}

// LeadItem.jsx-compatible dropdown UI (YES/NO/TBD with colored background)
function StatusDropdown({
  value,
  onChange,
  label,
  disabled = false,
  onClick = null,
  outcomeLog = null,
}) {
  const getBackgroundColor = () => {
    const isDontQualify = Array.isArray(outcomeLog)
      ? outcomeLog.some((ol) => ol?.outcome === "dont_qualify")
      : outcomeLog?.outcome === "dont_qualify";
    if (isDontQualify && label === "PURCHASED") return "#000000";
    if (label === "PURCHASED") {
      const isLockIn = Array.isArray(outcomeLog)
        ? outcomeLog.some((ol) => ol?.outcome === "lock_in")
        : outcomeLog?.outcome === "lock_in";
      const isFollowUp = Array.isArray(outcomeLog)
        ? outcomeLog.some((ol) => ol?.outcome === "follow_up")
        : outcomeLog?.outcome === "follow_up";
      if (isLockIn || isFollowUp) return "#e9d5ff";
    }
    if (value === true || value === "true") return "#cfffc5ff";
    if (value === false || value === "false") return "#ff9494ff";
    if (value === null || value === "" || value === undefined || value === "null")
      return "#f9ffa6ff";
    return "#f9ffa6ff";
  };

  const isDontQualify =
    (label === "SHOW UP" || label === "PURCHASED") &&
    (Array.isArray(outcomeLog)
      ? outcomeLog.some((ol) => ol?.outcome === "dont_qualify")
      : outcomeLog?.outcome === "dont_qualify");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "3px",
        alignItems: "center",
        justifyContent: "center",
        flex: "1 1 68px",
        minWidth: 50,
      }}
    >
      <label
        style={{
          whiteSpace: "nowrap",
          fontSize: "9px",
          fontWeight: "500",
          color: "#6b7280",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {label}
      </label>
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          appearance: "none",
          backgroundColor: getBackgroundColor(),
          color: isDontQualify && label === "PURCHASED" ? "#ffffff" : "#000000",
          borderColor: "#d1d5db",
          border: "1px solid rgba(0,0,0,0.1)",
          padding: "4px 6px",
          borderRadius: "5px",
          fontSize: "12px",
          fontWeight: "500",
          cursor: disabled ? "not-allowed" : "pointer",
          transition: "all 0.1s",
          outline: "none",
          textAlign: "center",
          width: 50,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "0.8";
          e.currentTarget.style.borderColor = "#bcbec0ff";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "1";
          e.currentTarget.style.borderColor = "#d1d5db";
        }}
        onMouseDown={(e) => {
          if (onClick) {
            e.preventDefault();
            onClick();
          }
        }}
      >
        <option
          value={"true"}
          style={{
            backgroundColor: "#cfffc5",
            padding: "12px",
            fontSize: "14px",
            fontWeight: "500",
          }}
        >
          YES
        </option>
        <option value={"false"}>NO</option>
        <option value={"null"}>TBD</option>
      </select>
    </div>
  );
}

function ActionMenu({
  open,
  onToggle,
  onCopyCallId,
  onTransfer,
  onRecoverLead,
  onSetterNotes,
  onCloserNotes,
  onSendManyChat,
  onReschedule,
  onDeleteCall,
  onReport,
  canReschedule,
}) {
  return (
    <div className="relative">
      <span
        onClick={onToggle}
        className="cursor-pointer"
        aria-label="Actions"
      >
        <MoreVertical size={20} color="#000" />
      </span>
      {open ? (
        <>
          <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden z-[9999]">
            <button
              type="button"
              onClick={onCopyCallId}
              className="w-full px-3 py-2 text-left text-[12px] font-medium text-slate-600 cursor-pointer bg-white hover:bg-slate-50 active:bg-slate-100"
            >
              Copy call id
            </button>
            <button
              type="button"
              onClick={onTransfer}
              className="w-full px-3 py-2 text-left text-[12px] font-medium text-slate-600 cursor-pointer bg-white hover:bg-slate-50 active:bg-slate-100"
            >
              Transfer
            </button>
            <button
              type="button"
              onClick={onRecoverLead}
              className="w-full px-3 py-2 text-left text-[12px] font-medium text-slate-600 cursor-pointer bg-white hover:bg-slate-50 active:bg-slate-100"
            >
              Recover lead
            </button>
            <button
              type="button"
              onClick={onSetterNotes}
              className="w-full px-3 py-2 text-left text-[12px] font-medium text-slate-600 cursor-pointer bg-white hover:bg-slate-50 active:bg-slate-100"
            >
              Setter Notes
            </button>
            <button
              type="button"
              onClick={onCloserNotes}
              className="w-full px-3 py-2 text-left text-[12px] font-medium text-slate-600 cursor-pointer bg-white hover:bg-slate-50 active:bg-slate-100"
            >
              Closer Notes
            </button>
            <button
              type="button"
              onClick={onSendManyChat}
              className="w-full px-3 py-2 text-left text-[12px] font-medium text-blue-600 cursor-pointer bg-white hover:bg-slate-50 active:bg-slate-100"
            >
              Send to ManyChat
            </button>
            {canReschedule ? (
              <button
                type="button"
                onClick={onReschedule}
                className="w-full px-3 py-2 text-left text-[12px] font-medium text-blue-600 cursor-pointer bg-white hover:bg-slate-50 active:bg-slate-100"
              >
                Reschedule Call
              </button>
            ) : null}
            <button
              type="button"
              onClick={onDeleteCall}
              className="w-full px-3 py-2 text-left text-[12px] font-medium text-red-600 cursor-pointer bg-white hover:bg-slate-50 active:bg-slate-100"
            >
              Delete call
            </button>
            <button
              type="button"
              onClick={onReport}
              className="w-full px-3 py-2 text-left text-[12px] font-medium text-red-600 cursor-pointer bg-white hover:bg-slate-50 active:bg-slate-100"
            >
              Report
            </button>
          </div>
          <div
            className="fixed inset-0 z-10"
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

function LeadRow({
  lead,
  setterName,
  onUpdateStatus,
  onCopyCallId,
  onTransfer,
  onRecoverLead,
  onSetterNotes,
  onCloserNotes,
  onSendManyChat,
  onReschedule,
  onDeleteCall,
  onReport,
  actionsOpen,
  onToggleActions,
  useCompactStatusBadges = false,
}) {
  const navigate = useNavigate();
  const profile = lead?.leads || {};
  const name = profile?.name || "—";
  const email = profile?.email || "—";
  const phone = profile?.phone || "—";
  const leadId = profile?.id ?? lead?.lead_id ?? null;

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
  const [showConfirmCancelModal, setShowConfirmCancelModal] = useState(false);
  const [pendingConfirmedValue, setPendingConfirmedValue] = useState(null);
  const [showNoShowStateModal, setShowNoShowStateModal] = useState(false);

  useEffect(() => {
    setPickUpValue(formatStatusValue(lead?.picked_up));
    setConfirmedValue(formatStatusValue(lead?.confirmed));
    setShowUpValue(formatStatusValue(lead?.showed_up));
    setPurchaseValue(formatStatusValue(lead?.purchased));
  }, [lead]);

  return (
    <div
      className={cx(
        "px-3",
        lead?.cancelled ? "bg-red-500/5 text-slate-500" : null,
      )}
    >
      <div className="grid grid-cols-[24px_minmax(240px,1fr)_140px_90px_260px_86px_56px] items-center gap-4 py-2">
        <div className="flex flex-col items-center justify-center gap-1">
          {emojiStack}
        </div>

        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 truncate">
            {leadId ? (
              <span
                onClick={() => navigate(`/lead/${leadId}`)}
                className="cursor-pointer hover:underline underline-offset-2"
                title="Open lead"
              >
                {name}
              </span>
            ) : (
              name
            )}
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

        <div className="flex items-center justify-center gap-1.5 bg-slate-100/80 rounded-full px-2 py-1 text-[11px] text-slate-600 min-w-0">
          <UserRound size={14} className="text-slate-400 flex-shrink-0" />
          <span className="truncate">
            <span className="text-slate-500">Setter: </span>
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
              <StatusBadge
                value={lead?.picked_up}
                label="P"
                title="Picked Up"
              />
              <StatusBadge
                value={lead?.confirmed}
                label="C"
                title="Confirmed"
              />
              <StatusBadge
                value={lead?.showed_up}
                label="S"
                title="Showed Up"
                outcomeLog={lead?.outcome_log}
              />
              <StatusBadge
                value={lead?.purchased}
                label="$"
                title="Purchased"
                outcomeLog={lead?.outcome_log}
              />
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <StatusDropdown
                value={pickUpValue}
                onChange={(v) =>
                  onUpdateStatus?.(lead, "picked_up", v, setPickUpValue)
                }
                label="PICK UP"
                // Match LeadItem.jsx: disabled in closer/view mode
                disabled={true}
              />
              <StatusDropdown
                value={confirmedValue}
                onChange={(v) => {
                  if (v === "false" || v === false) {
                    setPendingConfirmedValue(v);
                    setShowConfirmCancelModal(true);
                  } else {
                    onUpdateStatus?.(lead, "confirmed", v, setConfirmedValue);
                  }
                }}
                label="CONFIRMED"
                // Match LeadItem.jsx: disabled in closer/view mode
                disabled={true}
              />
              <StatusDropdown
                value={showUpValue}
                onChange={(v) => {
                  if (v === "false" || v === false) {
                    setShowNoShowStateModal(true);
                  } else {
                    onUpdateStatus?.(lead, "showed_up", v, setShowUpValue);
                  }
                }}
                onClick={
                  showUpValue === "false" || showUpValue === false
                    ? () => setShowNoShowStateModal(true)
                    : undefined
                }
                label="SHOW UP"
                outcomeLog={lead?.outcome_log}
              />
              <StatusDropdown
                value={purchaseValue}
                outcomeLog={lead?.outcome_log}
                onClick={() => onCloserNotes?.()}
                label="PURCHASED"
                // Match LeadItem.jsx: disabled when showed_up is false (closer/admin case)
                disabled={lead?.showed_up === false}
                onChange={(v) =>
                  onUpdateStatus?.(lead, "purchased", v, setPurchaseValue)
                }
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-1">
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={onCloserNotes}
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
              onCopyCallId={onCopyCallId}
              onTransfer={onTransfer}
              onRecoverLead={onRecoverLead}
              onSetterNotes={onSetterNotes}
              onCloserNotes={onCloserNotes}
              onSendManyChat={onSendManyChat}
              onReschedule={onReschedule}
              onDeleteCall={onDeleteCall}
              onReport={onReport}
              canReschedule={!!lead?.reschedule_link}
            />
          </div>
        </div>
      </div>

      <Modal
        isOpen={showConfirmCancelModal}
        onClose={() => {
          setShowConfirmCancelModal(false);
          setPendingConfirmedValue(null);
        }}
      >
        <div style={{ padding: "24px", maxWidth: "400px" }}>
          <h2
            style={{
              marginBottom: "16px",
              fontSize: "20px",
              fontWeight: "600",
              color: "#111827",
            }}
          >
            Confirm Cancellation
          </h2>
          <p
            style={{
              marginBottom: "24px",
              fontSize: "14px",
              color: "#6b7280",
              lineHeight: "1.5",
            }}
          >
            Are you sure you want to <strong>cancel this call</strong>?
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => {
                setShowConfirmCancelModal(false);
                setPendingConfirmedValue(null);
              }}
              style={{
                padding: "10px 20px",
                backgroundColor: "#f3f4f6",
                color: "#374151",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: "500",
                cursor: "pointer",
                outline: "none",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (pendingConfirmedValue != null) {
                  onUpdateStatus?.(
                    lead,
                    "confirmed",
                    pendingConfirmedValue,
                    setConfirmedValue,
                    { cancelled: true },
                  );
                }
                setShowConfirmCancelModal(false);
                setPendingConfirmedValue(null);
              }}
              style={{
                padding: "10px 20px",
                backgroundColor: "#ef4444",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: "500",
                cursor: "pointer",
                outline: "none",
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      </Modal>

      <NoShowStateModal
        isOpen={showNoShowStateModal}
        onClose={() => setShowNoShowStateModal(false)}
        leadName={name}
        currentNoShowState={lead?.no_show_state}
        onConfirm={async (noShowState) => {
          const extraUpdates =
            noShowState === "showed_up_yes" ? {} : { no_show_state: noShowState };
          const showedUpValue = noShowState === "showed_up_yes";
          const ok = await onUpdateStatus?.(
            lead,
            "showed_up",
            showedUpValue ? "true" : "false",
            setShowUpValue,
            extraUpdates,
          );
          return !!ok;
        }}
      />
    </div>
  );
}

function PayoffRow({
  name,
  meta,
  actionLabel,
  onAction,
  actionDisabled = false,
  onDismiss,
}) {
  const cleanPhone = (p) => String(p || "").replace(/\D/g, "");
  const phoneDigits = cleanPhone(meta?.phone);
  const phoneDisplay = meta?.phone || "—";
  const waUrl = phoneDigits
    ? `https://wa.me/${encodeURIComponent(phoneDigits)}`
    : null;

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-10 w-10 rounded-full bg-slate-100 text-black flex items-center justify-center">
          <UserRound size={18} className="text-black/70" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 truncate">
            {name || "—"}
          </div>
          <div className="text-[11px] text-slate-400 truncate">
            {meta?.line || ""}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-600">
            <span className="truncate">{phoneDisplay}</span>
            {phoneDigits ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(String(phoneDigits));
                }}
                title="Copy phone"
              >
                <Copy size={12} />
                Copy
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss?.();
          }}
          className="rounded-lg bg-red-500 hover:bg-red-600 text-white text-[11px] font-bold px-3 py-2 transition inline-flex items-center gap-1.5 !outline-none !ring-0 !ring-offset-0 !border-none"
          title="Remove"
        >
          <X size={14} />
          Remove
        </button>
        <button
          type="button"
          disabled={!waUrl}
          onClick={(e) => {
            e.stopPropagation();
            if (waUrl) window.open(waUrl, "_blank", "noopener,noreferrer");
          }}
          className={cx(
            "rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-bold px-3 py-2 transition inline-flex items-center gap-1.5",
            !waUrl ? "opacity-50 cursor-not-allowed" : null,
          )}
          title={waUrl ? "Open WhatsApp" : "No phone number"}
        >
          <Contact size={14} />
          Contact
        </button>
        <button
          type="button"
          disabled={actionDisabled}
          onClick={onAction}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold px-3 py-2 transition"
        >
          {actionLabel || "Upgrade PIF"}
        </button>
      </div>
    </div>
  );
}

export default function CloserTodaysLeads({
  loading = false,
  title = "Today's Leads",
  leads = [],
  setterMap = {},
  closerList = [],
  payoffLoading = false,
  payoffEntries = [],
  onLeadDeleted,
  activeTab = "today",
  onTabChange,
}) {
  const safeLeads = Array.isArray(leads) ? leads : [];
  const tabValue = useMemo(() => activeTab || "today", [activeTab]);
  const [mainTab, setMainTab] = useState(MAIN_TABS.leads);
  const [dismissedPayoffIds, setDismissedPayoffIds] = useState(() => new Set());
  const rawPayoffList = Array.isArray(payoffEntries) ? payoffEntries : [];
  const payoffList = useMemo(() => {
    if (!dismissedPayoffIds?.size) return rawPayoffList;
    return rawPayoffList.filter((p) => {
      const id = String(p?.kajabiPurchaseId || p?.call?.id || "");
      return !dismissedPayoffIds.has(id);
    });
  }, [rawPayoffList, dismissedPayoffIds]);
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });
  const [noteLead, setNoteLead] = useState(null);
  const [viewLead, setViewLead] = useState(null);
  const [setterNoteLead, setSetterNoteLead] = useState(null);
  const [closerNoteLead, setCloserNoteLead] = useState(null);
  const [transferLead, setTransferLead] = useState(null);
  const [recoverLead, setRecoverLead] = useState(null);
  const [openActionsId, setOpenActionsId] = useState(null);
  const [openPayoffEntry, setOpenPayoffEntry] = useState(null);

  const leadsCountForDisplay = safeLeads.length;
  const payoffCountForDisplay = payoffList.length;

  // HeaderTabsAndToolbar-style filters (local, for this table)
  const [sortOrder, setSortOrder] = useState("asc"); // Earliest first by default
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilters, setStatusFilters] = useState({
    noConversations: false,
    noManyChatId: false,
    lockIn: false,
  });
  const [noShowStateFilter, setNoShowStateFilter] = useState("");

  const filteredLeads = useMemo(() => {
    const term = String(searchTerm || "").trim().toLowerCase();
    const hasTerm = term.length > 0;

    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    return safeLeads.filter((l) => {
      const profile = l?.leads || {};
      const name = String(profile?.name || l?.name || "").toLowerCase();
      const email = String(profile?.email || l?.email || "").toLowerCase();
      const phone = String(profile?.phone || l?.phone || "").toLowerCase();
      if (hasTerm && !(`${name} ${email} ${phone}`.includes(term))) return false;

      const mcId = l?.manychat_user_id || profile?.mc_id;
      if (statusFilters.noManyChatId && !!mcId) return false;
      if (statusFilters.noConversations && !!mcId) return false; // best-effort match

      if (statusFilters.lockIn) {
        const ol = l?.outcome_log;
        const hasLockIn = Array.isArray(ol)
          ? ol.some((x) => x?.outcome === "lock_in")
          : ol?.outcome === "lock_in";
        if (!hasLockIn) return false;
      }

      if (tabValue === "no shows" && noShowStateFilter) {
        if (String(l?.no_show_state || "") !== noShowStateFilter) return false;
      }

      // Date range is only used on broader views, matching Header behavior
      if ((tabValue === "all" || tabValue === "follow ups" || tabValue === "no shows") && (start || end)) {
        const iso = l?.call_date || l?.book_date;
        const d = iso ? new Date(iso) : null;
        if (!d || Number.isNaN(d.getTime())) return false;
        if (start && d < start) return false;
        if (end) {
          const endMax = new Date(end);
          endMax.setHours(23, 59, 59, 999);
          if (d > endMax) return false;
        }
      }

      return true;
    });
  }, [safeLeads, searchTerm, startDate, endDate, statusFilters, tabValue, noShowStateFilter]);

  const sortedLeads = useMemo(() => {
    const isRejected = (l) => {
      if (l?.cancelled) return true;
      const s = String(l?.status || l?.call_status || "").toLowerCase();
      return s === "rejected" || s === "cancelled";
    };
    const dir = sortOrder === "asc" ? 1 : -1;
    return [...filteredLeads].sort((a, b) => {
      // Always keep rejected rows at the bottom (even with filters / sorting)
      const ra = Number(isRejected(a));
      const rb = Number(isRejected(b));
      if (ra !== rb) return ra - rb;

      // Then sort by time inside each group
      const ad = new Date(a?.call_date || a?.book_date || 0).getTime();
      const bd = new Date(b?.call_date || b?.book_date || 0).getTime();
      return (ad - bd) * dir;
    });
  }, [filteredLeads, sortOrder]);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    window.setTimeout(() => {
      setToast({ show: false, message: "", type: "success" });
    }, 2500);
  };

  const updateStatus = async (
    callRow,
    field,
    value,
    setterF,
    extraUpdates = {},
  ) => {
    const id = callRow?.id;
    if (!id) return false;

    setterF(value); // optimistic

    const leadData = {
      ...callRow,
      ...(callRow?.leads || {}),
    };

    try {
      let formattedValue = value;
      if (
        ["picked_up", "confirmed", "showed_up", "purchased"].includes(field)
      ) {
        if (value === "true" || value === true) formattedValue = true;
        else if (value === "false" || value === false) formattedValue = false;
        else if (value === "null" || value === null || value === "")
          formattedValue = null;
      }

      const updatePayload = { [field]: formattedValue, ...extraUpdates };
      const { data: updateData, error } = await supabase
        .from("calls")
        .update(updatePayload)
        .eq("id", id)
        .select("id");

      if (error) {
        console.error("[CloserTodaysLeads] Supabase update error:", error);
        showToast(error.message || "Failed to update", "error");
        setterF(formatStatusValue(callRow?.[field]));
        return false;
      }
      if (!updateData || updateData.length === 0) {
        console.warn(
          "[CloserTodaysLeads] Update matched 0 rows. id:",
          id,
          "payload:",
          updatePayload,
        );
        showToast(
          "Update may not have been applied. Check permissions.",
          "error",
        );
        setterF(formatStatusValue(callRow?.[field]));
        return false;
      }

      const mcID = callRow?.manychat_user_id || callRow?.leads?.mc_id;
      if (mcID) {
        try {
          await updateManychatField(mcID, field, formattedValue);
        } catch (mcErr) {
          console.error("[CloserTodaysLeads] ManyChat update error:", mcErr);
        }
      }

      if (field === "purchased" && formattedValue === true) {
        // Celebrate purchase (canvas-confetti)
        firePifConfetti();
      }

      // When showed_up is set to no, also set in closer bot (same as LeadItem)
      if (
        field === "showed_up" &&
        formattedValue === false &&
        callRow?.closer_mc_id &&
        callRow?.closers?.mc_api_key
      ) {
        try {
          await setManychatFieldsByName(
            String(callRow.closer_mc_id),
            [{ name: "showed_up", value: false }],
            callRow.closers.mc_api_key,
          );
        } catch (mcErr) {
          console.error(
            "[CloserTodaysLeads] ManyChat showed_up update (closer bot) error:",
            mcErr,
          );
        }
      }

      // Confirmed YES → send to closer MC (same as LeadItem)
      if (field === "confirmed" && formattedValue === true) {
        try {
          const mcResult = await sendToCloserMC({
            id,
            name: leadData?.name,
            phone: leadData?.phone,
            apiKey: callRow?.closers?.mc_api_key,
            fieldsToSet: [
              { name: "SETTER", value: callRow?.setters?.name },
              { name: "CLOSER", value: callRow?.closers?.name },
              { name: "CALL LINK", value: callRow?.call_link },
              {
                name: "DATE (LEAD TZ)",
                value:
                  callRow?.call_date && callRow?.timezone
                    ? new Date(callRow.call_date).toLocaleDateString("en-US", {
                        timeZone: callRow.timezone,
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      })
                    : (callRow?.call_date || "") + " (Tu fecha local)",
              },
              {
                name: "CALL TIME (LEAD TZ)",
                value:
                  callRow?.call_date && callRow?.timezone
                    ? new Date(callRow.call_date).toLocaleTimeString("en-US", {
                        timeZone: callRow.timezone,
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : (callRow?.call_date || "") + " (Tu hora local)",
              },
              { name: "call_date", value: callRow?.call_date },
            ],
          });

          if (mcResult?.subscriberId) {
            const { error: mcIdErr } = await supabase
              .from("calls")
              .update({ closer_mc_id: String(mcResult.subscriberId) })
              .eq("id", id);
            if (mcIdErr)
              console.error(
                "[CloserTodaysLeads] Failed to store closer_mc_id:",
                mcIdErr,
              );
          }

          showToast("Lead confirmed and sent to closer", "success");
        } catch (error) {
          console.error(
            "[CloserTodaysLeads] Error creating ManyChat user:",
            error,
          );
          showToast(
            "Lead confirmed but failed to send to ManyChat. See console.",
            "error",
          );
          alert(
            "Failed to send lead to closer. Lead is still marked confirmed. Check console for details.",
          );
          try {
            await supabase.from("function_errors").insert({
              function_name: "sendToCloserMC",
              error_message: error?.message || String(error),
              error_details: JSON.stringify(error?.stack || error),
              source: "CloserTodaysLeads/index.jsx/updateStatus",
            });
          } catch (logError) {
            console.error(
              "[CloserTodaysLeads] Failed to log function_errors:",
              logError,
            );
          }
        }

        try {
          await fetch("/api/n8n-webhook", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: "lead_confirmed",
              calendly_id: leadData?.calendly_id,
              email: leadData?.email,
              phone: leadData?.phone,
            }),
          });
        } catch (webhookError) {
          console.error(
            "[CloserTodaysLeads] Error sending N8N webhook:",
            webhookError,
          );
        }
      }
    } catch (err) {
      console.error("[CloserTodaysLeads] updateStatus error:", err);
      showToast("Error updating status. See console.", "error");
      setterF(formatStatusValue(callRow?.[field]));
      return false;
    }

    return true;
  };

  if (loading) return <CloserTodaysLeadsShimmer />;

  return (
    <div className="w-full rounded-2xl bg-white border border-slate-200 shadow-sm overflow-visible relative">
      <div className="px-3 py-3 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900">
          {mainTab === MAIN_TABS.payoff ? "Payoff Opportunities" : title}
        </div>
        <MainTabs
          value={mainTab}
          onChange={setMainTab}
          leadsCount={leadsCountForDisplay}
          payoffCount={payoffCountForDisplay}
        />
      </div>

      {mainTab === MAIN_TABS.leads ? (
        <div className="px-3 pb-2 flex items-center justify-between gap-3 flex-wrap">
          <Tabs value={tabValue} onChange={onTabChange} />

          <div className="flex items-center gap-2 flex-wrap">
            <span
              onClick={() => setSortOrder((p) => (p === "asc" ? "desc" : "asc"))}
              className="h-9 w-9 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 flex items-center justify-center cursor-pointer"
              title="Toggle sort order"
            >
              {sortOrder === "asc" ? (
                <ArrowUp size={16} className="text-black" />
              ) : (
                <ArrowDown size={16} className="text-black" />
              )}
            </span>
            <div className="text-[13px] text-slate-500 whitespace-nowrap">
              {sortOrder === "asc" ? "Earliest first" : "Latest first"}
            </div>

            <button
              type="button"
              onClick={() => setShowFilterPanel((s) => !s)}
              className={cx(
                "h-9 rounded-lg px-3 border text-[13px] font-medium inline-flex items-center gap-2 transition !outline-none",
                showFilterPanel
                  ? "bg-indigo-600 text-white border-indigo-700"
                  : "bg-slate-100 text-slate-900 border-slate-200 hover:bg-slate-200",
              )}
            >
              <Filter
                size={16}
                className={showFilterPanel ? "text-white" : "text-slate-900"}
              />
              Filters
            </button>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search lead..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={cx(
                  "h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] outline-none transition",
                  showSearch
                    ? "w-[220px] opacity-100"
                    : "w-0 opacity-0 px-0 border-transparent",
                )}
                style={{ pointerEvents: showSearch ? "auto" : "none" }}
              />
              <span
                onClick={() => setShowSearch((s) => !s)}
                className="h-9 w-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center cursor-pointer"
                title="Search"
              >
                <Search size={16} className="!text-white" />
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {mainTab === MAIN_TABS.leads ? (
        <div className="px-3 pb-3">
          {tabValue === "no shows" ? (
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <div className="text-[12px] font-semibold text-slate-700 mr-1">Filter:</div>
              {[
                { key: "no_show", label: "No show" },
                { key: "contacted", label: "Contacted" },
                { key: "rebooked", label: "Rebooked" },
                { key: "dead", label: "Dead" },
              ].map((x) => {
                const active = noShowStateFilter === x.key;
                return (
                  <button
                    key={x.key}
                    type="button"
                    onClick={() =>
                      setNoShowStateFilter((p) => (p === x.key ? "" : x.key))
                    }
                    className={cx(
                      "px-3 py-1.5 rounded-md border text-[12px] font-medium transition !outline-none",
                      active
                        ? "bg-indigo-600 text-white border-indigo-700"
                        : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200",
                    )}
                  >
                    {active ? "✓ " : ""}
                    {x.label}
                  </button>
                );
              })}
            </div>
          ) : null}

          {showFilterPanel ? (
            <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col gap-4">
              {(tabValue === "all" || tabValue === "follow ups" || tabValue === "no shows") ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="text-[13px] font-semibold text-slate-700">Date range</div>
                  <div className="flex items-center gap-2">
                    <div className="text-[12px] text-slate-500">Start</div>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[13px] outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-[12px] text-slate-500">End</div>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[13px] outline-none"
                    />
                  </div>
                </div>
              ) : null}

              <div className="flex items-center gap-3 flex-wrap">
                <div className="text-[13px] font-semibold text-slate-700">Status</div>
                {[
                  { key: "noConversations", label: "No conversations" },
                  { key: "noManyChatId", label: "No ManyChat ID" },
                  { key: "lockIn", label: "Lock In" },
                ].map((x) => {
                  const active = !!statusFilters?.[x.key];
                  return (
                    <button
                      key={x.key}
                      type="button"
                      onClick={() =>
                        setStatusFilters((p) => ({ ...p, [x.key]: !p[x.key] }))
                      }
                      className={cx(
                        "px-3 py-2 rounded-lg border text-[13px] font-medium transition !outline-none",
                        active
                          ? "bg-indigo-600 text-white border-indigo-700"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
                      )}
                    >
                      {active ? "✓ " : ""}
                      {x.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {mainTab === MAIN_TABS.payoff ? (
        <div
          className={cx(
            "mt-3",
            payoffList.length
              ? "overflow-x-auto [@media(min-width:1465px)]:overflow-x-visible"
              : null,
          )}
        >
          <div
            className={cx(
              payoffList.length
                ? "min-w-[980px] [@media(min-width:1465px)]:min-w-0"
                : null,
              "divide-y divide-slate-100",
            )}
          >
            {payoffLoading ? (
              <div className="px-3 py-8 text-sm text-slate-500 text-center">
                Loading payoff opportunities...
              </div>
            ) : payoffList.length === 0 ? (
              <div className="px-3 py-8 text-sm text-slate-500 text-center">
                No payoff opportunities in the last 30 days.
              </div>
            ) : (
              payoffList.map((p, idx) => (
                <PayoffRow
                  key={`${p?.name ?? "opp"}-${idx}`}
                  name={p?.name}
                  meta={{
                    line: p?.meta,
                    phone:
                      p?.phone ||
                      p?.call?.leads?.phone ||
                      p?.call?.phone ||
                      null,
                  }}
                  actionLabel={p?.actionLabel}
                  actionDisabled={!p?.call?.id}
                  onAction={() => setOpenPayoffEntry(p)}
                  onDismiss={() => {
                    const id = String(p?.kajabiPurchaseId || p?.call?.id || "");
                    if (!id) return;
                    setDismissedPayoffIds((prev) => {
                      const next = new Set(prev);
                      next.add(id);
                      return next;
                    });
                  }}
                />
              ))
            )}
          </div>
        </div>
      ) : (
        <div
          className={cx(
            "mt-3",
            safeLeads.length
              ? "overflow-x-auto [@media(min-width:1465px)]:overflow-x-visible"
              : null,
          )}
        >
          <div
            className={cx(
              safeLeads.length
                ? "min-w-[980px] [@media(min-width:1465px)]:min-w-0"
                : null,
              "divide-y divide-slate-100",
            )}
          >
            {safeLeads.length === 0 ? (
              <div className="px-3 py-8 text-sm text-slate-500 text-center">
                No leads found.
              </div>
            ) : (
              <>
                <div className="px-3 py-2 bg-slate-50/70 border-y border-slate-200">
                  <div className="grid grid-cols-[24px_minmax(240px,1fr)_140px_90px_260px_86px_56px] items-center gap-4 text-[11px] font-bold tracking-wide text-slate-500 uppercase">
                    <div className="text-center"> </div>
                    <div>Lead</div>
                    <div className="text-center">Setter</div>
                    <div className="text-center">Time</div>
                    <div className="text-center">Status</div>
                    <div className="text-center">Notes</div>
                    <div className="text-right"> </div>
                  </div>
                </div>

                {sortedLeads.map((l) => (
                  <LeadRow
                    key={l.id}
                    lead={l}
                    setterName={
                      setterMap?.[String(l.setter_id)] || l?.setters?.name
                    }
                    onUpdateStatus={(callRow, field, v, setterF) =>
                      updateStatus(callRow, field, v, setterF)
                    }
                    onCopyCallId={() => {
                      if (l?.id) navigator.clipboard.writeText(String(l.id));
                      setOpenActionsId(null);
                    }}
                    onTransfer={() => {
                      setOpenActionsId(null);
                      setTransferLead(l);
                    }}
                    onRecoverLead={() => {
                      setOpenActionsId(null);
                      setRecoverLead(l);
                    }}
                    onSetterNotes={() => {
                      setOpenActionsId(null);
                      setSetterNoteLead(l);
                    }}
                    onCloserNotes={() => {
                      setOpenActionsId(null);
                      setCloserNoteLead(l);
                    }}
                    onSendManyChat={async () => {
                      setOpenActionsId(null);
                      const subscriberId =
                        l?.leads?.mc_id || l?.manychat_user_id;
                      if (!subscriberId)
                        return alert(
                          "No ManyChat subscriber ID found for this lead",
                        );
                      const callData = buildCallDataFromLead(l);
                      await updateManychatCallFields(subscriberId, callData);
                      alert("Successfully sent to ManyChat!");
                    }}
                    onReschedule={() => {
                      setOpenActionsId(null);
                      if (l?.reschedule_link)
                        window.open(
                          l.reschedule_link,
                          "_blank",
                          "noopener,noreferrer",
                        );
                    }}
                    onDeleteCall={async () => {
                      setOpenActionsId(null);
                      if (
                        !window.confirm(
                          "Are you sure you want to delete this call? This cannot be undone.",
                        )
                      )
                        return;
                      await deleteCallWithDependencies(l.id);
                      onLeadDeleted?.(l.id);
                    }}
                    onReport={() => {
                      setOpenActionsId(null);
                      alert("Reported.");
                    }}
                    actionsOpen={openActionsId === l.id}
                    onToggleActions={() =>
                      setOpenActionsId((prev) => (prev === l.id ? null : l.id))
                    }
                    useCompactStatusBadges={tabValue === "all"}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {toast.show ? (
        <div className="pointer-events-none fixed bottom-6 right-6 z-[60]">
          <div
            className={cx(
              "rounded-lg px-3 py-2 text-[12px] font-semibold shadow-lg",
              toast.type === "success"
                ? "bg-emerald-600 text-white"
                : "bg-rose-600 text-white",
            )}
          >
            {toast.message}
          </div>
        </div>
      ) : null}

      <NotesModal
        isOpen={!!noteLead}
        onClose={() => setNoteLead(null)}
        lead={noteLead}
        callId={noteLead?.id}
        mode="closer"
      />
      <ViewNotesModal
        isOpen={!!viewLead}
        onClose={() => setViewLead(null)}
        lead={viewLead}
        callId={viewLead?.id}
      />
      <NotesModal
        isOpen={!!setterNoteLead}
        onClose={() => setSetterNoteLead(null)}
        lead={setterNoteLead}
        callId={setterNoteLead?.id}
        mode="setter"
      />
      <NotesModal
        isOpen={!!closerNoteLead}
        onClose={() => setCloserNoteLead(null)}
        lead={closerNoteLead}
        callId={closerNoteLead?.id}
        mode="closer"
      />

      <TransferSetterModal
        isOpen={!!transferLead}
        onClose={() => setTransferLead(null)}
        lead={transferLead}
        setterOptions={Object.entries(setterMap || {}).map(([id, name]) => ({
          id,
          name,
        }))}
        onTransfer={() => {}}
      />

      <RecoverLeadModal
        isOpen={!!recoverLead}
        onClose={() => setRecoverLead(null)}
        lead={recoverLead}
        closerList={closerList}
        mode="closer"
        onSuccess={(msg) => alert(msg || "Calendar event created")}
      />

      <NotesModal
        isOpen={!!openPayoffEntry}
        onClose={() => setOpenPayoffEntry(null)}
        lead={openPayoffEntry?.call || null}
        callId={openPayoffEntry?.call?.id}
        mode="closer"
        initialKajabiPurchaseId={openPayoffEntry?.kajabiPurchaseId || null}
        initialPurchaseDisplay={openPayoffEntry?.initialPurchaseDisplay || null}
      />
    </div>
  );
}
