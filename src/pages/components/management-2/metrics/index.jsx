import { useState } from "react";

const METRIC_CARDS = [
  {
    label: "Net revenue today",
    value: "$1,248",
    valueClass: "text-emerald-600",
    badge: "▲ 18% vs yesterday",
    badgeClass: "bg-emerald-100 text-emerald-700",
    note: "Goal-pace: $1,820/day · 68% of pace",
  },
  {
    label: "Cash collected today",
    value: "$890",
    valueClass: "text-blue-600",
    badge: "▲ 12% vs 7-day avg",
    badgeClass: "bg-emerald-100 text-emerald-700",
    note: "PIF + 1st installments",
  },
  {
    label: "New leads today",
    value: "42",
    valueClass: "text-violet-600",
    badge: "▼ 8% vs yesterday",
    badgeClass: "bg-rose-100 text-rose-600",
    note: "28 organic · 14 paid",
  },
  {
    label: "Booked calls today",
    value: "11",
    valueClass: "text-amber-600",
    badge: "▲ 3 from yesterday",
    badgeClass: "bg-emerald-100 text-emerald-700",
    note: "8 confirmed · 3 pending",
  },
];

const ALERTS = [
  {
    tone: "danger",
    title: "Show-up rate dropped to 29.4% this week (vs 57.1% last week)",
    body: 'Likely cause: confirmation calls slipping. Setter "Jenn" pickup-rate at 25%. Recommend a 1:1.',
    dotClass: "bg-rose-500 shadow-rose-300",
    panelClass: "border-rose-400 bg-rose-100/80 text-slate-900",
  },
  {
    tone: "warning",
    title: "Behind monthly pace — $4,537 of $55,000 (8%) on day 6/31",
    body: "Need $1,634/day to catch up. Push organic content + reactivate cold lead list.",
    dotClass: "bg-amber-400 shadow-amber-300",
    panelClass: "border-amber-400 bg-amber-100/85 text-slate-900",
  },
  {
    tone: "success",
    title: "AOV climbing — Ana closed $975 (above $508 average)",
    body: "Replicate: review Ana's call recordings → share script with team.",
    dotClass: "bg-emerald-400 shadow-emerald-300",
    panelClass: "border-emerald-400 bg-emerald-100/85 text-slate-900",
  },
];

const FUNNEL_ROWS = [
  {
    label: "Website Visitors",
    value: "2,450",
    percent: "100%",
    width: 100,
    colorClass: "bg-blue-900",
  },
  {
    label: "VSL Watched",
    value: "1,520",
    percent: "62%",
    width: 62,
    colorClass: "bg-blue-600",
  },
  {
    label: "Opt-ins",
    value: "832",
    percent: "34%",
    width: 34,
    colorClass: "bg-blue-500",
  },
  {
    label: "Calls Booked",
    value: "98",
    percent: "11.8%",
    width: 11.8,
    colorClass: "bg-blue-400",
  },
  {
    label: "Show-ups",
    value: "56",
    percent: "57%",
    width: 5.7,
    colorClass: "bg-amber-500",
  },
  {
    label: "Closed (Sale)",
    value: "7",
    percent: "12.5%",
    width: 1.25,
    colorClass: "bg-emerald-600",
  },
];

const COHORT_CARDS = [
  {
    label: "Avg LTV (90d)",
    value: "$612",
    valueClass: "text-blue-600",
    note: "Up from $548 last quarter",
  },
  {
    label: "Refund / chargeback %",
    value: "3.4%",
    valueClass: "text-red-600",
    note: "Industry benchmark: <5%",
  },
  {
    label: "Retention (M2 active)",
    value: "71%",
    valueClass: "text-emerald-600",
    note: "Students still in program after 60 days",
  },
];

const SPEED_CARDS = [
  {
    label: "Avg time to 1st call",
    value: "14 min",
    valueClass: "text-amber-600",
    note: "Target: <5 min · ⚠ slow",
  },
  {
    label: "Leads not yet contacted",
    value: "23",
    valueClass: "text-red-600",
    note: "Older than 1 hour — needs action",
  },
  {
    label: "Follow-ups due today",
    value: "17",
    valueClass: "text-blue-600",
    note: "Across all setters",
  },
];

