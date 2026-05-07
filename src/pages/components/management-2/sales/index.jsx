import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const REVENUE_CARDS = [
  {
    label: "Gross revenue MTD",
    value: "$3,341",
    valueClass: "text-emerald-600",
    badge: "▼ 22% vs last month",
    badgeClass: "bg-red-100 text-red-600",
    note: "Day 6/31",
  },
  {
    label: "Net revenue MTD",
    value: "$4,537",
    valueClass: "text-emerald-600",
    note: "After refunds & fees",
    progress: 8,
    progressNote: "8% of $55K goal",
  },
  {
    label: "Forecasted month-end",
    value: "$23,440",
    valueClass: "text-amber-600",
    note: "Based on current run-rate",
    badge: "▼ $31.5K below goal",
    badgeClass: "bg-red-100 text-red-600",
  },
];

const DAILY_SALES = [
  { date: "Apr 7", label: "Apr 7", revenue: 820 },
  { date: "Apr 8", label: "", revenue: 1120 },
  { date: "Apr 9", label: "", revenue: 120 },
  { date: "Apr 10", label: "", revenue: 1420 },
  { date: "Apr 11", label: "", revenue: 940 },
  { date: "Apr 12", label: "", revenue: 1340 },
  { date: "Apr 13", label: "", revenue: 1020 },
  { date: "Apr 14", label: "Apr 14", revenue: 1620 },
  { date: "Apr 15", label: "", revenue: 1220 },
  { date: "Apr 16", label: "", revenue: 1850 },
  { date: "Apr 17", label: "", revenue: 1120 },
  { date: "Apr 18", label: "", revenue: 820 },
  { date: "Apr 19", label: "", revenue: 1510 },
  { date: "Apr 20", label: "", revenue: 1720 },
  { date: "Apr 21", label: "Apr 21", revenue: 1240 },
  { date: "Apr 22", label: "", revenue: 2140 },
  { date: "Apr 23", label: "", revenue: 1420 },
  { date: "Apr 24", label: "", revenue: 1020 },
  { date: "Apr 25", label: "", revenue: 1630 },
  { date: "Apr 26", label: "", revenue: 1320 },
  { date: "Apr 27", label: "", revenue: 940 },
  { date: "Apr 28", label: "Apr 28", revenue: 1120 },
  { date: "Apr 29", label: "", revenue: 1420 },
  { date: "Apr 30", label: "", revenue: 1240 },
  { date: "May 1", label: "", revenue: 820 },
  { date: "May 2", label: "", revenue: 1020 },
  { date: "May 3", label: "", revenue: 1510 },
  { date: "May 4", label: "", revenue: 1320 },
  { date: "May 5", label: "", revenue: 1120 },
  { date: "May 6", label: "May 6", revenue: 1460 },
];

const REVENUE_MIX = [
  { label: "Premium 48%", className: "bg-blue-900", width: 48 },
  { label: "Standard 31%", className: "bg-blue-600", width: 31 },
  { label: "Starter 14%", className: "bg-blue-300", width: 14 },
  { label: "Other", className: "bg-slate-400", width: 7 },
];

const OFFER_ROWS = [
  ["Premium Coaching ($1,997)", "$1,604 · 1 sale"],
  ["Standard Program ($997)", "$1,037 · 2 sales"],
  ["Starter Course ($497)", "$469 · 1 sale"],
  ["Up-sells / Add-ons", "$231"],
];

const PLAN_ROWS = [
  {
    icon: "▣",
    iconClass: "text-emerald-600",
    label: "Paid in Full (PIF)",
    value: "$2,487 · 64%",
    valueClass: "text-slate-950",
  },
  {
    icon: "▦",
    iconClass: "text-blue-500",
    label: "2-Pay Plan",
    value: "$895 · 23%",
    valueClass: "text-slate-950",
  },
  {
    icon: "▥",
    iconClass: "text-indigo-400",
    label: "3-Pay Plan",
    value: "$510 · 13%",
    valueClass: "text-slate-950",
  },
  {
    icon: "⚠",
    iconClass: "text-slate-500",
    label: "Failed/declined payments",
    value: "3 ($245)",
    valueClass: "text-red-600",
  },
];

const RISK_CARDS = [
  {
    label: "Refunds MTD",
    value: "$197",
    valueClass: "text-red-600",
    note: "1 refund · 2.1% of gross",
  },
  {
    label: "Chargebacks",
    value: "0",
    valueClass: "text-red-600",
    note: "All-clear · risk: low",
  },
  {
    label: "Outstanding A/R",
    value: "$645",
    valueClass: "text-amber-600",
    note: "3 customers behind on installments",
  },
  {
    label: "Failed payments",
    value: "3",
    valueClass: "text-red-600",
    note: "Auto-retry 24h · escalate after 3",
  },
];

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function SectionBadge({ children }) {
  return (
    <span className="inline-flex h-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-500 shadow-sm">
      {children}
    </span>
  );
}

