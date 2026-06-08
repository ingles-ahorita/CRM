import React, { useEffect, useMemo, useState } from "react";
import { StickyNote, UserRound } from "lucide-react";
import { useParams } from "react-router-dom";
import { NotesModal, ViewNotesModal } from "../../../../Modal";
import { TransferSetterModal } from "../../../../TransferSetterModal";
import RecoverLeadModal from "../../../../RecoverLeadModal";
import { ThreeDotsMenu, deleteCallWithDependencies } from "../../../../LeadItem";
import {
  getCountryFlagFromPhone,
  getCountryFromPhone,
} from "../../../../../../utils/phoneNumberParser";

function cx ( ...p ) {
  return p.filter( Boolean ).join( " " );
}

// Same colour mapping as CloserTodaysLeads `callTimeColor`.
function callTimeColor ( time, isRescheduled, called ) {
  if ( time === undefined ) return "#e5e7eb";
  if ( isRescheduled && !called ) return "#dd86ddff";
  if ( !called ) return "#cfcfcfff";
  if ( time < 6 ) return "#88ff2dff";
  if ( time < 15 ) return "#fdd329ff";
  if ( time >= 15 ) return "#ff8b8bff";
  return "#e5e7eb";
}

function getZoomCallLogUrl ( phone, bookDate ) {
  if ( !phone || !bookDate ) return "#";
  const fromDate = new Date( bookDate );
  fromDate.setDate( fromDate.getDate() - 1 );
  const toDate = new Date( bookDate );
  toDate.setMonth( toDate.getMonth() + 1 );
  const from = `${fromDate.getFullYear()}-${fromDate.getMonth() + 1}-${fromDate.getDate()} `;
  const to = `${toDate.getFullYear()}-${toDate.getMonth() + 1}-${toDate.getDate()} `;
  const phoneCleaned = "+" + phone.toString().replace( /\D/g, "" );
  return `https://us06web.zoom.us/pbx/page/telephone/callLog#/recording-list?page_size=15&page_number=1&recordingReport=0&from=${encodeURIComponent( from )}&to=${encodeURIComponent( to )}&keyword=${encodeURIComponent( phoneCleaned )}`;
}

function ResponsePill ( { lead } ) {
  const phone = lead?.leads?.phone || lead?.phone;
  const href = getZoomCallLogUrl( phone, lead?.book_date );

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={( e ) => e.stopPropagation()}
    >
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
    </a>
  );
}

const GRID_CLASS_ALL =
  "grid-cols-[24px_minmax(170px,1fr)_80px_100px_100px_130px_130px_150px_90px_76px]";
const GRID_CLASS_DEFAULT =
  "grid-cols-[24px_minmax(170px,1fr)_80px_100px_100px_130px_130px_150px_90px_76px]";

const UTM_FIELDS = [
  { key: "utm_source", badge: "S", label: "Source", color: "#6366f1" },
  { key: "utm_medium", badge: "M", label: "Medium", color: "#0891b2" },
  { key: "utm_campaign", badge: "C", label: "Campaign", color: "#d97706" },
];

function StatusBadge ( { value, label, title, outcomeLog } ) {
  const getColor = () => {
    const isDontQualify = Array.isArray( outcomeLog )
      ? outcomeLog.some( ( ol ) => ol?.outcome === "dont_qualify" )
      : outcomeLog?.outcome === "dont_qualify";
    if ( isDontQualify && label === "$" ) return "#000000";

    if ( label === "$" ) {
      const isLockIn = Array.isArray( outcomeLog )
        ? outcomeLog.some( ( ol ) => ol?.outcome === "lock_in" )
        : outcomeLog?.outcome === "lock_in";
      const isFollowUp = Array.isArray( outcomeLog )
        ? outcomeLog.some( ( ol ) => ol?.outcome === "follow_up" )
        : outcomeLog?.outcome === "follow_up";
      if ( isLockIn || isFollowUp ) return "#9333ea";
    }

    if ( value ) return "#10b981";
    if ( value === false || value === "false" ) return "#ef4444";
    return "#f59e0b";
  };

  const isPurchasedTBD = label === "$" && ( value == null || value === "null" );
  const displayTitle = isPurchasedTBD ? "Purchased: TBD" : title;

  return (
    <span
      title={displayTitle}
      className="inline-flex h-[25px] w-[25px] items-center justify-center rounded-md text-[12px] font-extrabold text-white shadow-[0_1px_2px_rgba(15,23,42,0.18)]"
      style={{ backgroundColor: getColor() }}
    >
      {label}
    </span>
  );
}

