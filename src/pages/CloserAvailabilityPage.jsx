import React, { useState, useEffect } from 'react';
import { Calendar, BarChart3, Database, Clock, Activity } from 'lucide-react';

const TAB_OVERVIEW = 'overview';
const TAB_RAW = 'raw';

export default function CloserAvailabilityPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(TAB_OVERVIEW);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/closer-availability');
        const json = await res.json();
        if (!cancelled) {
          if (!res.ok) {
            setError(json.error || `HTTP ${res.status}`);
            setData(null);
          } else {
            setData(json);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="text-lg text-gray-600">Loading Calendly data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto bg-red-50 border border-red-200 rounded-lg p-6">
          <h1 className="text-xl font-bold text-red-800 mb-2">Error</h1>
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  // Compute per-day totals (available, busy) for whole-day occupancy row
  const dayTotals = (data?.hoursGrid?.[0]?.days || []).map((_, i) => {
    let avail = 0;
    let busy = 0;
    (data.hoursGrid || []).forEach((row) => {
      const d = row.days?.[i];
      if (d) {
        avail += d.hours || 0;
        busy += d.busyHours ?? 0;
      }
    });
    return { available: avail, busy };
  });

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="w-7 h-7" />
            Closer Availability (Calendly)
          </h1>
          <div className="flex gap-2 border rounded-lg p-1 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setActiveTab(TAB_OVERVIEW)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === TAB_OVERVIEW ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab(TAB_RAW)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === TAB_RAW ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Database className="w-4 h-4" />
              Raw data
            </button>
          </div>
        </div>

        {activeTab === TAB_OVERVIEW && data && (
          <div className="space-y-6">
            {/* Weekly calendar grid - occupancy per closer per day (first on page) */}
            <div className="bg-white rounded-xl shadow overflow-hidden border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-lg font-semibold text-gray-900">Occupancy per day (this week)</h2>
                <p className="text-sm text-gray-500 mt-1">Full bar = availability. Filled = busy time. All times in each closer&apos;s local timezone (Mon–Sun).</p>
              </div>
              {(!data.hoursGrid || data.hoursGrid.length === 0) ? (
                <div className="p-12 text-center text-amber-600">
                  No closers matched in Calendly. Check the Raw data tab to see org members.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">Closer</th>
                        {(data.hoursGrid[0]?.days || []).map((d, i) => (
                          <th key={i} className="px-4 py-4 text-center text-xs font-semibold text-gray-600 uppercase w-28">
                            {d.weekday}
                            <div className="text-[10px] font-normal text-gray-400 mt-0.5">{d.date}</div>
                          </th>
                        ))}
                        <th className="px-4 py-4 text-center text-xs font-semibold text-gray-600 uppercase w-20">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.hoursGrid.map((row, rIdx) => {
                        const weekOccupancy = (row.days || []).reduce((acc, d) => {
                          const avail = d.hours || 0;
                          const busy = d.busyHours ?? 0;
                          return avail > 0 ? acc + (busy / avail) * 100 : acc;
                        }, 0);
                        const dayCount = (row.days || []).filter((d) => (d.hours || 0) > 0).length;
                        const avgOccupancy = dayCount > 0 ? Math.round(weekOccupancy / dayCount) : 0;
                        return (
                          <tr key={rIdx} className="hover:bg-gray-50/50">
                            <td className="px-6 py-4">
                              <div className="font-medium text-gray-900">{row.name}</div>
                              <div className="text-xs text-gray-400">{row.timezone || '—'}</div>
                            </td>
                            {(row.days || []).map((day, i) => {
                              const avail = day.hours || 0;
                              const busy = day.busyHours ?? 0;
                              const free = Math.max(0, avail - busy);
                              const occupancyPct = avail > 0 ? Math.round((busy / avail) * 100) : 0;
                              const busyPctOfBar = avail > 0 ? (busy / avail) * 100 : 0;
                              const freePctOfBar = avail > 0 ? (free / avail) * 100 : 0;
                              return (
                                <td key={i} className="px-4 py-3">
                                  <div className="flex flex-col items-center gap-1">
                                    <div
                                      className="w-full h-8 rounded-md overflow-hidden flex bg-gray-100"
                                      title={avail > 0 ? `${avail}h available, ${busy}h busy, ${free}h free (${occupancyPct}% occupied)` : ''}
                                    >
                                      {avail > 0 ? (
                                        <>
                                          <div
                                            className={`h-full shrink-0 ${occupancyPct >= 80 ? 'bg-rose-500' : occupancyPct >= 50 ? 'bg-amber-400' : occupancyPct > 0 ? 'bg-emerald-500' : 'bg-gray-200'}`}
                                            style={{ width: `${busyPctOfBar}%` }}
                                          />
                                          <div
                                            className="h-full shrink-0 bg-emerald-100"
                                            style={{ width: `${freePctOfBar}%` }}
                                          />
                                        </>
                                      ) : null}
                                    </div>
                                    <span className="text-xs font-medium text-gray-600">
                                      {avail > 0 ? `${busy}/${avail}h (${occupancyPct}%)` : '—'}
                                    </span>
                                  </div>
                                </td>
                              );
                            })}
                            <td className="px-4 py-3 text-center">
                              <span className="font-semibold text-gray-900">{avgOccupancy}%</span>
                            </td>
                          </tr>
                        );
                      })}
                      {/* Whole-day occupancy row (all closers combined per day) */}
                      {dayTotals.length > 0 && (
                        <tr className="border-t-2 border-gray-200 bg-indigo-50/50">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-indigo-900">Day total</div>
                            <div className="text-xs text-indigo-600">All closers</div>
                          </td>
                          {dayTotals.map((dt, i) => {
                            const avail = dt.available;
                            const busy = dt.busy;
                            const free = Math.max(0, avail - busy);
                            const occPct = avail > 0 ? Math.round((busy / avail) * 100) : 0;
                            const busyPctOfBar = avail > 0 ? (busy / avail) * 100 : 0;
                            const freePctOfBar = avail > 0 ? (free / avail) * 100 : 0;
                            return (
                              <td key={i} className="px-4 py-3">
                                <div className="flex flex-col items-center gap-1">
                                  <div
                                    className="w-full h-8 rounded-md bg-indigo-100 overflow-hidden flex"
                                    title={avail > 0 ? `${avail}h available, ${busy}h busy, ${free}h free (${occPct}% occupied)` : ''}
                                  >
                                    {avail > 0 && (
                                      <>
                                        <div
                                          className={`h-full shrink-0 ${occPct >= 80 ? 'bg-rose-500' : occPct >= 50 ? 'bg-amber-400' : occPct > 0 ? 'bg-indigo-500' : 'bg-indigo-200'}`}
                                          style={{ width: `${busyPctOfBar}%` }}
                                        />
                                        <div
                                          className="h-full shrink-0 bg-indigo-100"
                                          style={{ width: `${freePctOfBar}%` }}
                                        />
                                      </>
                                    )}
                                  </div>
                                  <span className="text-xs font-semibold text-indigo-700">
                                    {avail > 0 ? `${busy}/${avail}h (${occPct}%)` : '—'}
                                  </span>
                                </div>
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-center">
                            {(() => {
                              const totAvail = dayTotals.reduce((s, dt) => s + dt.available, 0);
                              const totBusy = dayTotals.reduce((s, dt) => s + dt.busy, 0);
                              const weekOcc = totAvail > 0 ? Math.round((totBusy / totAvail) * 100) : 0;
                              return <span className="font-semibold text-indigo-900">{weekOcc}%</span>;
                            })()}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-6 text-sm text-gray-600">
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 rounded bg-rose-500" /> Busy (80%+)
              </span>
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 rounded bg-amber-400" /> Busy (50–80%)
              </span>
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 rounded bg-emerald-500" /> Busy (1–50%)
              </span>
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 rounded bg-emerald-100" /> Free
              </span>
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 rounded bg-gray-200" /> No availability
              </span>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl shadow p-4 border border-gray-100">
                <div className="text-sm text-gray-500 font-medium">Closers found</div>
                <div className="text-2xl font-bold text-gray-900">{data.closersFound ?? 0} / {data.closerNames?.length ?? 0}</div>
              </div>
              <div className="bg-white rounded-xl shadow p-4 border border-gray-100">
                <div className="text-sm text-gray-500 font-medium">Hours available (week)</div>
                <div className="text-2xl font-bold text-indigo-600">
                  {data.hoursGrid?.reduce((sum, row) =>
                    sum + (row.days || []).reduce((s, d) => s + (d.hours || 0), 0), 0
                  ).toFixed(1) ?? 0}h
                </div>
              </div>
              <div className="bg-white rounded-xl shadow p-4 border border-gray-100">
                <div className="text-sm text-gray-500 font-medium flex items-center gap-1.5">
                  <Clock className="w-4 h-4" /> Busy hours (booked)
                </div>
                <div className="text-2xl font-bold text-rose-600">
                  {data.busyTimesByCloser?.reduce((s, c) => s + (c.busyHoursTotal || 0), 0).toFixed(1) ?? 0}h
                </div>
              </div>
              <div className="bg-white rounded-xl shadow p-4 border border-gray-100">
                <div className="text-sm text-gray-500 font-medium flex items-center gap-1.5">
                  <Activity className="w-4 h-4" /> Avg occupancy
                </div>
                <div className="text-2xl font-bold text-slate-800">
                  {(() => {
                    const occs = data.occupancyByCloser || [];
                    if (!occs.length) return '—';
                    const avg = occs.reduce((s, o) => s + (o.occupancyPct || 0), 0) / occs.length;
                    return `${Math.round(avg)}%`;
                  })()}
                </div>
              </div>
              {data.missingClosers?.length > 0 && (
                <div className="bg-amber-50 rounded-xl shadow p-4 border border-amber-200 lg:col-span-4">
                  <div className="text-sm text-amber-700 font-medium">Missing in Calendly</div>
                  <div className="text-lg font-semibold text-amber-800">{data.missingClosers.join(', ')}</div>
                </div>
              )}
            </div>

            {/* Occupancy & busy times per closer */}
            {(data.occupancyByCloser?.length > 0 || data.busyTimesByCloser?.length > 0) && (
              <div className="bg-white rounded-xl shadow overflow-hidden border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                  <h2 className="text-lg font-semibold text-gray-900">Occupancy & busy times</h2>
                  <p className="text-sm text-gray-500 mt-1">Booked hours vs available hours (from Calendly user_busy_times). Occupancy = busy ÷ available.</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {(data.occupancyByCloser || []).map((occ, idx) => {
                    const busy = data.busyTimesByCloser?.[idx];
                    const slots = busy?.busySlots || [];
                    return (
                      <div key={idx} className="px-6 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
                          <div className="font-medium text-gray-900">{occ.name}</div>
                          <div className="flex flex-wrap gap-4 text-sm">
                            <span className="text-gray-600">Available: <strong>{occ.availableHours}h</strong></span>
                            <span className="text-rose-600">Busy: <strong>{occ.busyHours}h</strong></span>
                            <span className="text-emerald-600">Free: <strong>{occ.freeHours}h</strong></span>
                            <span className={`font-semibold ${occ.occupancyPct >= 80 ? 'text-rose-600' : occ.occupancyPct >= 50 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              Occupancy: {occ.occupancyPct}%
                            </span>
                          </div>
                        </div>
                        {slots.length > 0 && (
                          <div className="text-xs text-gray-600 space-y-1">
                            <div className="font-medium text-gray-700">Busy slots (booked) — hover to see blocks:</div>
                            <div className="flex flex-wrap gap-2">
                              {slots.slice(0, 20).map((slot, i) => {
                                const start = slot?.start_time ? new Date(slot.start_time) : null;
                                const end = slot?.end_time ? new Date(slot.end_time) : null;
                                const label = start && end
                                  ? `${start.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })} – ${end.toLocaleTimeString(undefined, { timeStyle: 'short' })}`
                                  : JSON.stringify(slot);
                                const blockInfo = busy?.slotBlocks?.[i];
                                const contributingDays = blockInfo?.byDay?.filter((d) => d.blocksCount > 0) || [];
                                const totalBlocks = contributingDays.reduce((s, d) => s + d.blocksCount, 0);
                                const hoverTitle = contributingDays.length > 0
                                  ? `Blocks: ${totalBlocks} total\n` + contributingDays.map((d) =>
                                    `  ${d.date}: ${d.blocksCount} block(s) — ${(d.blockHours || []).join(', ')}`
                                  ).join('\n')
                                  : 'No overlap with availability';
                                return (
                                  <span
                                    key={i}
                                    className="inline-flex items-center px-2 py-1 rounded bg-rose-50 text-rose-700 border border-rose-100 cursor-help"
                                    title={hoverTitle}
                                  >
                                    {label}{totalBlocks > 0 ? ` (${totalBlocks})` : ''}
                                  </span>
                                );
                              })}
                              {slots.length > 20 && (
                                <span className="text-gray-400">+{slots.length - 20} more</span>
                              )}
                            </div>
                          </div>
                        )}
                        {busy?.error && (
                          <div className="text-amber-600 text-sm mt-1">Busy times error: {busy.error}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === TAB_RAW && data && (
          <div className="space-y-6">
            <div className="bg-amber-50 rounded-lg p-6 border border-amber-200">
              <h2 className="text-lg font-semibold text-amber-900 mb-4">Busy times API (raw requests &amp; responses)</h2>
              {data.busyTimesRange && (
                <div className="mb-4 p-4 bg-white rounded-lg border border-amber-100">
                  <div className="text-sm font-medium text-amber-900 mb-2">Range used for all closers</div>
                  <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">{JSON.stringify(data.busyTimesRange, null, 2)}</pre>
                </div>
              )}
              <p className="text-sm text-amber-800 mb-4">Per closer: params sent, HTTP status, full Calendly response.</p>
              <div className="space-y-4">
                {(data.busyTimesByCloser || []).map((b, i) => (
                  <div key={i} className="bg-white rounded-lg p-4 border border-amber-100 overflow-auto">
                    <div className="font-semibold text-gray-900 mb-2">{b.name}</div>
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">{JSON.stringify(b.raw, null, 2)}</pre>
                    {b.slotBlocks && b.slotBlocks.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-amber-100">
                        <div className="text-sm font-medium text-amber-800 mb-2">Per-slot blocks (hover in Overview to see) — only within availability</div>
                        <div className="space-y-2">
                          {b.slotBlocks.map((sb, idx) => {
                            const contributing = (sb.byDay || []).filter((d) => d.blocksCount > 0);
                            const total = contributing.reduce((s, d) => s + d.blocksCount, 0);
                            return (
                              <div key={idx} className="text-xs p-2 bg-amber-50 rounded border border-amber-100">
                                <div className="font-medium text-amber-900">
                                  {sb.start} → {sb.end}
                                </div>
                                <div className="text-amber-700 mt-1">
                                  {total} block(s) total: {contributing.length ? contributing.map((d) => `${d.date}: ${d.blocksCount} (${(d.blockHours || []).join(', ')})`).join('; ') : 'no overlap with availability'}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {b.busyDebug && (
                      <div className="mt-4 pt-4 border-t border-amber-100">
                        <div className="text-sm font-medium text-amber-800 mb-2">Block calculation per day (merged segments, 45-min blocks H:00–H:45)</div>
                        <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono">{JSON.stringify(b.busyDebug, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-6 bg-gray-900 rounded-lg p-4 overflow-auto max-h-[70vh]">
              <h2 className="text-sm font-semibold text-gray-300 mb-2">Full API response</h2>
              <pre className="text-green-400 text-xs whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
            </div>

            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <div className="text-sm text-blue-700 font-medium">Target closers</div>
                    <div className="text-lg font-bold text-blue-900">{data.closerNames?.join(', ') || '—'}</div>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <div className="text-sm text-green-700 font-medium">Found in Calendly</div>
                    <div className="text-lg font-bold text-green-900">{data.closersFound ?? 0} / {data.closerNames?.length ?? 0}</div>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-lg">
                    <div className="text-sm text-amber-700 font-medium">Missing</div>
                    <div className="text-lg font-bold text-amber-900">
                      {data.missingClosers?.length ? data.missingClosers.join(', ') : 'None'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">All Calendly org members</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Timezone</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Closer?</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">URI</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {(data.allMembers || []).map((m, i) => (
                        <tr key={i} className={m.isCloser ? 'bg-green-50' : ''}>
                          <td className="px-4 py-2 text-sm font-medium text-gray-900">{m.name ?? '—'}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{m.email ?? '—'}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{m.timezone ?? '—'}</td>
                          <td className="px-4 py-2">
                            {m.isCloser ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Yes</span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-500 font-mono truncate max-w-[200px]" title={m.uri}>{m.uri ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Availability schedules (per closer)</h2>
                {(data.availabilityByCloser || []).length === 0 ? (
                  <p className="text-amber-600">No closers matched in Calendly.</p>
                ) : (
                  <div className="space-y-6">
                    {data.availabilityByCloser.map((closer, idx) => (
                      <div key={idx} className="border border-gray-200 rounded-lg p-4">
                        <h3 className="font-semibold text-gray-900 mb-2">{closer.name}</h3>
                        <p className="text-sm text-gray-600 mb-3">Timezone: {closer.timezone ?? '—'} · {closer.schedulesCount} schedule(s)</p>
                        {closer.schedules.map((sched, sIdx) => (
                          <div key={sIdx} className="mt-3 pl-4 border-l-2 border-gray-200">
                            <div className="text-sm font-medium text-gray-700">{sched.name || `Schedule ${sIdx + 1}`}</div>
                            <div className="text-xs text-gray-500 font-mono mb-2">{sched.uri}</div>
                            {sched.rulesCount === 0 ? (
                              <span className="text-amber-600 text-sm">No rules</span>
                            ) : (
                              <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">{JSON.stringify(sched.rules, null, 2)}</pre>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