function RevenueCard({ card }) {
  return (
    <article className="min-h-[132px] rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
        {card.label}
      </p>
      <div className={cx("mt-3 text-[28px] font-extrabold leading-none tracking-normal", card.valueClass)}>
        {card.value}
      </div>
      <p className="mt-3 text-[11px] font-semibold text-slate-500">{card.note}</p>
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

function RevenueMixPanel() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <h3 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
        Revenue Mix (MTD)
      </h3>

      <div className="mt-4 flex h-[30px] overflow-hidden rounded-md">
        {REVENUE_MIX.map((segment) => (
          <div
            key={segment.label}
            className={cx("flex h-full items-center justify-center text-[10px] font-extrabold text-white", segment.className)}
            style={{ width: `${segment.width}%` }}
          >
            {segment.label}
          </div>
        ))}
      </div>

      <div className="mt-5 divide-y divide-slate-100">
        {OFFER_ROWS.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 py-2.5">
            <span className="text-[13px] font-semibold text-slate-700">{label}</span>
            <span className="text-[13px] font-extrabold text-slate-950">{value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function PaymentPlanPanel() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <h3 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
        Payment Plan Breakdown
      </h3>

      <div className="mt-4 divide-y divide-slate-100">
        {PLAN_ROWS.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className={cx("text-[12px] leading-none", row.iconClass)}>{row.icon}</span>
              <span className="truncate text-[13px] font-semibold text-slate-700">{row.label}</span>
            </div>
            <span className={cx("shrink-0 text-[13px] font-extrabold", row.valueClass)}>
              {row.value}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-md bg-slate-50 px-3 py-3 text-[12px] font-semibold text-slate-500">
        <span className="font-extrabold text-slate-700">Insight:</span> PIF rate of 64% is healthy. Push PIF bonus during weak weeks.
      </div>
    </section>
  );
}

function formatUsd(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
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

function DailySalesTrend() {
  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[24px] font-extrabold leading-tight tracking-normal text-slate-950">
          Daily Sales Trend
        </h2>
        <SectionBadge>Last 30 days</SectionBadge>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
        <div className="h-[164px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={DAILY_SALES}
              margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
              barCategoryGap="18%"
            >
              <XAxis
                dataKey="label"
                axisLine={{ stroke: "#E2E8F0" }}
                tickLine={false}
                interval={0}
                tick={{
                  fill: "#94A3B8",
                  fontSize: 10,
                  fontWeight: 700,
                }}
                height={22}
              />
              <YAxis hide domain={[0, 2200]} />
              <Tooltip
                content={<DailySalesTooltip />}
                cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
                wrapperStyle={{ outline: "none" }}
              />
              <Bar
                dataKey="revenue"
                fill="#22C55E"
                radius={[3, 3, 0, 0]}
                maxBarSize={38}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            <span className="h-3 w-3 rounded-[2px] bg-emerald-500" />
            Daily revenue ($)
          </span>
          <span className="text-[11px] font-extrabold text-slate-500">
            Best day: Apr 22 ($2,140) · Worst: Apr 9 ($120)
          </span>
        </div>
      </div>
    </section>
  );
}

function RiskCard({ card }) {
  return (
    <article className="min-h-[74px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <p className="text-[9px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
        {card.label}
      </p>
      <div className={cx("mt-1.5 text-[20px] font-extrabold leading-none tracking-normal", card.valueClass)}>
        {card.value}
      </div>
      <p className="mt-1.5 text-[9px] font-semibold leading-snug text-slate-500">{card.note}</p>
    </article>
  );
}

function TopSalesSnapshot() {
  return (
    <section className="grid grid-cols-1 items-stretch gap-5 2xl:grid-cols-[minmax(0,1fr)_520px]">
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-[24px] font-extrabold leading-tight tracking-normal text-slate-950">
            Revenue Snapshot
          </h1>
          <SectionBadge>MTD · Goal $55,000</SectionBadge>
        </div>

        <div className="mt-5 grid flex-1 grid-cols-1 gap-4 md:grid-cols-3">
          {REVENUE_CARDS.map((card) => (
            <RevenueCard key={card.label} card={card} />
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-col">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-[24px] font-extrabold leading-tight tracking-normal text-slate-950">
            Refunds, Chargebacks &amp; Outstanding
          </h2>
          <SectionBadge>Risk</SectionBadge>
        </div>

        <div className="mt-5 grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
          {RISK_CARDS.map((card) => (
            <RiskCard key={card.label} card={card} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Sales() {
  return (
    <div className="space-y-8">
      <TopSalesSnapshot />

      <section>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[24px] font-extrabold leading-tight tracking-normal text-slate-950">
              Sales by Product / Offer
            </h2>
            <p className="mt-4 text-[12px] font-semibold italic text-slate-500">
              Helps decide which offer to push, which to retire, and where to upsell.
            </p>
          </div>
          <SectionBadge>What's Selling</SectionBadge>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-5 xl:grid-cols-2">
          <RevenueMixPanel />
          <PaymentPlanPanel />
        </div>
      </section>

      <DailySalesTrend />
    </div>
  );
}