export default function LeadRow ( {
  lead,
  setterName,
  closerName,
  setterMap = {},
  closerList = [],
  useCompactStatusBadges = true,
  mode = "full",
} ) {
  const { setter: routeSetterId } = useParams();
  const [ viewModalOpen, setViewModalOpen ] = useState( false );
  const [ showNoteModal, setShowNoteModal ] = useState( false );
  const [ modeState, setModeState ] = useState( mode );
  const [ isModalOpen, setIsModalOpen ] = useState( false );
  const [ showRecoverModal, setShowRecoverModal ] = useState( false );
  const [ toast, setToast ] = useState( { show: false, message: "", type: "success" } );
  const [ , setSetter ] = useState(
    lead?.setter_id != null ? String( lead.setter_id ) : "",
  );

  useEffect( () => {
    setModeState( mode );
  }, [ mode ] );

  useEffect( () => {
    setSetter( lead?.setter_id != null ? String( lead.setter_id ) : "" );
  }, [ lead?.setter_id ] );

  const showToast = ( message, type = "success" ) => {
    setToast( { show: true, message, type } );
    setTimeout( () => setToast( { show: false, message: "", type: "success" } ), 3000 );
  };

  const setterOptions = useMemo(
    () => Object.entries( setterMap || {} ).map( ( [ id, name ] ) => ( { id, name } ) ),
    [ setterMap ],
  );

  const isAllLayout = true;
  const profile = lead?.leads || {};
  const name = profile?.name || "—";
  const email = profile?.email || "—";
  const phone = profile?.phone || "—";

  const manyChatUrl = useMemo( () => {
    if ( !phone || phone === "—" ) return null;
    const digits = String( phone ).replace( /\D/g, "" );
    if ( !digits ) return null;
    const template =
      "https://app.manychat.com/signin?return=%2Ffb1237190%2Fchat%2F256311379";
    return template.replace( /(chat%2F)\d+$/, `$1${encodeURIComponent( digits )}` );
  }, [ phone ] );

  const kajabiContactsUrl = useMemo( () => {
    const e = profile?.email;
    if ( !e ) return null;
    return `https://app.kajabi.com/admin/sites/2147813413/contacts?page=1&search=${encodeURIComponent(
      e,
    )}`;
  }, [ profile?.email ] );

  const emojiStack = ( () => {
    const callSource = lead?.source_type || profile?.source || "organic";
    const isAds = String( callSource ).toLowerCase().includes( "ad" );
    const callCampaign = lead?.utm_campaign;
    return (
      <>
        <span className="text-[16px] leading-4">{isAds ? "💰" : "🌱"}</span>
        {( callCampaign === "dm-setter" || callCampaign === "ai-setting" ) && (
          <span className="text-[16px] leading-4">💬</span>
        )}
        {( lead?.recovered || lead?.is_reschedule ) && (
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
  } )();

  const formatDateTime = ( iso ) => {
    if ( !iso ) return "—";
    const d = new Date( iso );
    if ( Number.isNaN( d.getTime() ) ) return "—";
    return `${d.toLocaleDateString( "en-US", { month: "2-digit", day: "2-digit", year: "numeric" } )}, ${d.toLocaleTimeString( undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    } )}`;
  };
  const bookDateLabel = formatDateTime( lead?.book_date );
  const callDateLabel = formatDateTime( lead?.call_date );

  const isNoShow = lead?.confirmed === true && lead?.showed_up === false;
  const isCancelled = lead?.cancelled === true || lead?.confirmed === false;

  return (
    <div
      className={cx(
        "px-3 transition-colors",
        isCancelled ? "bg-red-500/5 text-slate-500" : isNoShow ? "bg-amber-500/5" : null,
      )}
    >
      <div
        className={cx(
          "grid items-center gap-4 py-2",
          isAllLayout ? GRID_CLASS_ALL : GRID_CLASS_DEFAULT,
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
                  onClick={( e ) => e.stopPropagation()}
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
                    onClick={( e ) => e.stopPropagation()}
                  >
                    {phone}
                  </a>
                ) : (
                  phone
                )}
                {phone && getCountryFlagFromPhone( phone ) ? (
                  <span className="ml-1" title={getCountryFromPhone( phone )}>
                    {getCountryFlagFromPhone( phone )}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 w-full space-y-0.5 overflow-hidden">
          {UTM_FIELDS.map( ( { key, badge, label, color } ) => (
            <div key={key} className="flex min-w-0 items-center gap-0.5">
              <span
                title={label}
                className="inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded text-[8px] font-extrabold text-white shadow-[0_1px_2px_rgba(15,23,42,0.12)]"
                style={{ backgroundColor: color }}
              >
                {badge}
              </span>
              <span
                className="min-w-0 truncate text-[9px] font-medium text-slate-600"
                title={`${label}: ${lead?.[ key ] || "—"}`}
              >
                {lead?.[ key ] || "—"}
              </span>
            </div>
          ) )}
        </div>

        {lead?.setter_id ? (
          <a
            href={`/setter/${lead.setter_id}`}
            className="flex items-center justify-center gap-1.5 bg-slate-100/80 rounded-full px-2 py-1 text-[11px] text-slate-600 w-auto hover:bg-slate-200/90 transition-colors max-w-[90px] ml-4 whitespace-pre-wrap"
            title="Open setter profile"
          >
            <UserRound size={14} className="text-slate-400 flex-shrink-0" />
            <span className="truncate">
              <span className="font-semibold text-slate-700">
                {setterName || "—"}
              </span>
            </span>
          </a>
        ) : (
          <div className="flex items-center justify-center gap-1.5 bg-slate-100/80 rounded-full px-2 py-1 text-[11px] text-slate-600 w-auto max-w-[90px] ml-5 whitespace-pre-wrap">
            <UserRound size={14} className="text-slate-400 flex-shrink-0" />
            <span className="truncate">
              <span className="font-semibold text-slate-700">
                {setterName || "—"}
              </span>
            </span>
          </div>
        )}

        {lead?.closer_id ? (
          <a
            href={`/closer/${lead.closer_id}`}
            className="flex items-center justify-center gap-1.5 bg-slate-100/80 rounded-full px-2 py-1 text-[11px] text-slate-600 w-auto hover:bg-slate-200/90 transition-colors max-w-[90px] ml-5 whitespace-pre-wrap"
            title="Open closer profile"
          >
            <UserRound size={14} className="text-slate-400 flex-shrink-0" />
            <span className="truncate">
              <span className="font-semibold text-slate-700">
                {closerName || lead?.closers?.name || "—"}
              </span>
            </span>
          </a>
        ) : (
          <div className="flex items-center justify-center gap-1.5 bg-slate-100/80 rounded-full px-2 py-1 text-[11px] text-slate-600 w-auto max-w-[90px] ml-5 whitespace-pre-wrap">
            <UserRound size={14} className="text-slate-400 flex-shrink-0" />
            <span className="truncate">
              <span className="font-semibold text-slate-700">
                {closerName || lead?.closers?.name || "—"}
              </span>
            </span>
          </div>
        )}

        <div className="text-center text-[11px] font-semibold text-slate-700 truncate">
          {bookDateLabel}
        </div>

        <div className="text-center text-[11px] font-semibold text-slate-700 truncate">
          {callDateLabel}
        </div>

        <div className="flex items-center justify-center">
          <div className="flex items-center gap-1.5">
            <StatusBadge
              value={lead?.picked_up}
              label="P"
              title="Picked Up"
              outcomeLog={lead?.outcome_log}
            />
            <StatusBadge
              value={lead?.confirmed}
              label="C"
              title="Confirmed"
              outcomeLog={lead?.outcome_log}
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
        </div>

        {useCompactStatusBadges ? (
          <div className="flex items-center justify-center">
            <ResponsePill lead={lead} />
          </div>
        ) : null}

        <div className="flex items-center justify-center gap-2">
          <div className="flex items-center justify-center w-full">
            <button
              type="button"
              className="h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-2.5 text-[11px] font-semibold text-slate-700 inline-flex items-center gap-1.5 transition focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              aria-label="Add note"
              title="Add note"
              onClick={() => setViewModalOpen( true )}
            >
              <StickyNote size={14} className="text-slate-500" />
              Note
            </button>
          </div>

          <div className="flex items-center justify-end [&_button]:leading-none">
            <ThreeDotsMenu
              onEdit={() => setIsModalOpen( true )}
              onDelete={() => console.log( "Delete" )}
              onDeleteCall={async () => {
                try {
                  await deleteCallWithDependencies( lead.id );
                  showToast( "Call deleted", "success" );
                } catch ( err ) {
                  console.error( "Error deleting call:", err );
                  showToast( err?.message || "Failed to delete call", "error" );
                }
              }}
              mode={mode}
              setMode={setModeState}
              modalSetter={setShowNoteModal}
              lead={lead}
              showToast={showToast}
              closerList={closerList}
              onRecoverLead={() => setShowRecoverModal( true )}
            />
          </div>
        </div>
      </div>

      <NotesModal
        isOpen={showNoteModal}
        onClose={() => setShowNoteModal( false )}
        lead={lead}
        callId={lead.id}
        mode={modeState}
      />

      <ViewNotesModal
        isOpen={viewModalOpen}
        onClose={() => setViewModalOpen( false )}
        lead={lead}
        callId={lead?.id}
      />

      <TransferSetterModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen( false )}
        lead={lead}
        setterOptions={setterOptions}
        currentUserId={routeSetterId ?? null}
        onTransfer={( newSetterId ) => setSetter( newSetterId )}
      />

      <RecoverLeadModal
        isOpen={showRecoverModal}
        onClose={() => setShowRecoverModal( false )}
        lead={lead}
        closerList={closerList}
        mode={mode}
        onSuccess={( msg ) => showToast( msg || "Calendar event created", "success" )}
      />

      {toast.show ? (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            backgroundColor: toast.type === "success" ? "#10b981" : "#ef4444",
            color: "white",
            padding: "12px 20px",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 10000,
            fontSize: "14px",
          }}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
