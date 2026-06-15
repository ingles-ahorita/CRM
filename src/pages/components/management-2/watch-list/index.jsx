import React, { useMemo } from "react";
import { CheckCircle2, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { useWatchList } from "../../../../hooks/useWatchList";
import { PERFORMANCE_COLORS } from "../../../../utils/performanceBenchmarks";

function cx(...c) {
  return c.filter(Boolean).join(" ");
}

// ── formatters ────────────────────────────────────────────────────────────────
const fmtUSD = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(v) || 0);

const fmtValue = (v, unit) =>
  v == null || !Number.isFinite(v) ? "—" : unit === "$" ? fmtUSD(v) : `${v.toFixed(1)}%`;

const fmtTarget = (t, unit) => (t == null ? "—" : unit === "$" ? fmtUSD(t) : `${t}%`);

function fmtGap(gap, unit) {
  if (gap == null || !Number.isFinite(gap)) return "—";
  const abs = Math.abs(gap);
  return unit === "$" ? `−${fmtUSD(abs)}` : `−${abs.toFixed(1)} pts`;
}

const shimmer = (className = "") => <div className={cx("animate-pulse rounded-md bg-slate-200/70", className)} />;

const CARD = "rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]";
const SECTION_TITLE = "text-[11px] font-extrabold uppercase tracking-widest text-slate-600/90";

const SEVERITY_STYLE = {
  Critical: "bg-rose-100 text-rose-700 ring-rose-200",
  Warning: "bg-amber-100 text-amber-700 ring-amber-200",
  "Slightly below": "bg-amber-50 text-amber-600 ring-amber-100",
};
const SEVERITY_DOT = {
  Critical: PERFORMANCE_COLORS.BAD,
  Warning: PERFORMANCE_COLORS.OK,
  "Slightly below": "#fbbf24",
};
const SEVERITY_ORDER = ["Critical", "Warning", "Slightly below"];

function TrendCell({ trend }) {
  if (trend === "improving")
    return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600"><TrendingUp size={12} />Improving</span>;
  if (trend === "declining")
    return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600"><TrendingDown size={12} />Declining</span>;
  if (trend === "stable")
    return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500"><Minus size={12} />Stable</span>;
  return <span className="text-[11px] text-slate-300">—</span>;
}

// ── left column: summary ────────────────────────────────────────────────────
function MiniStat({ value, label, tone }) {
  return (
    <div className="rounded-xl border border-slate-200 px-2 py-2 text-center">
      <div className={cx("text-[18px] font-bold leading-none tabular-nums", tone)}>{value}</div>
      <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
    </div>
  );
}