const HEATMAP_DAYS = [
  {
    day: "Mon",
    cells: [ 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 5, 4, 3, 3, 4, 5, 4, 3, 2, 1, 0, 0 ],
  },
  {
    day: "Tue",
    cells: [ 0, 0, 0, 0, 0, 1, 1, 2, 3, 4, 5, 5, 5, 4, 3, 3, 4, 5, 4, 3, 2, 1, 0, 0 ],
  },
  {
    day: "Wed",
    cells: [ 0, 0, 0, 0, 0, 0, 0, 2, 3, 4, 5, 5, 5, 4, 3, 3, 4, 5, 4, 3, 2, 1, 0, 0 ],
  },
  {
    day: "Thu",
    cells: [ 0, 0, 0, 0, 0, 1, 1, 2, 3, 4, 5, 5, 4, 4, 3, 3, 4, 5, 4, 3, 2, 1, 0, 0 ],
  },
  {
    day: "Fri",
    cells: [ 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 5, 3, 3, 3, 4, 4, 3, 2, 2, 1, 0, 0 ],
  },
  {
    day: "Sat",
    cells: [ 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 3, 4, 3, 2, 2, 3, 3, 2, 1, 1, 0, 0, 0 ],
  },
  {
    day: "Sun",
    cells: [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 3, 3, 3, 3, 2, 2, 1, 0, 0, 0, 0 ],
  },
];

const HEATMAP_COLORS = {
  0: "bg-slate-100",
  1: "bg-blue-100",
  2: "bg-blue-200",
  3: "bg-blue-400",
  4: "bg-blue-600",
  5: "bg-blue-900",
};

const HEATMAP_LEVEL_LABELS = {
  0: "Low",
  1: "Low",
  2: "Med",
  3: "High",
  4: "High",
  5: "Peak",
};

function formatHour ( hour ) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const value = hour % 12 || 12;
  return `${value}:00 ${suffix}`;
}

function heatmapCellInfo ( day, hour, level ) {
  const conversionRate = ( 0.8 + level * 2.45 + ( hour % 3 ) * 0.18 ).toFixed( 1 );
  const bookedCalls = Math.max( 0, Math.round( level * 1.8 + ( hour >= 9 && hour <= 17 ? 1 : 0 ) ) );

  return {
    day,
    hourLabel: formatHour( hour ),
    levelLabel: HEATMAP_LEVEL_LABELS[ level ] || "Low",
    conversionRate,
    bookedCalls,
  };
}

function cx ( ...classes ) {
  return classes.filter( Boolean ).join( " " );
}

function SectionBadge ( { children } ) {
  return (
    <span className="inline-flex h-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 shadow-sm">
      {children}
    </span>
  );
}

