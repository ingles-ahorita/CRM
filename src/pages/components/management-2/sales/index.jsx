import { useEffect, useState } from "react";
import * as DateHelpers from "../../../../utils/dateHelpers";
import { supabase } from "../../../../lib/supabaseClient";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  PERFORMANCE_COLORS,
  PERFORMANCE_TEXT_CLASSES,
  PERFORMANCE_SOFT_BG_CLASSES,
} from "../../../../utils/performanceBenchmarks";

const INCOME_SOURCE_DEFS = [
  {
    key: "new",
    label: "New income",
    color: "#10B981",
    note: "First-time cash from purchases started this month",
  },
  {
    key: "old",
    label: "Old income",
    color: "#2563EB",
    note: "Cash from earlier purchases collected this month",
  },
  {
    key: "subscriptions",
    label: "Subscriptions",
    color: "#F59E0B",
    note: "Recurring subscription product charges",
  },
];

const SUCCESS_STATES = new Set([
  "paid",
  "successful",
  "success",
  "complete",
  "completed",
  "succeeded",
]);

function isFailedTransaction(row, actionOverride = null) {
  const action = String(actionOverride || row?.action || "").toLowerCase();
  const state = String(row?.state || "").toLowerCase();
  return action === "dispute" || (row?.state != null && !SUCCESS_STATES.has(state));
}

const KAJABI_OFFER_FALLBACKS = {
  "2150879491": { name: "Premium - FULL", price: 1997, installments: 0 },
  "2150879483": { name: "VIP - FULL", price: 3497, installments: 0 },
  "2150879484": { name: "VIP - 4 x $949", price: 949, installments: 4 },
  "2150879490": { name: "VIP - 7 x $597", price: 597, installments: 7 },
  "2150879492": { name: "Premium - 4 x $549", price: 549, installments: 4 },
  "2150879493": { name: "Premium - 7 x $349", price: 349, installments: 7 },
  "2150879495": { name: "Student - FULL", price: 897, installments: 0 },
  "2150879496": { name: "Student - 3 x $349", price: 349, installments: 3 },
  "2150523894": { name: "Lock-in", price: 100, installments: 0 },
  "2150799973": { name: "Payoff", price: 0, installments: 0 },
  "2150991083": { name: "Student - 5 x $199", price: 199, installments: 5 },
  "2150961576": { name: "2. 3 x $600 ($500)", price: 500, installments: 3 },
  "2150763469": { name: "2. 4 x $549 ($449)", price: 975, installments: 4 },
  "2150757348": { name: "3. 7 x $399 ($299)", price: 623, installments: 7 },
  "2151122152": { name: "3. 6 x $349", price: 349, installments: 6 },
  "2150757309": { name: "1. $1997 USD ($1497)", price: 1497, installments: 0 }
};

function txAmountUsd(row) {
  return Math.abs(Number(row?.amount_in_cents || 0)) / 100;
}

function sumGrossTransactions(rows, startISO, endISO) {
  return (rows || []).reduce((sum, row) => {
    if (!row?.created_at_kajabi || row.created_at_kajabi < startISO || row.created_at_kajabi > endISO) return sum;
    const action = String(row?.action || (Number(row?.amount_in_cents || 0) >= 0 ? "charge" : "refund")).toLowerCase();
    const isRefund = action === "refund" || Number(row?.amount_in_cents || 0) < 0;
    return !isRefund && !isFailedTransaction(row, action) ? sum + txAmountUsd(row) : sum;
  }, 0);
}

function sumNetTransactions(rows, startISO, endISO) {
  return (rows || []).reduce((sum, row) => {
    const resolvedInRange =
      row?.payment_resolved_at != null &&
      row.payment_resolved_at >= startISO &&
      row.payment_resolved_at <= endISO &&
      (row.effective_date == null || row.effective_date < startISO || row.effective_date > endISO);
    const inRange =
      (row?.effective_date >= startISO && row.effective_date <= endISO) ||
      resolvedInRange;
    if (!inRange) return sum;

    const action = resolvedInRange
      ? "charge"
      : String(row?.action || (Number(row?.amount_in_cents || 0) >= 0 ? "charge" : "refund")).toLowerCase();
    if (!resolvedInRange && isFailedTransaction(row, action)) return sum;

    const isRefund = action === "refund" || Number(row?.amount_in_cents || 0) < 0;
    return sum + (isRefund ? -txAmountUsd(row) : txAmountUsd(row));
  }, 0);
}