function SummaryCard({ data, loading, rangeLabel, errorMsg, severityCounts }) {
  const counts = data?.counts;
  const total = counts?.total ?? 0;
  return (
    <div className={CARD}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <h2 className="text-[16px] font-bold tracking-tight text-[#0f172a]">Watch List</h2>
        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500 ring-1 ring-black/[0.04]">
          Last 10 days
        </span>
      </div>
      <p className="mb-3 text-[11px] font-medium text-slate-500">Below benchmark · {rangeLabel}</p>

      {errorMsg ? (
        <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-800">{errorMsg}</div>
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-2">{shimmer("h-16 w-full rounded-xl")}{shimmer("h-12 w-full rounded-xl")}{shimmer("h-20 w-full rounded-xl")}</div>
      ) : counts ? (
        <div className="flex flex-col gap-2">
          <div className={cx("rounded-xl px-3 py-3 text-center ring-1", total > 0 ? "bg-rose-50 ring-rose-200" : "bg-emerald-50 ring-emerald-200")}>
            <div className={cx("text-[32px] font-extrabold leading-none tabular-nums", total > 0 ? "text-rose-600" : "text-emerald-600")}>{total}</div>
            <div className={cx("mt-0.5 text-[9.5px] font-bold uppercase tracking-wider", total > 0 ? "text-rose-500" : "text-emerald-600")}>
              {total === 0 ? "All on benchmark" : `metric${total === 1 ? "" : "s"} below benchmark`}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <MiniStat value={`${counts.flaggedSetters}/${counts.totalSetters}`} label="Setters flagged" tone={counts.flaggedSetters > 0 ? "text-rose-600" : "text-emerald-600"} />
            <MiniStat value={`${counts.flaggedClosers}/${counts.totalClosers}`} label="Closers flagged" tone={counts.flaggedClosers > 0 ? "text-rose-600" : "text-emerald-600"} />
          </div>

          {total > 0 ? (
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">By severity</div>
              <div className="flex flex-col gap-1">
                {SEVERITY_ORDER.map((s) => (
                  <div key={s} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: SEVERITY_DOT[s] }} />
                      <span className="text-[11px] font-medium text-slate-600">{s}</span>
                    </span>
                    <span className="text-[12px] font-bold tabular-nums text-slate-700">{severityCounts[s] ?? 0}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ── middle column: breach tables (split by role) ─────────────────────────────
function BreachSection({ title, rows }) {
  if (rows.length === 0) return null;

  // Group by person, preserving sort order (worst gap first)
  const personOrder = [];
  const byPerson = new Map();
  for (const r of rows) {
    if (!byPerson.has(r.person)) {
      personOrder.push(r.person);
      byPerson.set(r.person, []);
    }
    byPerson.get(r.person).push(r);
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 px-0.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{title}</span>
        <span
          title={`${rows.length} ${title.toLowerCase()} metric${rows.length === 1 ? "" : "s"} below benchmark (last 10 days)`}
          className="inline-flex h-4 min-w-4 cursor-help items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-extrabold tabular-nums text-white"
        >
          {rows.length}
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <th className="px-2.5 py-2">Metric</th>
              <th className="px-2.5 py-2 text-right">10-day avg</th>
              <th className="px-2.5 py-2 text-right">Benchmark</th>
              <th className="px-2.5 py-2 text-right">Gap</th>
              <th className="px-2.5 py-2">Trend</th>
              <th className="px-2.5 py-2">Severity</th>
            </tr>
          </thead>
          <tbody>
            {personOrder.map((person, pi) => {
              const metrics = byPerson.get(person);
              const worstSeverity = metrics.some((m) => m.severity === "Critical") ? "Critical"
                : metrics.some((m) => m.severity === "Warning") ? "Warning" : "Slightly below";
              return (
                <React.Fragment key={person}>
                  <tr className={cx("border-t border-slate-200 bg-slate-100/70", pi === 0 && "border-t-0")}>
                    <td colSpan={6} className="px-2.5 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-extrabold text-slate-800">{person}</span>
                        <span className={cx(
                          "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1.5 text-[9px] font-extrabold tabular-nums ring-1 ring-inset",
                          worstSeverity === "Critical" ? "bg-rose-100 text-rose-700 ring-rose-200"
                            : worstSeverity === "Warning" ? "bg-amber-100 text-amber-700 ring-amber-200"
                            : "bg-amber-50 text-amber-600 ring-amber-100",
                        )}>
                          {metrics.length} issue{metrics.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {metrics.map((r) => (
                    <tr key={`${r.role}-${r.person}-${r.id}`} className="border-t border-slate-100 bg-white text-[12.5px] last:border-b-0">
                      <td className="py-2 pl-6 pr-2.5 font-medium text-slate-700">{r.label}</td>
                      <td className="px-2.5 py-2 text-right font-extrabold tabular-nums" style={{ color: PERFORMANCE_COLORS[r.level] ?? PERFORMANCE_COLORS.BAD }}>{fmtValue(r.value, r.unit)}</td>
                      <td className="px-2.5 py-2 text-right tabular-nums text-slate-500">{fmtTarget(r.target, r.unit)}</td>
                      <td className="px-2.5 py-2 text-right font-semibold tabular-nums text-rose-600">{fmtGap(r.gap, r.unit)}</td>
                      <td className="px-2.5 py-2"><TrendCell trend={r.trend} /></td>
                      <td className="px-2.5 py-2"><span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset", SEVERITY_STYLE[r.severity] ?? SEVERITY_STYLE.Warning)}>{r.severity}</span></td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BreachTable({ rows, loading }) {
  const setterRows = rows.filter((r) => r.role === "Setter");
  const closerRows = rows.filter((r) => r.role === "Closer");
  return (
    <div className={CARD}>
      <h3 className={cx("mb-3", SECTION_TITLE)}>Metrics below benchmark</h3>
      {loading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <React.Fragment key={i}>{shimmer("h-9 w-full")}</React.Fragment>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <CheckCircle2 size={28} className="mx-auto mb-2 text-emerald-500" />
          <div className="text-[14px] font-bold text-emerald-700">All tracked metrics are currently meeting benchmark.</div>
          <div className="mt-0.5 text-[12px] text-emerald-600">Nothing to flag over the last 10 days.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <BreachSection title="Closers" rows={closerRows} />
          <BreachSection title="Setters" rows={setterRows} />
        </div>
      )}
    </div>
  );
}

// ── right column: people roster ──────────────────────────────────────────────
function PersonCard({ person, role, items }) {
  const tip =
    `${person} · ${items.length} below benchmark\n` +
    items.map((m) => `${m.label}: ${fmtValue(m.value, m.unit)} (target ${fmtTarget(m.target, m.unit)})`).join("\n");
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <span className="flex items-center gap-1.5 truncate">
          <span className="text-[12.5px] font-bold text-slate-900 truncate">{person}</span>
          <span className="shrink-0 rounded-md bg-slate-100 px-1 py-0.5 text-[9px] font-semibold text-slate-500">{role}</span>
        </span>
        <span
          title={tip}
          className="shrink-0 inline-flex h-5 min-w-5 cursor-help items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-extrabold tabular-nums text-white"
        >
          {items.length}
        </span>
      </div>
      <div className="px-3 py-1.5">
        {items.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-1 last:border-b-0">
            <span className="truncate text-[11px] font-semibold text-slate-600">{m.label}</span>
            <span className="shrink-0 text-[11.5px] font-extrabold tabular-nums" style={{ color: PERFORMANCE_COLORS[m.level] ?? PERFORMANCE_COLORS.BAD }}>{fmtValue(m.value, m.unit)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PeopleColumn({ groups, loading }) {
  const setters = groups.filter((g) => g.role === "Setter");
  const closers = groups.filter((g) => g.role === "Closer");

  if (loading) {
    return (
      <>{[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">{shimmer("mb-2 h-3 w-24")}{shimmer("h-3 w-full")}</div>
      ))}</>
    );
  }
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
        <CheckCircle2 size={20} className="mx-auto mb-1 text-emerald-500" />
        <div className="text-[12px] font-bold text-emerald-700">Everyone on benchmark</div>
      </div>
    );
  }
  return (
    <>
      <h3 className={cx("px-0.5", SECTION_TITLE)}>Who to coach</h3>
      {setters.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <div className="px-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Setters</div>
          {setters.map((g) => <PersonCard key={`${g.role}-${g.person}`} {...g} />)}
        </div>
      ) : null}
      {closers.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <div className="px-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Closers</div>
          {closers.map((g) => <PersonCard key={`${g.role}-${g.person}`} {...g} />)}
        </div>
      ) : null}
    </>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────
export default function WatchListTab() {
  const { data, loading, errorMsg } = useWatchList();
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const counts = data?.counts;

  const rangeLabel = useMemo(() => {
    if (!data?.range) return "last 10 days";
    try {
      const fmt = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `${fmt(data.range.startDate)} – ${fmt(data.range.endDate)}`;
    } catch {
      return "last 10 days";
    }
  }, [data]);

  const severityCounts = useMemo(() => {
    const c = { Critical: 0, Warning: 0, "Slightly below": 0 };
    for (const r of rows) if (c[r.severity] != null) c[r.severity] += 1;
    return c;
  }, [rows]);

  const total = counts?.total ?? 0;
  const closerRows = rows.filter((r) => r.role === "Closer");
  const setterRows = rows.filter((r) => r.role === "Setter");

  return (
    <div className={CARD}>
      {/* ── Header ── */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] font-bold tracking-tight text-[#0f172a]">Watch List</h2>
            <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500 ring-1 ring-black/[0.04]">
              Last 10 days
            </span>
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">Below benchmark · {rangeLabel}</p>
        </div>
      </div>

      {errorMsg ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-800">{errorMsg}</div>
      ) : null}

      {/* ── Summary Stats ── */}
      {loading ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 flex-1 min-w-[90px] animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : counts ? (
        <div className="mb-5 flex flex-wrap gap-2">
          <div className={cx("flex min-w-[90px] flex-1 flex-col items-center justify-center rounded-xl px-3 py-2.5 text-center ring-1", total > 0 ? "bg-rose-50 ring-rose-200" : "bg-emerald-50 ring-emerald-200")}>
            <div className={cx("text-[28px] font-extrabold leading-none tabular-nums", total > 0 ? "text-rose-600" : "text-emerald-600")}>{total}</div>
            <div className={cx("mt-0.5 text-[9px] font-bold uppercase tracking-wider", total > 0 ? "text-rose-500" : "text-emerald-600")}>
              {total === 0 ? "All on benchmark" : `metric${total !== 1 ? "s" : ""} below`}
            </div>
          </div>

          <div className="flex min-w-[90px] flex-1 flex-col items-center justify-center rounded-xl border border-slate-200 px-3 py-2.5 text-center">
            <div className={cx("text-[22px] font-bold leading-none tabular-nums", counts.flaggedSetters > 0 ? "text-rose-600" : "text-emerald-600")}>
              {counts.flaggedSetters}/{counts.totalSetters}
            </div>
            <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">Setters flagged</div>
          </div>

          <div className="flex min-w-[90px] flex-1 flex-col items-center justify-center rounded-xl border border-slate-200 px-3 py-2.5 text-center">
            <div className={cx("text-[22px] font-bold leading-none tabular-nums", counts.flaggedClosers > 0 ? "text-rose-600" : "text-emerald-600")}>
              {counts.flaggedClosers}/{counts.totalClosers}
            </div>
            <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">Closers flagged</div>
          </div>

          {total > 0 ? (
            <div className="flex min-w-[130px] flex-1 flex-col justify-center rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
              <div className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">By severity</div>
              <div className="flex flex-col gap-1">
                {SEVERITY_ORDER.map((s) => (
                  <div key={s} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: SEVERITY_DOT[s] }} />
                      <span className="text-[10px] font-medium text-slate-600">{s}</span>
                    </span>
                    <span className="text-[11px] font-bold tabular-nums text-slate-700">{severityCounts[s] ?? 0}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Breach Table ── */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <React.Fragment key={i}>{shimmer("h-9 w-full")}</React.Fragment>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <CheckCircle2 size={28} className="mx-auto mb-2 text-emerald-500" />
          <div className="text-[14px] font-bold text-emerald-700">All tracked metrics are currently meeting benchmark.</div>
          <div className="mt-0.5 text-[12px] text-emerald-600">Nothing to flag over the last 10 days.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <BreachSection title="Closers" rows={closerRows} />
          <BreachSection title="Setters" rows={setterRows} />
        </div>
      )}
    </div>
  );
}