function DashboardPanel ( { children, className = "" } ) {
  return (
    <section
      className={cx(
        "rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.04)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

function MetricCard ( { metric, compact = false } ) {
  return (
    <article
      className={cx(
        "rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)]",
        compact ? "min-h-[82px] px-2.5 py-2.5" : "min-h-[132px] px-4 py-4 sm:px-5",
      )}
    >
      <p className={cx( "font-semibold uppercase tracking-[0.08em] text-slate-500", compact ? "text-[9px]" : "text-[11px]" )}>
        {metric.label}
      </p>
      <div className={cx( compact ? "mt-1.5 text-[22px]" : "mt-3 text-[30px]", "font-semibold leading-none tracking-normal", metric.valueClass )}>
        {metric.value}
      </div>
      <div className={compact ? "mt-1.5" : "mt-3"}>
        <span className={cx( "inline-flex rounded-md px-2 py-1 font-semibold leading-none", compact ? "text-[9px]" : "text-[11px]", metric.badgeClass )}>
          {metric.badge}
        </span>
      </div>
      <p className={cx( "mt-1.5 font-semibold text-slate-500", compact ? "text-[10px]" : "text-[12px]" )}>{metric.note}</p>
    </article>
  );
}

function AlertRow ( { alert } ) {
  return (
    <article
      className={cx(
        "flex min-h-[62px] items-center gap-4 rounded-xl border px-4 py-3 shadow-sm",
        alert.panelClass,
      )}
    >
      <span
        className={cx(
          "h-4 w-4 shrink-0 rounded-full shadow-[0_0_10px_currentColor]",
          alert.dotClass,
        )}
        aria-hidden
      />
      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold leading-snug text-slate-950">
          {alert.title}
        </h3>
        <p className="mt-0.5 text-[12px] font-medium leading-snug text-slate-600">
          {alert.body}
        </p>
      </div>
    </article>
  );
}

function FunnelRow ( { row, onHover, onLeave } ) {
  return (
    <div className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-2">
      <div className="text-[11px] font-medium text-slate-700 truncate">{row.label}</div>
      <div
        className="relative h-[22px] cursor-pointer overflow-hidden rounded-md bg-slate-100 transition-[box-shadow,filter] hover:shadow-[inset_0_0_0_1px_rgba(59,130,246,0.22)] hover:brightness-[0.99]"
        onMouseEnter={( event ) => onHover( row, event.currentTarget )}
        onMouseMove={( event ) => onHover( row, event.currentTarget )}
        onMouseLeave={onLeave}
      >
        <div
          className={cx( "flex h-full min-w-[12px] items-center justify-end rounded-md pr-1.5", row.colorClass )}
          style={{ width: `${Math.max( row.width, 4 )}%` }}
        >
          <span className="text-[9px] font-semibold leading-none text-white whitespace-nowrap">
            {row.percent}
          </span>
        </div>
      </div>
    </div>
  );
}

function FunnelSection () {
  const [ hoveredRow, setHoveredRow ] = useState( null );

  const handleRowHover = ( row, target ) => {
    const panel = target.closest( "[data-funnel-panel]" );
    const panelRect = panel?.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    setHoveredRow( {
      row,
      x: panelRect ? targetRect.left - panelRect.left + targetRect.width / 2 : 0,
      y: panelRect ? targetRect.top - panelRect.top : 0,
    } );
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col items-start gap-2">
        <div className="min-w-0">
          <h2 className="max-w-full text-[18px] font-semibold leading-tight tracking-normal text-slate-950">
            Funnel Conversion Rates — Live
          </h2>
        </div>
        <div className="flex w-full items-center justify-between gap-2">
          <SectionBadge>Visitor → Customer</SectionBadge>
          <span className="shrink-0 text-[11px] font-semibold text-slate-900">
            0.29%
          </span>
        </div>
      </div>

      <div className="relative mt-3 rounded-lg border border-slate-200 bg-white p-3" data-funnel-panel>
        <div className="space-y-1.5">
          {FUNNEL_ROWS.map( ( row ) => (
            <FunnelRow
              key={row.label}
              row={row}
              onHover={handleRowHover}
              onLeave={() => setHoveredRow( null )}
            />
          ) )}
        </div>

        {hoveredRow ? (
          <div
            className="pointer-events-none absolute z-20 w-[166px] rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left shadow-[0_10px_24px_rgba(15,23,42,0.16)]"
            style={{
              left: Math.min( Math.max( hoveredRow.x, 88 ), 184 ),
              top: hoveredRow.y < 86 ? hoveredRow.y + 28 : hoveredRow.y - 86,
              transform: "translateX(-50%)",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[11px] font-semibold text-slate-950">
                {hoveredRow.row.label}
              </p>
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-blue-700">
                {hoveredRow.row.percent}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                  Count
                </p>
                <p className="mt-0.5 text-[12px] font-semibold leading-none text-slate-900">
                  {hoveredRow.row.value}
                </p>
              </div>
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                  Share
                </p>
                <p className="mt-0.5 text-[12px] font-semibold leading-none text-slate-900">
                  {hoveredRow.row.percent}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-3 flex flex-col gap-2">
          <span className="inline-flex max-w-full rounded-md border border-violet-300 bg-violet-50 px-2 py-1 text-[10px] font-semibold leading-snug text-violet-600">
            ⚠ Biggest leak: Opt-in → Booked (only 11.8%)
          </span>
        </div>
      </div>
    </section>
  );
}

function SmallMetricCard ( { card, compact = false } ) {
  return (
    <article
      className={cx(
        "rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)]",
        compact ? "min-h-[76px] px-2.5 py-2.5" : "min-h-[106px] px-4 py-4",
      )}
    >
      <p className={cx( "font-semibold uppercase tracking-[0.08em] text-slate-500", compact ? "text-[9px]" : "text-[10px]" )}>
        {card.label}
      </p>
      <div className={cx( compact ? "mt-2 text-[20px]" : "mt-4 text-[25px]", "font-semibold leading-none tracking-normal", card.valueClass )}>
        {card.value}
      </div>
      <p className={cx( compact ? "mt-1.5 text-[9px]" : "mt-3 text-[11px]", "font-medium text-slate-500" )}>{card.note}</p>
    </article>
  );
}

function CardGridSection ( { title, badge, cards, compact = false } ) {
  return (
    <section className={compact ? "min-w-0" : ""}>
      <div className={cx(
        compact ? "flex flex-col items-start gap-2" : "flex items-center justify-between gap-4",
      )}>
        <h2 className={cx( compact ? "text-[17px]" : "text-[24px]", "font-semibold leading-tight tracking-normal text-slate-950" )}>
          {title}
        </h2>
        <SectionBadge>{badge}</SectionBadge>
      </div>

      <div className={cx( "grid grid-cols-1", compact ? "mt-2 gap-2" : "mt-4 gap-4 md:grid-cols-3" )}>
        {cards.map( ( card ) => (
          <SmallMetricCard key={card.label} card={card} compact={compact} />
        ) )}
      </div>
    </section>
  );
}

function NorthStarSection () {
  return (
    <DashboardPanel>
      <div className="flex flex-col items-start gap-2">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold leading-tight tracking-normal text-slate-950">
            North-Star Metrics
          </h1>
          {/* <p className="mt-2 text-[10px] font-semibold italic leading-snug text-slate-500">
            The 4 numbers I (as owner) want to see the second I open the CRM. They tell me if we're on track to hit $55K monthly goal.
          </p> */}
        </div>
        <div className="flex w-full ">
          <SectionBadge>Live · Today · May 6</SectionBadge>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {METRIC_CARDS.map( ( metric ) => (
          <MetricCard key={metric.label} metric={metric} compact />
        ) )}
      </div>
    </DashboardPanel>
  );
}

function HealthAlertsSection () {
  return (
    <DashboardPanel className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[24px] font-semibold leading-tight tracking-normal text-slate-950">
            Health Alerts &amp; Anomalies
          </h2>
          <p className="mt-4 text-[13px] font-medium italic text-slate-500">
            Surface what's broken, what's winning, what needs attention NOW.
          </p>
        </div>
        <SectionBadge>Auto-detected</SectionBadge>
      </div>

      <div className="mt-4 space-y-3">
        {ALERTS.map( ( alert ) => (
          <AlertRow key={alert.title} alert={alert} />
        ) )}
      </div>
    </DashboardPanel>
  );
}

function ValueVelocityPanel () {
  return (
    <DashboardPanel className="space-y-4">
      <CardGridSection
        title="Customer Lifetime Value & Cohorts"
        badge="Revenue Quality"
        cards={COHORT_CARDS}
        compact
      />

      <CardGridSection
        title="Lead Velocity & Speed-to-Lead"
        badge="Operational"
        cards={SPEED_CARDS}
        compact
      />
    </DashboardPanel>
  );
}

function HeatmapCell ( { level, day, hour, isActive, onHover, onLeave } ) {
  const info = heatmapCellInfo( day, hour, level );

  return (
    <button
      type="button"
      className={cx(
        "block h-[14px] w-[30px] shrink-0 appearance-none rounded-none border border-white p-0 m-0 leading-none",
        "focus-visible:outline-none",
        "cursor-pointer transition-[box-shadow,filter] duration-100",
        isActive
          ? "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.95)] brightness-105"
          : "hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.95)] hover:brightness-105",
        HEATMAP_COLORS[ level ] || HEATMAP_COLORS[ 0 ],
      )}
      onMouseEnter={( event ) => onHover( info, event.currentTarget )}
      onFocus={( event ) => onHover( info, event.currentTarget )}
      onMouseLeave={onLeave}
      onBlur={onLeave}
      aria-label={`${info.day} ${info.hourLabel}: ${info.levelLabel} activity, ${info.conversionRate}% conversion, ${info.bookedCalls} booked calls`}
    />
  );
}

function ActivityHeatmapSection () {
  const [ hoveredCell, setHoveredCell ] = useState( null );

  const handleCellHover = ( info, target ) => {
    const container = target.closest( "[data-heatmap-panel]" );
    const panelRect = container?.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    setHoveredCell( {
      ...info,
      x: panelRect ? targetRect.left - panelRect.left + targetRect.width / 2 : 0,
      y: panelRect ? targetRect.top - panelRect.top : 0,
    } );
  };

  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[24px] font-semibold leading-tight tracking-normal text-slate-950">
          Activity Heatmap — Conversion by hour
        </h2>
        <SectionBadge>Last 7 days</SectionBadge>
      </div>

      <div
        className="relative mt-4 rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]"
        data-heatmap-panel
      >
        <p className="text-[11px] font-medium italic text-slate-500">
          Helps schedule setter shifts &amp; ad campaigns at peak hours.
        </p>

        <div className="mt-3 overflow-x-auto pb-1">
          <div className="min-w-[768px] space-y-0">
            {HEATMAP_DAYS.map( ( row ) => (
              <div key={row.day} className="grid grid-cols-[48px_1fr] items-center gap-0">
                <div className="text-[11px] font-medium text-slate-500">{row.day}</div>
                <div className="grid grid-cols-[repeat(24,30px)] gap-0">
                  {row.cells.map( ( level, hour ) => (
                    <HeatmapCell
                      key={`${row.day}-${hour}`}
                      level={level}
                      day={row.day}
                      hour={hour}
                      isActive={hoveredCell?.day === row.day && hoveredCell?.hourLabel === formatHour( hour )}
                      onHover={handleCellHover}
                      onLeave={() => setHoveredCell( null )}
                    />
                  ) )}
                </div>
              </div>
            ) )}
          </div>
        </div>

        {hoveredCell ? (
          <div
            className="pointer-events-none absolute z-20 w-[176px] rounded-md border border-slate-200 bg-white px-2.5 py-2 text-left shadow-[0_8px_22px_rgba(15,23,42,0.14)]"
            style={{
              left: `min(max(${hoveredCell.x}px, 96px), calc(100% - 96px))`,
              top: `${hoveredCell.y - 78}px`,
              transform: "translateX(-50%)",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-slate-950">
                {hoveredCell.day} · {hoveredCell.hourLabel}
              </p>
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none text-blue-700">
                {hoveredCell.levelLabel}
              </span>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Conversion
                </p>
                <p className="mt-0.5 text-[13px] font-semibold leading-none text-slate-900">
                  {hoveredCell.conversionRate}%
                </p>
              </div>
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Booked
                </p>
                <p className="mt-0.5 text-[13px] font-semibold leading-none text-slate-900">
                  {hoveredCell.bookedCalls} calls
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            {[
              [ "Low", 0 ],
              [ "Med", 2 ],
              [ "High", 3 ],
              [ "Peak", 5 ],
            ].map( ( [ label, level ] ) => (
              <span key={label} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                <span className={cx( "h-2.5 w-2.5 rounded-[2px]", HEATMAP_COLORS[ level ] )} />
                {label}
              </span>
            ) )}
          </div>
          <p className="text-[11px] font-medium text-slate-500">
            Insight: Tue/Thu 9-11 AM = highest conversion hours.
          </p>
        </div>
      </div>
    </section>
  );
}

export default function Metrics () {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-8 xl:items-start">
      <div className="min-w-0 xl:col-span-2">
        <NorthStarSection />
        <div className="mt-4">
          <FunnelSection />
        </div>
      </div>

      <div className="min-w-0 space-y-4 xl:col-span-4">
        <HealthAlertsSection />

        <DashboardPanel className="p-4">
          <ActivityHeatmapSection />
        </DashboardPanel>
      </div>

      <div className="min-w-0 xl:col-span-2">
        <ValueVelocityPanel />
      </div>
    </div>
  );
}