const MONTHLY_GOAL_USD = 55000;

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function shimmer(className = "") {
  return (
    <div className={cx("animate-pulse rounded-md bg-slate-200/70", className)} />
  );
}

function RevenueCardShimmer() {
  return (
    <article className="min-h-[110px] rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      {shimmer("h-2.5 w-24")}
      {shimmer("mt-3 h-7 w-32")}
      {shimmer("mt-3 h-3 w-40")}
      <div className="mt-4 flex gap-2">
        {shimmer("h-4 w-16")}
      </div>
    </article>
  );
}

function formatUsd(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function formatCents(value) {
  return formatUsd((Number(value) || 0) / 100);
}

function pct(value, total) {
  if (!Number.isFinite(Number(value)) || !Number.isFinite(Number(total)) || Number(total) <= 0) return 0;
  return Math.round(((Number(value) / Number(total)) * 1000)) / 10;
}

function SectionBadge({ children }) {
  return (
    <span className="inline-flex h-[22px] shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 shadow-sm">
      {children}
    </span>
  );
}

function RevenueCard({ card, loading }) {
  return (
    <article className="min-h-[110px] rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
        {card.label}
      </p>
      {loading ? (
        <div className="mt-2 h-7 w-24 animate-pulse rounded bg-slate-100" />
      ) : (
        <div className={cx("mt-2 text-[24px] font-extrabold leading-none tracking-normal", card.valueClass)}>
          {card.value}
        </div>
      )}
      <p className="mt-2 text-[11px] font-semibold text-slate-500">{card.note}</p>
      {card.progress ? (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${card.progress}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] font-semibold text-slate-500">
            {card.progressNote}
          </p>
        </div>
      ) : null}
      {card.badge ? (
        <div className="mt-2">
          <span className={cx("inline-flex rounded-md px-2 py-1 text-[10px] font-extrabold leading-none", card.badgeClass)}>
            {card.badge}
          </span>
        </div>
      ) : null}
    </article>
  );
}

function RiskCard({ card, loading }) {
  return (
    <article className="min-h-[70px] rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <p className="text-[9px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
        {card.label}
      </p>
      {loading ? (
        <div className="mt-1 h-6 w-16 animate-pulse rounded bg-slate-100" />
      ) : (
        <div className={cx("mt-1 text-[20px] font-extrabold leading-none tracking-normal", card.valueClass)}>
          {card.value}
        </div>
      )}
      <p className="mt-1 text-[9px] font-semibold leading-snug text-slate-500">{card.note}</p>
    </article>
  );
}

function RevenueSnapshotPanel({ cards, loading }) {
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-2 pb-3">
        <div className="text-[13px] font-bold uppercase tracking-wide text-slate-900">
          Revenue Snapshot
        </div>
        <SectionBadge>MTD · Goal {formatUsd(MONTHLY_GOAL_USD)}</SectionBadge>
      </div>

      <div className="flex flex-col gap-2">
        {loading
          ? [1, 2, 3].map((i) => <RevenueCardShimmer key={i} />)
          : cards.map((card) => <RevenueCard key={card.label} card={card} />)}
      </div>
    </div>
  );
}

function RefundsPanel({ cards, loading }) {
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-2 pb-3">
        <div className="text-[13px] font-bold uppercase tracking-wide text-slate-900">
          Refunds, Chargebacks & Outstanding
        </div>
        <SectionBadge>Risk</SectionBadge>
      </div>

      <div className="flex flex-col gap-2">
        {loading
          ? [1, 2, 3, 4].map((i) => (
              <article key={i} className="min-h-[70px] rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
                {shimmer("h-2 w-16")}
                {shimmer("mt-2 h-5 w-24")}
                {shimmer("mt-2 h-2 w-32")}
              </article>
            ))
          : cards.map((card) => <RiskCard key={card.label} card={card} />)}
      </div>
    </div>
  );
}

