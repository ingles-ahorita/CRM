import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Filter, Search } from "lucide-react";
import LeadRow from "./lead-row";
import LeadsStats from "./leads-stats";
import { fetchAll } from "../../../../../utils/fetchLeads";
import { useRealtimeLeads } from "../../../../../hooks/useRealtimeLeads";
import { getDailySlotsTotal } from "../../../../../utils/ocuppancy";

function cx(...p) {
  return p.filter(Boolean).join(" ");
}

function shimmer(className = "") {
  return (
    <div
      className={cx("animate-pulse rounded-md bg-slate-200/70", className)}
      aria-hidden
    />
  );
}

const GRID_CLASS_ALL =
  "grid-cols-[24px_minmax(170px,1fr)_120px_120px_150px_150px_170px_110px_86px_56px]";
const GRID_CLASS_DEFAULT =
  "grid-cols-[24px_minmax(170px,1fr)_120px_120px_150px_150px_170px_110px_86px_56px]";

function TableSkeletonRows({ subTab, count = 8 }) {
  const gridClass = subTab === "all" ? GRID_CLASS_ALL : GRID_CLASS_DEFAULT;

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="px-3 py-2.5">
          <div className={cx("grid items-center gap-4", gridClass)}>
            <div className="flex justify-center">
              {shimmer("h-6 w-6 rounded-md")}
            </div>
            <div className="min-w-0 space-y-2">
              {shimmer("h-4 w-[72%] max-w-[200px]")}
              {shimmer("h-3 w-[88%] max-w-[240px]")}
            </div>
            <div className="flex justify-center">
              {shimmer("h-8 w-full max-w-[108px] rounded-full")}
            </div>
            <div className="flex justify-center">
              {shimmer("h-8 w-full max-w-[108px] rounded-full")}
            </div>
            <div className="flex justify-center">
              {shimmer("h-4 w-[92%] max-w-[132px]")}
            </div>
            <div className="flex justify-center">
              {shimmer("h-4 w-[92%] max-w-[132px]")}
            </div>
            <div className="flex justify-center gap-1.5">
              {shimmer("h-[25px] w-[25px] rounded-md")}
              {shimmer("h-[25px] w-[25px] rounded-md")}
              {shimmer("h-[25px] w-[25px] rounded-md")}
              {shimmer("h-[25px] w-[25px] rounded-md")}
            </div>
            <div className="flex justify-center">
              {shimmer("h-8 w-16 rounded-md")}
            </div>
            <div className="flex justify-center">
              {shimmer("h-8 w-[72px] rounded-lg")}
            </div>
            <div className="flex justify-end">
              {shimmer("h-8 w-8 rounded-md")}
            </div>
          </div>
        </div>
      ))}
    </>
  );
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

const DAY_RANGE_TABS = new Set([
  "yesterday",
  "today",
  "tomorrow",
  "tomorrow + 1",
]);
const FULL_FILTER_TABS = new Set(["all", "follow ups", "no shows"]);

function FilterChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "px-3 py-2 rounded-lg border text-[13px] font-medium transition !outline-none",
        active
          ? "bg-indigo-600 text-white border-indigo-700"
          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
      )}
    >
      {active ? "✓ " : ""}
      {label}
    </button>
  );
}

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
  const [subTab, setSubTab] = useState("today");
  const [sortOrder, setSortOrder] = useState("desc"); 
  const [sortBy, setSortBy] = useState("call_date");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [setterFilter, setSetterFilter] = useState("");
  const [closerFilter, setCloserFilter] = useState("");
  const [statusFilters, setStatusFilters] = useState({
    confirmed: false,
    cancelled: false,
    noShow: false,
    noPickUp: false,
    rescheduled: false,
    transferred: false,
    purchased: false,
    noConversions: false,
    lockIn: false,
    recovered: false,
    noManychatId: false,
  });
  const [noShowStateFilter, setNoShowStateFilter] = useState("");
  const [slotsByDate, setSlotsByDate] = useState({});
  const requestSeqRef = useRef(0);
  const [dataState, setDataState] = useState({
    leads: [],
    loading: true,
    setterMap: {},
    closerMap: {},
    currentDate: new Date().toISOString().split("T")[0],
    counts: { booked: 0, confirmed: 0, cancelled: 0, noShow: 0, noPickup: 0 },
  });

  useRealtimeLeads(dataState, setDataState, subTab, null, null, sortBy);

  useEffect(() => {
    const requestSeq = ++requestSeqRef.current;
    const guardedSetDataState = (updater) => {
      if (requestSeqRef.current !== requestSeq) return;
      setDataState(updater);
    };

    fetchAll(
      searchTerm,
      subTab,
      sortBy,
      sortOrder,
      guardedSetDataState,
      null,
      null,
      {
        ...statusFilters,
        noShowState: noShowStateFilter || "",
      },
      undefined,
      startDate || undefined,
      endDate || undefined,
      setterFilter || undefined,
      closerFilter || undefined,
      sortBy,
    );
  }, [
    searchTerm,
    subTab,
    sortBy,
    sortOrder,
    statusFilters,
    noShowStateFilter,
    startDate,
    endDate,
    setterFilter,
    closerFilter,
  ]);

  useEffect(() => {
    let cancelled = false;
    const loadSlots = async () => {
      try {
        const slots = await getDailySlotsTotal();
        if (!cancelled && slots && typeof slots === "object" && !Array.isArray(slots)) {
          setSlotsByDate(slots);
        }
      } catch (e) {
        if (!cancelled) setSlotsByDate({});
      }
    };
    loadSlots();
    return () => {
      cancelled = true;
    };
  }, []);

  const safeLeads = dataState?.leads || [];

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

  // Keep server order, but always push cancelled (red background) rows to end.
  const sortedLeads = useMemo(() => {
    const activeRows = [];
    const cancelledRows = [];
    for (const row of filteredLeads) {
      if (row?.cancelled) cancelledRows.push(row);
      else activeRows.push(row);
    }
    return [...activeRows, ...cancelledRows];
  }, [filteredLeads]);

  const hasTableLayout = dataState?.loading || sortedLeads.length > 0;
  const isDayRangeTab = DAY_RANGE_TABS.has(subTab);
  const hasFullFilters = isDayRangeTab || FULL_FILTER_TABS.has(subTab);
  const isAllTab = subTab === "all";
  const gridClass = isAllTab ? GRID_CLASS_ALL : GRID_CLASS_DEFAULT;
  const tableMinWidthClass = isAllTab
    ? "min-w-[1320px] [@media(min-width:1465px)]:min-w-0"
    : "min-w-[1320px] [@media(min-width:1465px)]:min-w-0";
  const selectedDateKey =
    dataState?.currentDate || new Date().toISOString().split("T")[0];
  const slots = Number(slotsByDate?.[selectedDateKey] || 0);
  const booked = Number(dataState?.counts?.booked || 0);
  const occupancy = slots > 0 ? Math.min(100, Math.round((booked / slots) * 100)) : 0;

  return (
    <div className="w-full max-w-full rounded-2xl bg-white border-slate-200 shadow-sm relative pt-3">
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

          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setSortBy("book_date")}
              className={cx(
                "px-2.5 py-1.5 text-[11px] font-semibold rounded-md",
                sortBy === "book_date"
                  ? "text-black !bg-[#edf6fb]"
                  : "text-slate-600 hover:text-slate-900 !bg-white",
              )}
            >
              Book Date
            </button>
            <button
              type="button"
              onClick={() => setSortBy("call_date")}
              className={cx(
                "px-2.5 py-1.5 text-[11px] font-semibold rounded-md",
                sortBy === "call_date"
                  ? "text-black !bg-[#edf6fb]"
                  : "text-slate-600 hover:text-slate-900 !bg-white",
              )}
            >
              Call Date
            </button>
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
            {!isDayRangeTab ? (
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

            {hasFullFilters ? (
              <div className="flex flex-col gap-3">
                <div className="text-[13px] font-semibold text-slate-700">
                  People
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-[12px] text-slate-600 font-medium">
                      Setter:
                    </label>
                    <select
                      value={setterFilter}
                      onChange={(e) => setSetterFilter(e.target.value)}
                      className="h-9 min-w-[140px] rounded-lg border border-slate-200 bg-white px-2 text-[13px] outline-none"
                    >
                      <option value="">All Setters</option>
                      {Object.entries(dataState?.setterMap || {}).map(
                        ([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[12px] text-slate-600 font-medium">
                      Closer:
                    </label>
                    <select
                      value={closerFilter}
                      onChange={(e) => setCloserFilter(e.target.value)}
                      className="h-9 min-w-[140px] rounded-lg border border-slate-200 bg-white px-2 text-[13px] outline-none"
                    >
                      <option value="">All Closers</option>
                      {Object.entries(dataState?.closerMap || {}).map(
                        ([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <div className="text-[13px] font-semibold text-slate-700">
                Status
              </div>
              {hasFullFilters ? (
                <div className="flex flex-wrap gap-2">
                  <FilterChip
                    label="Confirmed"
                    active={!!statusFilters.confirmed}
                    onClick={() =>
                      setStatusFilters((p) => ({
                        ...p,
                        confirmed: !p.confirmed,
                      }))
                    }
                  />
                  <FilterChip
                    label="Cancelled"
                    active={!!statusFilters.cancelled}
                    onClick={() =>
                      setStatusFilters((p) => ({
                        ...p,
                        cancelled: !p.cancelled,
                      }))
                    }
                  />
                  <FilterChip
                    label="No Show"
                    active={!!statusFilters.noShow}
                    onClick={() =>
                      setStatusFilters((p) => ({ ...p, noShow: !p.noShow }))
                    }
                  />
                  <FilterChip
                    label="No Pick up"
                    active={!!statusFilters.noPickUp}
                    onClick={() =>
                      setStatusFilters((p) => ({
                        ...p,
                        noPickUp: !p.noPickUp,
                      }))
                    }
                  />
                  <FilterChip
                    label="Reschedule"
                    active={!!statusFilters.rescheduled}
                    onClick={() =>
                      setStatusFilters((p) => ({
                        ...p,
                        rescheduled: !p.rescheduled,
                      }))
                    }
                  />
                  <FilterChip
                    label="Transfered"
                    active={!!statusFilters.transferred}
                    onClick={() =>
                      setStatusFilters((p) => ({
                        ...p,
                        transferred: !p.transferred,
                      }))
                    }
                  />
                  <FilterChip
                    label="Purchased"
                    active={!!statusFilters.purchased}
                    onClick={() => {
                      setStatusFilters((p) => {
                        const nextPurchased = !p.purchased;
                        setSortBy((s) =>
                          nextPurchased
                            ? "purchased_at"
                            : s === "purchased_at"
                              ? "call_date"
                              : s,
                        );
                        return { ...p, purchased: nextPurchased };
                      });
                    }}
                  />
                  <FilterChip
                    label="No conversions"
                    active={!!statusFilters.noConversions}
                    onClick={() =>
                      setStatusFilters((p) => ({
                        ...p,
                        noConversions: !p.noConversions,
                      }))
                    }
                  />
                  <FilterChip
                    label="Lock In"
                    active={!!statusFilters.lockIn}
                    onClick={() =>
                      setStatusFilters((p) => ({ ...p, lockIn: !p.lockIn }))
                    }
                  />
                  <FilterChip
                    label="Recovered"
                    active={!!statusFilters.recovered}
                    onClick={() =>
                      setStatusFilters((p) => ({
                        ...p,
                        recovered: !p.recovered,
                      }))
                    }
                  />
                  <FilterChip
                    label="No ManyChat ID"
                    active={!!statusFilters.noManychatId}
                    onClick={() =>
                      setStatusFilters((p) => ({
                        ...p,
                        noManychatId: !p.noManychatId,
                      }))
                    }
                  />
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: "noConversions", label: "No conversions" },
                    { key: "recovered", label: "Recovered" },
                    { key: "transferred", label: "Transferred" },
                    { key: "purchased", label: "Purchased" },
                    { key: "lockIn", label: "Lock In" },
                  ].map((x) => (
                    <FilterChip
                      key={x.key}
                      label={x.label}
                      active={!!statusFilters?.[x.key]}
                      onClick={() =>
                        x.key === "purchased"
                          ? setStatusFilters((p) => {
                              const nextPurchased = !p.purchased;
                              setSortBy((s) =>
                                nextPurchased
                                  ? "purchased_at"
                                  : s === "purchased_at"
                                    ? "call_date"
                                    : s,
                              );
                              return { ...p, purchased: nextPurchased };
                            })
                          : setStatusFilters((p) => ({
                              ...p,
                              [x.key]: !p[x.key],
                            }))
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {!isAllTab ? (
        <LeadsStats
          loading={!!dataState?.loading}
          stats={{
            booked,
            confirmed: dataState?.counts?.confirmed || 0,
            cancelled: dataState?.counts?.cancelled || 0,
            noPickUp: dataState?.counts?.noPickup || 0,
            noShows: dataState?.counts?.noShow || 0,
          }}
          details={{
            slots,
            occupancy,
            booked,
            confirmed: dataState?.counts?.confirmed || 0,
            cancelled: dataState?.counts?.cancelled || 0,
            noPickUp: dataState?.counts?.noPickup || 0,
            noShows: dataState?.counts?.noShow || 0,
          }}
        />
      ) : null}

      <div
        className={cx(
          hasTableLayout
            ? "w-full max-w-full overflow-x-auto"
            : null,
        )}
      >
        <div
          className={cx(
            hasTableLayout
              ? cx("min-w-max", tableMinWidthClass)
              : null,
            "divide-y divide-slate-100",
          )}
        >
          {!dataState?.loading && sortedLeads.length === 0 ? (
            <div className="px-3 py-8 text-sm text-slate-500 text-center">
              No leads found.
            </div>
          ) : (
            <>
              <div className="px-3 py-2 bg-slate-50/70 border-y border-slate-200">
                <div
                  className={cx(
                    "grid items-center gap-4 text-[11px] font-bold tracking-wide text-slate-500 uppercase",
                    gridClass,
                  )}
                >
                  <div className="text-center"> </div>
                  <div>Name / Email</div>
                  <div className="text-center">Setter</div>
                  <div className="text-center">Closer</div>
                  <div className="text-center">Book Date</div>
                  <div className="text-center">Call Date</div>
                  <div className="text-center">Status</div>
                  <div className="text-center">Response</div>
                  <div className="text-center">Notes</div>
                  <div className="text-right"> </div>
                </div>
              </div>

              {dataState?.loading ? (
                <TableSkeletonRows subTab={subTab} count={8} />
              ) : (
                sortedLeads.map((l) => (
                  <LeadRow
                    key={l.id}
                    lead={l}
                    setterName={dataState?.setterMap?.[String(l.setter_id)] || l?.setters?.name}
                    closerName={dataState?.closerMap?.[String(l.closer_id)] || l?.closers?.name}
                    setterMap={dataState?.setterMap || {}}
                    closerList={dataState?.closerList || []}
                    useCompactStatusBadges
                  />
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
