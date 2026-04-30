import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Filter, Search } from "lucide-react";
import LeadRow from "./lead-row";
import LeadsStats from "./leads-stats";
import { DUMMY_LEADS, SETTER_MAP } from "./dummy-data";

function cx(...p) {
  return p.filter(Boolean).join(" ");
}

const SUB_TABS = [
  { key: "yesterday", label: "Yesterday" },
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "tomorrow + 1", label: "+1" },
  { key: "no shows", label: "No Shows" },
  { key: "follow ups", label: "Follow Ups" },
  { key: "all", label: "All" },
];

function SubTabs({ value, onChange }) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100/80 p-1">
      {SUB_TABS.map((t) => {
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

export default function LeadsTable({ title = "Today's Leads" }) {
  const safeLeads = DUMMY_LEADS;
  const [subTab, setSubTab] = useState("today");

  const [sortOrder, setSortOrder] = useState("asc");
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
  const [openActionsId, setOpenActionsId] = useState(null);

  const filteredLeads = useMemo(() => {
    const term = String(searchTerm || "")
      .trim()
      .toLowerCase();
    const hasTerm = term.length > 0;
    return safeLeads.filter((l) => {
      const profile = l?.leads || {};
      const name = String(profile?.name || "").toLowerCase();
      const email = String(profile?.email || "").toLowerCase();
      const phone = String(profile?.phone || "").toLowerCase();
      if (hasTerm && !`${name} ${email} ${phone}`.includes(term)) return false;

      if (
        subTab === "no shows" &&
        noShowStateFilter &&
        String(l?.no_show_state || "") !== noShowStateFilter
      ) {
        return false;
      }
      return true;
    });
  }, [safeLeads, searchTerm, subTab, noShowStateFilter]);

  const sortedLeads = useMemo(() => {
    const isRejected = (l) => !!l?.cancelled;
    const dir = sortOrder === "asc" ? 1 : -1;
    return [...filteredLeads].sort((a, b) => {
      const ra = Number(isRejected(a));
      const rb = Number(isRejected(b));
      if (ra !== rb) return ra - rb;
      const ad = new Date(a?.call_date || a?.book_date || 0).getTime();
      const bd = new Date(b?.call_date || b?.book_date || 0).getTime();
      return (ad - bd) * dir;
    });
  }, [filteredLeads, sortOrder]);

  return (
    <div className="w-full rounded-2xl bg-white  border-slate-200 shadow-sm overflow-visible relative pt-3">
      <div className="px-3 pb-2 flex items-center justify-between gap-3 flex-wrap">
        <SubTabs value={subTab} onChange={setSubTab} />

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

      <div className="px-3 pb-3">
        {subTab === "no shows" ? (
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <div className="text-[12px] font-semibold text-slate-700 mr-1">
              Filter:
            </div>
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
            {subTab === "all" ||
            subTab === "follow ups" ||
            subTab === "no shows" ? (
              <div className="flex items-center gap-3 flex-wrap">
                <div className="text-[13px] font-semibold text-slate-700">
                  Date range
                </div>
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
              <div className="text-[13px] font-semibold text-slate-700">
                Status
              </div>
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

      <LeadsStats />

      <div
        className={cx(
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
          {sortedLeads.length === 0 ? (
            <div className="px-3 py-8 text-sm text-slate-500 text-center">
              No leads found.
            </div>
          ) : (
            <>
              <div className="px-3 py-2 bg-slate-50/70 border-y border-slate-200">
                <div
                  className={cx(
                    "grid items-center gap-4 text-[11px] font-bold tracking-wide text-slate-500 uppercase",
                    subTab === "all"
                      ? "grid-cols-[24px_minmax(200px,1fr)_130px_84px_200px_110px_86px_56px]"
                      : "grid-cols-[24px_minmax(240px,1fr)_140px_90px_260px_86px_56px]",
                  )}
                >
                  <div className="text-center"> </div>
                  <div>Lead</div>
                  <div className="text-center">Setter</div>
                  <div className="text-center">Time</div>
                  <div className="text-center">Status</div>
                  {subTab === "all" ? (
                    <div className="text-center">Response</div>
                  ) : null}
                  <div className="text-center">Notes</div>
                  <div className="text-right"> </div>
                </div>
              </div>

              {sortedLeads.map((l) => (
                <LeadRow
                  key={l.id}
                  lead={l}
                  setterName={
                    SETTER_MAP?.[String(l.setter_id)] || l?.setters?.name
                  }
                  actionsOpen={openActionsId === l.id}
                  onToggleActions={() =>
                    setOpenActionsId((prev) => (prev === l.id ? null : l.id))
                  }
                  useCompactStatusBadges={subTab === "all"}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