function IncomeMixThisMonth({ rows, monthLabel, loading, error }) {
  const totalCents = rows.reduce((sum, row) => sum + row.valueCents, 0);
  const chartData = rows.map((row) => ({
    name: row.label,
    value: row.valueCents,
    color: row.color,
  }));

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-1 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[13px] font-bold uppercase tracking-wide text-slate-900">
            Income source mix {monthLabel ? `· ${monthLabel}` : ""}
          </div>
          <SectionBadge>Kajabi revenue mix</SectionBadge>
        </div>
        <p className="text-[11px] font-medium text-slate-500 leading-snug">
          New income shows current-month sales. Old income is cash from earlier sales. Subscriptions are recurring subscription charges.
        </p>
      </div>

      {loading ? (
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[200px_minmax(0,1fr)]">
          <div className="flex h-[180px] items-center justify-center">
            {shimmer("h-32 w-32 rounded-full")}
          </div>
          <div className="flex flex-col justify-center gap-4">
            <div className="space-y-2">
              {shimmer("h-3 w-32")}
              {shimmer("h-7 w-48")}
            </div>
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex justify-between">
                  {shimmer("h-3 w-24")}
                  {shimmer("h-3 w-16")}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : error ? (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-[12px] font-semibold text-red-700">
          {error}
        </div>
      ) : totalCents === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-[12px] font-semibold text-slate-500">
          No current-month income found yet.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[200px_minmax(0,1fr)]">
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  stroke="none"
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [formatCents(value), name]}
                  wrapperStyle={{ outline: "none" }}
                  contentStyle={{
                    border: "1px solid #e2e8f0",
                    borderRadius: "10px",
                    backgroundColor: "#fff",
                    boxShadow: "0 8px 24px rgba(15,23,42,0.14)",
                    fontSize: "10px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="flex min-w-0 flex-col justify-center">
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-[9px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
                Total income this month
              </p>
              <p className="mt-0.5 text-[20px] font-extrabold leading-none text-slate-950">
                {formatCents(totalCents)}
              </p>
            </div>

            <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100">
              {rows.map((row) => {
                const percent = pct(row.valueCents, totalCents);
                return (
                  <div key={row.key} className="flex items-start justify-between gap-3 px-2 py-1.5">
                    <div className="flex min-w-0 items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-slate-800 leading-none">{row.label}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-extrabold tabular-nums text-slate-950 leading-none">
                        {formatCents(row.valueCents)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RevenueMixPanel({ data, rows, loading }) {
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-1 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[13px] font-bold uppercase tracking-wide text-slate-900">
            Sales by Product / Offer
          </div>
          <SectionBadge>What's Selling</SectionBadge>
        </div>
        <p className="text-[11px] font-medium text-slate-500 leading-snug">
          Helps decide which offer to push, which to retire, and where to upsell.
        </p>
      </div>

      {loading ? (
        <div className="mt-2 h-[30px] w-full animate-pulse rounded bg-slate-100" />
      ) : (
        <div className="mt-2 flex h-[30px] overflow-hidden rounded-md">
          {data.map((segment) => (
            <div
              key={segment.label}
              className={cx("flex h-full items-center justify-center text-[9px] font-extrabold text-white overflow-hidden", segment.className)}
              style={{ width: `${segment.width}%` }}
              title={segment.label}
            >
              <span className="truncate px-1">{segment.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 divide-y divide-slate-100">
        {loading ? (
          [1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4 py-2.5">
              {shimmer("h-3 w-32")}
              {shimmer("h-3 w-20")}
            </div>
          ))
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-[12px] font-semibold text-slate-500">No sales this month yet.</p>
        ) : (
          rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 py-2">
              <span className="text-[12px] font-semibold text-slate-700 truncate">{label}</span>
              <span className="text-[12px] font-extrabold text-slate-950 shrink-0">{value}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DailySalesTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;

  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.14)]">
      <p className="text-[11px] font-extrabold text-slate-950">
        {row?.date || label}
      </p>
      <p className="mt-1 text-[12px] font-extrabold text-emerald-600">
        {formatUsd(payload[0]?.value)}
      </p>
      <p className="mt-0.5 text-[10px] font-semibold text-slate-500">
        Daily revenue
      </p>
    </div>
  );
}

function DailySalesTrend({ data, stats, loading }) {
  const maxRevenue = Math.max(...data.map(d => d.revenue), 1000);
  
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-2 pb-2">
        <div className="text-[13px] font-bold uppercase tracking-wide text-slate-900">
          Daily Sales Trend
        </div>
        <SectionBadge>Last 30 days</SectionBadge>
      </div>

      <div className="mt-1 h-[140px]">
        {loading ? (
          <div className="h-full w-full animate-pulse rounded bg-slate-50" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                barCategoryGap="18%"
              >
                <XAxis
                  dataKey="date"
                  axisLine={{ stroke: "#E2E8F0" }}
                  tickLine={false}
                  tickFormatter={(val, i) => {
                    // Show label only every 7 days (index 1, 8, 15, 22, 29) to match "last 30 days" view
                    return (data.length - 1 - i) % 7 === 1 ? new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : "";
                  }}
                  tick={{
                    fill: "#94A3B8",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                  height={22}
                />
                <YAxis hide domain={[0, maxRevenue * 1.1]} />
                <Tooltip
                  content={<DailySalesTooltip />}
                  cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
                  wrapperStyle={{ outline: "none" }}
                />
                <Bar
                  dataKey="revenue"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={38}
                  isAnimationActive={false}
                >
                  {data.map((entry, index) => {
                    const dailyTarget = MONTHLY_GOAL_USD / 30;
                    let fill = PERFORMANCE_COLORS.BAD;
                    if (entry.revenue >= dailyTarget) fill = PERFORMANCE_COLORS.GOOD;
                    else if (entry.revenue >= dailyTarget * 0.7) fill = PERFORMANCE_COLORS.OK;
                    
                    return <Cell key={`cell-${index}`} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {!loading && (
        <div className="mt-3 flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            <span className="h-3 w-3 rounded-[2px] bg-emerald-500" />
            Daily revenue ($)
          </span>
          <span className="text-[11px] font-extrabold text-slate-500">
            Best day: {stats.best} · Worst: {stats.worst}
          </span>
        </div>
      )}
      {loading && (
        <div className="mt-3 flex items-center justify-between gap-4">
          {shimmer("h-3 w-32")}
          {shimmer("h-3 w-48")}
        </div>
      )}
    </div>
  );
}

function PaymentPlanForecastPanel({ cards, loading }) {
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-1 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[13px] font-bold uppercase tracking-wide text-slate-900">
            Payment plan payments over time
          </div>
          <SectionBadge>Kajabi forecast</SectionBadge>
        </div>
        <p className="text-[11px] font-medium text-slate-500 leading-snug">
          Forecasted from active Kajabi payment plans using the next installment date for each plan. Expected cash.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {loading
          ? [1, 2, 3, 4].map((i) => <RevenueCardShimmer key={i} />)
          : cards.map((card) => (
              <article
                key={card.label}
                className="min-h-[90px] rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]"
              >
                <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
                  {card.label}
                </p>
                <div className={cx("mt-1.5 text-[20px] font-extrabold leading-none tracking-normal", card.valueClass)}>
                  {card.value}
                </div>
                <p className="mt-2 text-[10px] font-semibold text-slate-500">{card.note}</p>
              </article>
            ))}
      </div>
    </div>
  );
}

export default function Sales() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    revenueCards: [],
    riskCards: [],
    incomeMixRows: [],
    revenueMixData: [],
    offerRows: [],
    dailySales: [],
    dailyStats: { best: "—", worst: "—" },
    forecastCards: [],
    monthLabel: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function loadSalesData() {
      setLoading(true);
      setError(null);

      try {
        const now = new Date();
        const monthRange = DateHelpers.getMonthRangeInTimezone(now, DateHelpers.DEFAULT_TIMEZONE);
        if (!monthRange) throw new Error("Invalid month range");
        const start = monthRange.startDate.toISOString();
        const end = monthRange.endDate.toISOString();
        const monthLabel = DateHelpers.formatInTimeZone(monthRange.startDate, DateHelpers.DEFAULT_TIMEZONE, "MMMM yyyy");

        const lMonthToday = new Date(now);
        lMonthToday.setMonth(lMonthToday.getMonth() - 1);
        const lMonthRange = DateHelpers.getMonthRangeInTimezone(lMonthToday, DateHelpers.DEFAULT_TIMEZONE);
        const lStart = lMonthRange.startDate.toISOString();
        const lEnd = lMonthToday.toISOString(); 

        const [txResult, lastTxResult, offersResult, purchasesResult] = await Promise.all([
          supabase
            .from("kajabi_transactions")
            .select("action, state, amount_in_cents, created_at_kajabi, effective_date, payment_resolved_at, kajabi_offer_id, kajabi_purchase_id")
            .or(`and(created_at_kajabi.gte.${start},created_at_kajabi.lte.${end}),and(effective_date.gte.${start},effective_date.lte.${end}),and(payment_resolved_at.gte.${start},payment_resolved_at.lte.${end})`),
          supabase
            .from("kajabi_transactions")
            .select("action, state, amount_in_cents, payment_resolved_at, effective_date, created_at_kajabi")
            .or(`and(created_at_kajabi.gte.${lStart},created_at_kajabi.lte.${lEnd}),and(effective_date.gte.${lStart},effective_date.lte.${lEnd}),and(payment_resolved_at.gte.${lStart},payment_resolved_at.lte.${lEnd})`),
          supabase.from("offers").select("kajabi_id, name, price, is_subscription, installments"),
          supabase
            .from("kajabi_purchases")
            .select("kajabi_purchase_id, kajabi_offer_id, payment_type, created_at_kajabi, deactivated_at, multipay_payments_made"),
        ]);

        if (txResult.error) throw txResult.error;
        if (offersResult.error) throw offersResult.error;
        if (purchasesResult.error) throw purchasesResult.error;

        const offersById = {};
        for (const o of offersResult.data || []) offersById[String(o.kajabi_id)] = o;
        
        const purchasesById = {};
        for (const p of purchasesResult.data || []) purchasesById[String(p.kajabi_purchase_id)] = p;

        const grossUsd = sumGrossTransactions(txResult.data, start, end);
        const netUsd = sumNetTransactions(txResult.data, start, end);
        
        let refundUsd = 0;
        let failedCount = 0;
        let failedUsd = 0;
        const incomeMixTotals = { new: 0, old: 0, subscriptions: 0 };
        const offerSales = {}; 
        const dailyMap = {}; 

        for (const tx of txResult.data || []) {
          const actionRaw = tx.action ?? (tx.amount_in_cents >= 0 ? "charge" : "refund");
          const amount = txAmountUsd(tx);
          const isFailed = isFailedTransaction(tx);
          
          if (isFailed) {
            failedCount++;
            failedUsd += amount;
          }

          const resolvedInRange = tx.payment_resolved_at != null && tx.payment_resolved_at >= start && tx.payment_resolved_at <= end && (tx.effective_date == null || tx.effective_date < start || tx.effective_date > end);
          const inNetRange = (tx.effective_date >= start && tx.effective_date <= end) || resolvedInRange;
          
          if (inNetRange && !isFailed) {
            const action = resolvedInRange ? 'charge' : actionRaw;
            const isRefund = String(action).toLowerCase() === 'refund' || tx.amount_in_cents < 0;
            
            if (isRefund) {
              refundUsd += amount;
            } else {
              const p = tx.kajabi_purchase_id ? purchasesById[String(tx.kajabi_purchase_id)] : null;
              const oid = String(p?.kajabi_offer_id || tx.kajabi_offer_id || "unknown");
              if (!offerSales[oid]) offerSales[oid] = { gross: 0, count: 0 };
              offerSales[oid].gross += amount;
              offerSales[oid].count++;

              const offer = offersById[oid] || KAJABI_OFFER_FALLBACKS[oid];
              const paymentType = String(p?.payment_type || "").toLowerCase();
              const purchaseCreated = p?.created_at_kajabi ? new Date(p.created_at_kajabi) : null;
              const isSubscription = offer?.is_subscription || paymentType.includes("subscription");
              const isNew = !isSubscription && purchaseCreated && purchaseCreated >= monthRange.startDate && purchaseCreated <= monthRange.endDate;
              const bucket = isSubscription ? "subscriptions" : isNew ? "new" : "old";
              incomeMixTotals[bucket] += amount;
            }

            const targetDateStr = resolvedInRange ? tx.payment_resolved_at : (tx.effective_date || tx.created_at_kajabi);
            const dateStr = String(targetDateStr || "").slice(0, 10);
            if (dateStr) {
              dailyMap[dateStr] = (dailyMap[dateStr] || 0) + (isRefund ? 0 : amount);
            }
          }
        }

        const lastGrossUsd = sumGrossTransactions(lastTxResult.data, lStart, lEnd);
        const grossChangeValue = Math.round(pct(grossUsd - lastGrossUsd, lastGrossUsd));

        const dayOfMonth = now.getUTCDate();
        const daysInMonth = monthRange.endDate.getUTCDate();
        const forecastedNetUsd = (netUsd / dayOfMonth) * daysInMonth;

        let restOfMonth = 0, next7 = 0, next30 = 0;
        let restCount = 0, next7Count = 0, next30Count = 0;
        
        const activePlans = (purchasesResult.data || []).filter(p => 
          !p.deactivated_at && (p.payment_type === "multipay" || p.payment_type === "payment plan")
        );

        for (const p of activePlans) {
          const oid = String(p.kajabi_offer_id);
          const offer = offersById[oid] || KAJABI_OFFER_FALLBACKS[oid];
          const totalInstallments = Number(offer?.installments) || 0;
          if (totalInstallments <= 1) continue;

          const made = Number(p.multipay_payments_made) || 1;
          const remaining = totalInstallments - made;
          if (remaining <= 0) continue;

          const perInstallment = (Number(offer?.price) || 0) / (totalInstallments || 1);
          const created = new Date(p.created_at_kajabi);
          const payDay = created.getUTCDate();
          
          for (let i = 1; i <= remaining; i++) {
            const nextDate = new Date(now.getFullYear(), now.getMonth(), payDay);
            nextDate.setMonth(nextDate.getMonth() + i);
            const diffDays = Math.floor((nextDate - now) / (1000 * 60 * 60 * 24));

            if (nextDate.getMonth() === now.getMonth() && nextDate.getFullYear() === now.getFullYear() && nextDate > now) {
              restOfMonth += perInstallment; restCount++;
            }
            if (diffDays <= 7 && diffDays > 0) { next7 += perInstallment; next7Count++; }
            if (diffDays <= 30 && diffDays > 0) { next30 += perInstallment; next30Count++; }
          }
        }

        const expectedTarget = Math.round((MONTHLY_GOAL_USD * dayOfMonth) / daysInMonth);
        
        function getRevenueStatus(val, target) {
          const isGood = val >= target;
          const isOk = val >= target * 0.9;
          
          return {
            textClass: isGood ? PERFORMANCE_TEXT_CLASSES.GOOD : isOk ? PERFORMANCE_TEXT_CLASSES.OK : PERFORMANCE_TEXT_CLASSES.BAD,
            badgeClass: isGood ? PERFORMANCE_SOFT_BG_CLASSES.GOOD : isOk ? PERFORMANCE_SOFT_BG_CLASSES.OK : PERFORMANCE_SOFT_BG_CLASSES.BAD,
            label: isGood ? "On pace" : isOk ? "Near target" : "Behind pace"
          };
        }

        const netStatus = getRevenueStatus(netUsd, expectedTarget);
        const forecastStatus = getRevenueStatus(forecastedNetUsd, MONTHLY_GOAL_USD);
        const grossStatus = getRevenueStatus(grossUsd, expectedTarget);

        const revenueCards = [
          {
            label: "Gross revenue MTD",
            value: formatUsd(grossUsd),
            valueClass: grossStatus.textClass,
            badge: `${grossChangeValue >= 0 ? "▲" : "▼"} ${Math.abs(grossChangeValue)}% vs last month`,
            badgeClass: grossChangeValue >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600",
            note: `Day ${dayOfMonth}/${daysInMonth}`,
          },
          {
            label: "Net revenue MTD",
            value: formatUsd(netUsd),
            valueClass: netStatus.textClass,
            note: "After refunds & failed charges",
            progress: Math.min(100, Math.round(pct(netUsd, MONTHLY_GOAL_USD))),
            progressNote: `${Math.round(pct(netUsd, MONTHLY_GOAL_USD))}% of ${formatUsd(MONTHLY_GOAL_USD)} goal`,
            badge: netStatus.label,
            badgeClass: netStatus.badgeClass,
          },
          {
            label: "Forecasted month-end",
            value: formatUsd(forecastedNetUsd),
            valueClass: forecastStatus.textClass,
            note: "Based on current run-rate",
            badge: forecastStatus.label,
            badgeClass: forecastStatus.badgeClass,
          },
        ];

        const refundPctValue = Math.round(pct(refundUsd, grossUsd));
        const refundStatusClass = refundPctValue > 5 ? PERFORMANCE_TEXT_CLASSES.BAD : "text-slate-900";

        const riskCards = [
          {
            label: "Refunds MTD",
            value: formatUsd(refundUsd),
            valueClass: refundStatusClass,
            note: `${refundPctValue}% of gross`,
          },
          {
            label: "Outstanding A/R",
            value: formatUsd(failedUsd),
            valueClass: "text-amber-600",
            note: `${failedCount} payments currently failed`,
          },
          {
            label: "Failed attempts",
            value: String(failedCount),
            valueClass: "text-rose-600",
            note: "Includes disputes & declines",
          },
        ];

        const sortedOffers = Object.entries(offerSales)
          .map(([id, stats]) => ({
            id,
            name: offersById[id]?.name || KAJABI_OFFER_FALLBACKS[id]?.name || `Offer ${id}`,
            gross: stats.gross,
            count: stats.count
          }))
          .sort((a, b) => b.gross - a.gross);

        const revenueMixData = sortedOffers.slice(0, 5).map((o, i) => ({
          label: o.name,
          className: ["bg-emerald-600", "bg-emerald-500", "bg-emerald-400", "bg-emerald-300", "bg-slate-300"][i] || "bg-slate-200",
          width: pct(o.gross, grossUsd)
        }));

        const offerRows = sortedOffers.map(o => [
          o.name,
          `${formatUsd(o.gross)} · ${o.count} sale${o.count !== 1 ? 's' : ''}`
        ]);

        const last30Days = [];
        const dailyTarget = MONTHLY_GOAL_USD / 30;

        for (let i = 29; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const key = d.toISOString().slice(0, 10);
          const label = i % 7 === 0 ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : "";
          const rev = dailyMap[key] || 0;
          
          let barColor = PERFORMANCE_COLORS.BAD;
          if (rev >= dailyTarget) barColor = PERFORMANCE_COLORS.GOOD;
          else if (rev >= dailyTarget * 0.95) barColor = PERFORMANCE_COLORS.OK;

          last30Days.push({ 
            date: key, 
            label, 
            revenue: rev,
            fill: barColor
          });
        }

        const sortedDaily = [...last30Days].sort((a, b) => b.revenue - a.revenue);

        const forecastCards = [
          { label: "Rest of month", value: formatUsd(restOfMonth), valueClass: "text-emerald-600", note: `${restCount} expected payments` },
          { label: "Next 7 days", value: formatUsd(next7), valueClass: "text-blue-600", note: `${next7Count} expected payments` },
          { label: "Next 30 days", value: formatUsd(next30), valueClass: "text-indigo-600", note: `${next30Count} expected payments` },
        ];

        if (!cancelled) {
          setData({
            revenueCards,
            riskCards,
            incomeMixRows: INCOME_SOURCE_DEFS.map(def => ({ ...def, valueCents: incomeMixTotals[def.key] * 100 })),
            revenueMixData,
            offerRows,
            dailySales: last30Days,
            dailyStats: {
              best: `${last30Days.find(d => d.revenue === sortedDaily[0].revenue)?.date || "—"} (${formatUsd(sortedDaily[0]?.revenue || 0)})`,
              worst: `${last30Days.find(d => d.revenue === sortedDaily[sortedDaily.length-1].revenue)?.date || "—"} (${formatUsd(sortedDaily[sortedDaily.length-1]?.revenue || 0)})`
            },
            forecastCards,
            monthLabel,
          });
        }

      } catch (err) {
        if (!cancelled) setError(err?.message || "Failed to load sales data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSalesData();
    return () => { cancelled = true; };
  }, []);

  function formatPct(v) {
    return `${v}%`;
  }

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-[13px] font-semibold text-red-700">
          {error}
        </div>
      )}
      <div className="grid grid-cols-8 gap-2">
        <div className="col-span-2 flex flex-col gap-3">
          <RevenueSnapshotPanel cards={data.revenueCards} loading={loading} />
          <RefundsPanel cards={data.riskCards} loading={loading} />
        </div>
        <div className="col-span-4 flex flex-col gap-3">
          <IncomeMixThisMonth 
            rows={data.incomeMixRows} 
            monthLabel={data.monthLabel} 
            loading={loading} 
            error={error} 
          />
          <RevenueMixPanel data={data.revenueMixData} rows={data.offerRows} loading={loading} />
          <DailySalesTrend data={data.dailySales} stats={data.dailyStats} loading={loading} />
        </div>
        <div className="col-span-2 flex flex-col gap-3">
          <PaymentPlanForecastPanel cards={data.forecastCards} loading={loading} />
        </div>
      </div>
    </div>
  );
}
