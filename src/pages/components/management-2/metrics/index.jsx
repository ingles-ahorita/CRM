import { useEffect, useState } from "react";
import { useRevenueGoal } from "../../../../hooks/useRevenueGoal";
import { supabase } from "../../../../lib/supabaseClient";
import { runAnalysis } from "../../../../pages/reactionTime";
import * as DateHelpers from "../../../../utils/dateHelpers";
import {
  getAovClass,
  getAovBgClass,
  getConversionBgClass,
  getConversionClass,
  getShowUpBgClass,
  getShowUpClass,
  getSuccessClass,
} from "../../../../utils/performanceBenchmarks";

const DAY_MS = 24 * 60 * 60 * 1000;
const ADS_VSL_PATH = "/ads-new-masterclass-job";
const ADS_OPT_IN_PATH = "/ads-opt-in-masterclass";
const ORGANIC_VSL_PATH = "/masterclass-job";
const ORGANIC_OPT_IN_PATHS = "/pro,/";
const SUCCESS_STATES = new Set( [
  "paid",
  "successful",
  "success",
  "complete",
  "completed",
  "succeeded",
] );

const EMPTY_METRICS = {
  todayLabel: "",
  metricCards: [],
  alerts: [],
  funnel: {
    rows: [],
    visitorToCustomer: "—",
    biggestLeak: "Biggest leak: loading",
    gaAvailable: true,
  },
  cohortCards: [],
  speedCards: [],
  heatmapDays: [],
};

const HEATMAP_COLORS = {
  0: "bg-slate-100",
  1: "bg-rose-200",
  2: "bg-amber-300",
  3: "bg-emerald-400",
  4: "bg-emerald-600",
  5: "bg-emerald-900",
};

const HEATMAP_LEVEL_LABELS = {
  0: "Low",
  1: "Low",
  2: "Med",
  3: "High",
  4: "Peak",
};

const METRIC_RANGE_ITEMS = [
  { id: "today", label: "Today" },
  { id: "last7", label: "Last 7 days" },
  { id: "mtd", label: "MTD" },
  { id: "lastWeek", label: "Last wk" },
  { id: "lastMonth", label: "Last mo" },
];

const COHORT_RANGE_ITEMS = [
  { id: "last30", label: "Last 30 days" },
  { id: "last90", label: "Last 90 days" },
  { id: "mtd", label: "MTD" },
  { id: "lastMonth", label: "Last mo" },
];

const HEATMAP_RANGE_ITEMS = [
  { id: "last7", label: "Last 7 days" },
  { id: "last14", label: "Last 14 days" },
  { id: "last30", label: "Last 30 days" },
];

function startOfUTCDate ( date ) {
  return new Date( Date.UTC( date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0 ) );
}

function endOfUTCDate ( date ) {
  return new Date( Date.UTC( date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999 ) );
}

function addDays ( date, days ) {
  return new Date( date.getTime() + days * DAY_MS );
}

function isoDay ( date ) {
  return date.toISOString().slice( 0, 10 );
}

function getRangeBounds ( range ) {
  const now = new Date();
  const todayStart = startOfUTCDate( now );
  const todayEnd = endOfUTCDate( now );

  if ( range === "last14" ) {
    return { start: addDays( todayStart, -13 ), end: todayEnd };
  }
  if ( range === "last30" ) {
    return { start: addDays( todayStart, -29 ), end: todayEnd };
  }
  if ( range === "last90" ) {
    return { start: addDays( todayStart, -89 ), end: todayEnd };
  }
  if ( range === "last7" ) {
    return { start: addDays( todayStart, -6 ), end: todayEnd };
  }
  if ( range === "lastWeek" ) {
    const { weekStart, weekEnd } = DateHelpers.getWeekBoundsForOffset( 1 );
    return { start: weekStart, end: weekEnd };
  }
  if ( range === "lastMonth" ) {
    const previousMonth = new Date( Date.UTC( now.getUTCFullYear(), now.getUTCMonth() - 1, 15 ) );
    const monthRange = DateHelpers.getMonthRangeInTimezone( previousMonth, DateHelpers.DEFAULT_TIMEZONE );
    return { start: monthRange.startDate, end: monthRange.endDate };
  }
  if ( range === "mtd" ) {
    const monthRange = DateHelpers.getMonthRangeInTimezone( now, DateHelpers.DEFAULT_TIMEZONE );
    return { start: monthRange.startDate, end: now };
  }
  return { start: todayStart, end: todayEnd };
}

function getPriorRangeBounds ( start, end ) {
  const startDay = startOfUTCDate( start );
  const endDay = startOfUTCDate( end );
  const days = Math.max( 1, Math.round( ( endDay.getTime() - startDay.getTime() ) / DAY_MS ) + 1 );
  const priorEnd = endOfUTCDate( addDays( startDay, -1 ) );
  const priorStart = startOfUTCDate( addDays( priorEnd, -( days - 1 ) ) );
  return { start: priorStart, end: priorEnd };
}

function rangeLabel ( range ) {
  const item = [ ...METRIC_RANGE_ITEMS, ...COHORT_RANGE_ITEMS, ...HEATMAP_RANGE_ITEMS ].find( ( option ) => option.id === range );
  return item?.label || "Selected range";
}

function pct ( numerator, denominator ) {
  return denominator > 0 ? ( numerator / denominator ) * 100 : 0;
}

function round1 ( value ) {
  return Math.round( ( Number( value ) || 0 ) * 10 ) / 10;
}

function formatInt ( value ) {
  return Math.round( Number( value ) || 0 ).toLocaleString( "en-US" );
}

function formatUsd ( value ) {
  return new Intl.NumberFormat( "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  } ).format( Number( value ) || 0 );
}

function formatPct ( value ) {
  const rounded = round1( value );
  return `${Number.isInteger( rounded ) ? rounded.toFixed( 0 ) : rounded.toFixed( 1 )}%`;
}

function sourceBucket ( sourceType ) {
  const s = String( sourceType || "organic" ).toLowerCase();
  return s.includes( "ad" ) || s.includes( "ads" ) ? "paid" : "organic";
}

function isFailedTransaction ( row, actionOverride = null ) {
  const action = String( actionOverride || row?.action || "" ).toLowerCase();
  const state = String( row?.state || "" ).toLowerCase();
  return action === "dispute" || ( row?.state != null && !SUCCESS_STATES.has( state ) );
}

function txAmountUsd ( row ) {
  return Math.abs( Number( row?.amount_in_cents || 0 ) ) / 100;
}

function sumGrossTransactions ( rows, startISO, endISO ) {
  return ( rows || [] ).reduce( ( sum, row ) => {
    if ( !row?.created_at_kajabi || row.created_at_kajabi < startISO || row.created_at_kajabi > endISO ) return sum;
    const action = String( row?.action || ( Number( row?.amount_in_cents || 0 ) >= 0 ? "charge" : "refund" ) ).toLowerCase();
    const isRefund = action === "refund" || Number( row?.amount_in_cents || 0 ) < 0;
    return !isRefund && !isFailedTransaction( row, action ) ? sum + txAmountUsd( row ) : sum;
  }, 0 );
}

function sumNetTransactions ( rows, startISO, endISO ) {
  return ( rows || [] ).reduce( ( sum, row ) => {
    const resolvedInRange =
      row?.payment_resolved_at != null &&
      row.payment_resolved_at >= startISO &&
      row.payment_resolved_at <= endISO &&
      ( row.effective_date == null || row.effective_date < startISO || row.effective_date > endISO );
    const inRange =
      ( row?.effective_date >= startISO && row.effective_date <= endISO ) ||
      resolvedInRange;
    if ( !inRange ) return sum;

    const action = resolvedInRange
      ? "charge"
      : String( row?.action || ( Number( row?.amount_in_cents || 0 ) >= 0 ? "charge" : "refund" ) ).toLowerCase();
    if ( !resolvedInRange && isFailedTransaction( row, action ) ) return sum;

    const isRefund = action === "refund" || Number( row?.amount_in_cents || 0 ) < 0;
    return sum + ( isRefund ? -txAmountUsd( row ) : txAmountUsd( row ) );
  }, 0 );
}

function metricBadge ( current, previous, label ) {
  if ( !previous ) {
    return {
      badge: `No ${label} data`,
      badgeClass: "bg-slate-100 text-slate-600",
    };
  }
  const delta = ( ( current - previous ) / Math.abs( previous ) ) * 100;
  return {
    badge: `${delta >= 0 ? "▲" : "▼"} ${Math.abs( round1( delta ) )}% vs ${label}`,
    badgeClass: delta >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600",
  };
}

async function fetchTransactions ( start, end ) {
  const startISO = start.toISOString();
  const endISO = end.toISOString();
  const { data, error } = await supabase
    .from( "kajabi_transactions" )
    .select( "action, state, amount_in_cents, kajabi_customer_id, created_at_kajabi, effective_date, payment_resolved_at" )
    .or( `and(created_at_kajabi.gte.${startISO},created_at_kajabi.lte.${endISO}),and(effective_date.gte.${startISO},effective_date.lte.${endISO}),and(payment_resolved_at.gte.${startISO},payment_resolved_at.lte.${endISO})` );
  if ( error ) throw error;
  return data || [];
}

async function countRows ( query ) {
  const { count, error } = await query;
  if ( error ) throw error;
  return count || 0;
}

async function fetchJsonOrNull ( url ) {
  try {
    const res = await fetch( url );
    const json = await res.json().catch( () => null );
    return res.ok ? json : null;
  } catch {
    return null;
  }
}

function sumGaRows ( payload, field ) {
  return ( payload?.rows || [] ).reduce( ( sum, row ) => sum + ( Number( row?.[ field ] ) || 0 ), 0 );
}

function sumGaByPath ( payload, paths ) {
  return ( payload?.rows || [] ).reduce( ( total, row ) => {
    const byPath = row?.byPath || {};
    return total + paths.reduce( ( sum, path ) => sum + ( Number( byPath[ path ] ) || 0 ), 0 );
  }, 0 );
}

function formatHour ( hour ) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const value = hour % 12 || 12;
  return `${value}:00 ${suffix}`;
}

function heatmapCellInfo ( day, hour, cell ) {
  const conversionRate = typeof cell === "number"
    ? ( 0.8 + cell * 2.45 + ( hour % 3 ) * 0.18 ).toFixed( 1 )
    : Number( cell?.conversionRate || 0 ).toFixed( 1 );
  const bookedCalls = typeof cell === "number"
    ? Math.max( 0, Math.round( cell * 1.8 + ( hour >= 9 && hour <= 17 ? 1 : 0 ) ) )
    : Number( cell?.bookedCalls || 0 );
  const level = typeof cell === "number"
    ? cell
    : heatmapLevelFromConversion( conversionRate, bookedCalls );

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

function parseMetricNumber ( value ) {
  const n = Number( String( value ?? "" ).replace( /[^0-9.-]/g, "" ) );
  return Number.isFinite( n ) ? n : null;
}

function performanceBgForFunnelRow ( row ) {
  const pct = Number( row?.stepPct );
  if ( !Number.isFinite( pct ) ) return row?.colorClass || "bg-slate-400";
  if ( row?.label === "Show-ups" ) return getShowUpBgClass( pct );
  if ( row?.label === "Closed (Sale)" ) return getConversionBgClass( pct );
  // Calls Booked step has no defined benchmark — use neutral colour
  return row?.colorClass || "bg-slate-400";
}

function performanceTextForCard ( card ) {
  if ( card?.label === "AOV leader" || /AOV/i.test( card?.label || "" ) ) {
    const value = parseMetricNumber( card?.value );
    return value == null ? card?.valueClass : getAovClass( value );
  }
  return card?.valueClass;
}

function heatmapLevelFromConversion ( conversionRate, bookedCalls ) {
  if ( !bookedCalls ) return 0;
  const rate = Number( conversionRate ) || 0;
  if ( rate < 25 ) return 1;
  if ( rate < 50 ) return 2;
  if ( rate < 75 ) return 3;
  return 4;
}

async function loadGaFunnel ( start, end ) {
  const params = { startDate: isoDay( start ), endDate: isoDay( end ) };
  const funnelPaths = `${ADS_VSL_PATH},${ORGANIC_VSL_PATH},${ADS_OPT_IN_PATH},${ORGANIC_OPT_IN_PATHS}`;

  const [ gaFunnelSessions, gaWebsiteViews, gaVslViews, gaOptInEvents ] = await Promise.all( [
    fetchJsonOrNull( `/api/google-analytics?${new URLSearchParams( { ...params, metric: "sessions", pagePaths: funnelPaths } ).toString()}` ),
    fetchJsonOrNull( `/api/google-analytics?${new URLSearchParams( { ...params, pagePath: "/" } ).toString()}` ),
    fetchJsonOrNull( `/api/google-analytics?${new URLSearchParams( { ...params, pagePaths: `${ADS_VSL_PATH},${ORGANIC_VSL_PATH}` } ).toString()}` ),
    fetchJsonOrNull( `/api/google-analytics?${new URLSearchParams( { ...params, wholeSite: "1" } ).toString()}` ),
  ] );

  // Reject mock data (returned when GA4_PROPERTY_ID is not configured — random numbers, not real).
  // The GA handler sets mock:true on every response when credentials are missing.
  const anyReal = [ gaFunnelSessions, gaWebsiteViews, gaVslViews, gaOptInEvents ]
    .filter( Boolean )
    .some( ( r ) => !r.mock );
  const vslPaths = [ ADS_VSL_PATH, ORGANIC_VSL_PATH ];
  const optInPaths = [ ADS_OPT_IN_PATH, "/pro", "/" ];
  const websiteViews = sumGaRows( gaWebsiteViews, "views" ) || sumGaRows( gaVslViews, "views" );
  const optInEvents = sumGaRows( gaOptInEvents, "eventCount" );
  const optInSessions = sumGaByPath( gaFunnelSessions, optInPaths );

  return {
    visitors: anyReal ? websiteViews : 0,
    vsl: anyReal ? sumGaByPath( gaFunnelSessions, vslPaths ) : 0,
    optIns: anyReal ? ( optInEvents > 0 ? optInEvents : optInSessions ) : 0,
    available: anyReal,
  };
}

function buildFunnel ( ga, callsBooked, showUps, closedSales ) {
  const optIns = ga.optIns > 0 ? ga.optIns : callsBooked;
  const counts = [
    { label: "Website Visitors", value: ga.visitors, colorClass: "bg-slate-500" },
    { label: "VSL Watched", value: ga.vsl, colorClass: "bg-slate-500" },
    { label: "Opt-ins", value: optIns, colorClass: "bg-slate-500" },
    { label: "Calls Booked", value: callsBooked, colorClass: "bg-slate-500" },
    { label: "Show-ups", value: showUps, colorClass: "bg-slate-500" },
    { label: "Closed (Sale)", value: closedSales, colorClass: "bg-slate-500" },
  ];
  const top = Math.max( counts[ 0 ].value, 1 );
  const rows = counts.map( ( row, index ) => {
    const stepPct = index === 0 ? 100 : pct( row.value, counts[ index - 1 ].value );
    return {
      ...row,
      value: formatInt( row.value ),
      percent: formatPct( stepPct ),
      width: pct( row.value, top ),
      rawValue: row.value,
      stepPct: round1( stepPct ),
    };
  } );
  const leaks = rows.slice( 1 ).filter( ( row ) => row.rawValue > 0 || row.stepPct > 0 );
  const leak = leaks.length ? leaks.reduce( ( min, row ) => row.stepPct < min.stepPct ? row : min, leaks[ 0 ] ) : null;
  const leakIndex = leak ? rows.indexOf( leak ) : -1;
  return {
    rows,
    visitorToCustomer: formatPct( pct( closedSales, counts[ 0 ].value ) ),
    biggestLeak: leak ? `Biggest leak: ${rows[ leakIndex - 1 ]?.label || "Previous"} → ${leak.label} (${formatPct( leak.stepPct )})` : "Biggest leak: not enough funnel data yet",
    gaAvailable: ga.available,
  };
}

function alertClasses ( tone ) {
  if ( tone === "danger" ) {
    return {
      dotClass: "bg-rose-500 shadow-rose-300",
      panelClass: "border-rose-400 bg-rose-100/80 text-slate-900",
    };
  }
  if ( tone === "warning" ) {
    return {
      dotClass: "bg-amber-400 shadow-amber-300",
      panelClass: "border-amber-400 bg-amber-100/85 text-slate-900",
    };
  }
  return {
    dotClass: "bg-emerald-500 shadow-emerald-300",
    panelClass: "border-emerald-400 bg-emerald-100/85 text-slate-900",
  };
}

async function loadSalesAov ( start, end ) {
  const { data, error } = await supabase
    .from( "outcome_log" )
    .select( "outcome, purchase_date, offers!offer_id(price), calls!closer_notes_call_id_fkey(closers(name))" )
    .eq( "outcome", "yes" )
    .not( "purchase_date", "is", null )
    .gte( "purchase_date", start.toISOString() )
    .lte( "purchase_date", end.toISOString() );
  if ( error ) throw error;

  const byCloser = new Map();
  let total = 0;
  let count = 0;
  for ( const row of data || [] ) {
    const price = Number( row?.offers?.price || 0 );
    if ( !Number.isFinite( price ) || price <= 0 ) continue;
    const name = row?.calls?.closers?.name || "Unknown";
    const entry = byCloser.get( name ) || { name, total: 0, count: 0 };
    entry.total += price;
    entry.count += 1;
    byCloser.set( name, entry );
    total += price;
    count += 1;
  }
  const best = [ ...byCloser.values() ]
    .map( ( entry ) => ( { ...entry, aov: entry.total / entry.count } ) )
    .sort( ( a, b ) => b.aov - a.aov )[ 0 ];
  return { best, overall: count ? total / count : 0 };
}

async function loadCallsInRange ( start, end, field = "call_date" ) {
  const { data, error } = await supabase
    .from( "calls" )
    .select( "id, book_date, call_date, source_type, confirmed, showed_up, phone, setter_id" )
    .not( field, "is", null )
    .gte( field, start.toISOString() )
    .lte( field, end.toISOString() );
  if ( error ) throw error;
  return data || [];
}

async function loadClosedSalesCount ( start, end ) {
  return countRows(
    supabase
      .from( "outcome_log" )
      .select( "id", { count: "exact", head: true } )
      .eq( "outcome", "yes" )
      .not( "purchase_date", "is", null )
      .gte( "purchase_date", start.toISOString() )
      .lte( "purchase_date", end.toISOString() ),
  );
}

async function buildCohortCards ( start90, now ) {
  const txRows = await fetchTransactions( start90, now );
  const gross = sumGrossTransactions( txRows, start90.toISOString(), now.toISOString() );
  const net = sumNetTransactions( txRows, start90.toISOString(), now.toISOString() );
  const refunds = txRows.reduce( ( sum, row ) => {
    const action = String( row?.action || "" ).toLowerCase();
    return action === "refund" || action === "dispute" || Number( row?.amount_in_cents || 0 ) < 0
      ? sum + txAmountUsd( row )
      : sum;
  }, 0 );
  const payingCustomers = new Set(
    txRows
      .filter( ( row ) => String( row?.action || "" ).toLowerCase() === "charge" && !isFailedTransaction( row ) )
      .map( ( row ) => row?.kajabi_customer_id )
      .filter( Boolean ),
  );

  // Retention: customers with successful charges in at least 2 CONSECUTIVE calendar months.
  // Denominator = customers with charges in 2+ distinct months (had the opportunity to be retained).
  // Numerator   = of those, customers with at least one consecutive month pair (M and M+1).
  const customerMonths = new Map(); // kajabi_customer_id -> Set<'YYYY-MM'>
  for ( const row of txRows ) {
    const action = String( row?.action || "" ).toLowerCase();
    if ( action !== "charge" || isFailedTransaction( row, action ) ) continue;
    const customerId = row?.kajabi_customer_id;
    if ( !customerId ) continue;
    const d = new Date( row?.created_at_kajabi );
    if ( isNaN( d.getTime() ) ) continue;
    const mk = `${d.getUTCFullYear()}-${String( d.getUTCMonth() + 1 ).padStart( 2, "0" )}`;
    if ( !customerMonths.has( customerId ) ) customerMonths.set( customerId, new Set() );
    customerMonths.get( customerId ).add( mk );
  }

  let retainedCount = 0;
  let retentionDenominator = 0;
  for ( const months of customerMonths.values() ) {
    if ( months.size < 2 ) continue; // only one month of payments — skip
    retentionDenominator++;
    const sorted = [ ...months ].sort();
    const hasConsecutive = sorted.some( ( mk, i ) => {
      if ( i === 0 ) return false;
      const [ y1, m1 ] = sorted[ i - 1 ].split( "-" ).map( Number );
      const [ y2, m2 ] = mk.split( "-" ).map( Number );
      return ( y2 - y1 ) * 12 + ( m2 - m1 ) === 1;
    } );
    if ( hasConsecutive ) retainedCount++;
  }

  const retentionPct = pct( retainedCount, retentionDenominator );
  const refundPct = pct( refunds, gross );

  return [
    {
      label: "Avg LTV (90d)",
      value: formatUsd( payingCustomers.size ? net / payingCustomers.size : 0 ),
      valueClass: "text-blue-600",
      note: `${formatInt( payingCustomers.size )} paying customers in last 90 days`,
    },
    {
      label: "Refund / chargeback %",
      value: formatPct( refundPct ),
      valueClass: refundPct > 5 ? "text-red-600" : "text-emerald-600",
      note: "Refunds and disputes as share of gross charges",
    },
    {
      label: "Retention (M+1)",
      value: retentionDenominator > 0 ? formatPct( retentionPct ) : "—",
      valueClass: retentionPct >= 60 ? "text-emerald-600" : retentionPct >= 40 ? "text-amber-600" : "text-rose-600",
      note: `${formatInt( retainedCount )} of ${formatInt( retentionDenominator )} multi-month payers had consecutive months`,
    },
  ];
}

async function buildSpeedCards ( recentStart, now ) {
  // For open follow-ups: fetch the latest outcome per call and count those
  // still in follow_up / lock_in state. A plain count of follow_up rows would
  // include every historical entry even after a subsequent 'yes' or 'no'.
  const [ recentCalls, allOutcomes ] = await Promise.all( [
    loadCallsInRange( recentStart, now, "book_date" ),
    supabase
      .from( "outcome_log" )
      .select( "call_id, outcome, id" )
      .order( "id", { ascending: false } )
      .then( ( { data } ) => data || [] ),
  ] );

  // Deduplicate: keep only the highest-id (latest) outcome per call
  const latestOutcomeByCall = new Map();
  for ( const row of allOutcomes ) {
    if ( row.call_id != null && !latestOutcomeByCall.has( row.call_id ) ) {
      latestOutcomeByCall.set( row.call_id, row.outcome );
    }
  }
  const openFollowUps = [ ...latestOutcomeByCall.values() ]
    .filter( ( o ) => o === "follow_up" || o === "lock_in" ).length;

  let avgMinutes = null;
  let notContacted = 0;
  try {
    const analysis = await runAnalysis( recentCalls, now );
    const values = Object.values( analysis || {} );
    const called = values.filter( ( row ) => row?.called && Number.isFinite( Number( row.responseTimeMinutes ) ) );
    avgMinutes = called.length ? called.reduce( ( sum, row ) => sum + Number( row.responseTimeMinutes ), 0 ) / called.length : null;
    const oneHourAgo = now.getTime() - 60 * 60 * 1000;
    notContacted = recentCalls.filter( ( call ) => {
      const bookedAt = new Date( call.book_date ).getTime();
      const result = analysis?.[ String( call.id ) ];
      return bookedAt <= oneHourAgo && result?.called !== true;
    } ).length;
  } catch ( err ) {
    console.warn( "[Management2 Metrics] Zoom analysis unavailable:", err );
  }

  return [
    {
      label: "Avg time to 1st call",
      value: avgMinutes == null ? "—" : avgMinutes < 60 ? `${Math.round( avgMinutes )} min` : `${round1( avgMinutes / 60 )} hr`,
      valueClass: avgMinutes == null
        ? "text-amber-600"
        : avgMinutes <= 5
          ? "text-emerald-600"
          : avgMinutes <= 60
            ? "text-amber-600"
            : "text-rose-600",
      note: avgMinutes == null ? "Zoom analysis unavailable" : "Target: <5 min",
    },
    {
      label: "Leads not yet contacted",
      value: formatInt( notContacted ),
      valueClass: notContacted > 0 ? "text-red-600" : "text-emerald-600",
      note: "Recent bookings older than 1 hour",
    },
    {
      label: "Open follow-up queue",
      value: formatInt( openFollowUps ),
      valueClass: openFollowUps > 0 ? "text-rose-600" : "text-emerald-600",
      note: "Calls whose latest outcome is still follow-up / lock-in",
    },
  ];
}

async function buildHeatmapDays ( start, end ) {
  const startDay = startOfUTCDate( start );
  const endDay = startOfUTCDate( end );
  const calls = await loadCallsInRange( startDay, endOfUTCDate( endDay ), "book_date" );
  const callIds = calls.map( ( call ) => call.id ).filter( Boolean );
  const { data: outcomes, error } = callIds.length
    ? await supabase.from( "outcome_log" ).select( "id, call_id, outcome" ).in( "call_id", callIds )
    : { data: [], error: null };
  if ( error ) throw error;

  const latestByCall = new Map();
  for ( const row of outcomes || [] ) {
    const existing = latestByCall.get( String( row.call_id ) );
    if ( !existing || row.id > existing.id ) latestByCall.set( String( row.call_id ), row );
  }

  const dayCount = Math.max( 1, Math.round( ( endDay.getTime() - startDay.getTime() ) / DAY_MS ) + 1 );
  const formatter = new Intl.DateTimeFormat( "en-US", {
    month: dayCount > 7 ? "short" : undefined,
    day: dayCount > 7 ? "numeric" : undefined,
    weekday: dayCount <= 7 ? "short" : undefined,
    timeZone: "UTC",
  } );
  const rows = Array.from( { length: dayCount }, ( _, index ) => {
    const date = addDays( endDay, -index );
    return {
      day: formatter.format( date ),
      dateKey: isoDay( date ),
      cells: Array.from( { length: 24 }, () => ( { bookedCalls: 0, sales: 0, conversionRate: 0 } ) ),
    };
  } );
  const rowsByDate = new Map( rows.map( ( row ) => [ row.dateKey, row ] ) );

  for ( const call of calls ) {
    const bookedAt = new Date( call.book_date );
    const row = rowsByDate.get( isoDay( bookedAt ) );
    if ( !row ) continue;
    const cell = row.cells[ bookedAt.getUTCHours() ];
    cell.bookedCalls += 1;
    if ( latestByCall.get( String( call.id ) )?.outcome === "yes" ) cell.sales += 1;
  }

  for ( const row of rows ) {
    for ( const cell of row.cells ) {
      cell.conversionRate = round1( pct( cell.sales, cell.bookedCalls ) );
      delete cell.sales;
    }
    delete row.dateKey;
  }

  return rows;
}

function shimmer ( className = "" ) {
  return (
    <div className={cx( "animate-pulse rounded-md bg-slate-200/70", className )} />
  );
}

function SectionBadge ( { children } ) {
  return (
    <span className="inline-flex h-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 shadow-sm">
      {children}
    </span>
  );
}

function SectionRangeSelect ( { value, onChange, items = METRIC_RANGE_ITEMS, label } ) {
  return (
    <select
      value={value}
      onChange={( event ) => onChange( event.target.value )}
      className="h-7 max-w-full shrink-0 rounded-md border border-slate-200 bg-white px-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-600 focus:border-blue-500 focus:outline-none"
      aria-label={label}
    >
      {items.map( ( item ) => (
        <option key={item.id} value={item.id}>
          {item.label}
        </option>
      ) )}
    </select>
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
        "flex h-full flex-col rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)]",
        compact ? "min-h-[112px] px-2.5 py-2.5" : "min-h-[132px] px-4 py-4 sm:px-5",
      )}
    >
      <p className={cx( "min-h-[22px] font-semibold uppercase tracking-[0.08em] text-slate-500", compact ? "text-[9px] leading-[11px]" : "text-[11px]" )}>
        {metric.label}
      </p>
      <div className={cx( compact ? "mt-1 text-[22px]" : "mt-3 text-[30px]", "font-semibold leading-none tracking-normal", metric.valueClass )}>
        {metric.value}
      </div>
      <div className={compact ? "mt-2 min-h-[18px]" : "mt-3 min-h-[22px]"}>
        <span className={cx( "inline-flex max-w-full items-center rounded-md px-1.5 py-1 font-semibold leading-none", compact ? "text-[8px]" : "text-[11px]", metric.badgeClass )}>
          {metric.badge}
        </span>
      </div>
      <p className={cx( "mt-auto pt-1.5 font-semibold leading-snug text-slate-500", compact ? "text-[9px]" : "text-[12px]" )}>{metric.note}</p>
    </article>
  );
}

function MetricCardShimmer ( { compact = false } ) {
  return (
    <article
      className={cx(
        "rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)]",
        compact ? "min-h-[112px] px-2.5 py-2.5" : "min-h-[132px] px-4 py-4 sm:px-5",
      )}
    >
      {shimmer( compact ? "h-2.5 w-24" : "h-3 w-28" )}
      {shimmer( compact ? "mt-2 h-6 w-20" : "mt-4 h-8 w-24" )}
      {shimmer( compact ? "mt-2 h-4 w-24" : "mt-3 h-5 w-28" )}
      {shimmer( compact ? "mt-2 h-2.5 w-28" : "mt-3 h-3 w-32" )}
    </article>
  );
}

function AlertRow ( { alert } ) {
  const aovMatch = String( alert?.title || "" ).match( /closed\s+\$([0-9,]+)/i );
  const aovValue = aovMatch ? parseMetricNumber( aovMatch[ 1 ] ) : null;
  const dotClass = aovValue == null ? alert.dotClass : getAovBgClass( aovValue );
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
          dotClass,
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

function AlertRowShimmer () {
  return (
    <article className="flex min-h-[62px] items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      {shimmer( "h-4 w-4 shrink-0 rounded-full" )}
      <div className="min-w-0 flex-1">
        {shimmer( "h-3.5 w-11/12" )}
        {shimmer( "mt-2 h-3 w-4/5" )}
      </div>
    </article>
  );
}

function FunnelRow ( { row, onHover, onLeave } ) {
  const barClass = performanceBgForFunnelRow( row );
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
          className={cx( "flex h-full min-w-[12px] items-center justify-end rounded-md pr-1.5", barClass )}
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

function FunnelSection ( { funnel, loading, range, onRangeChange } ) {
  const [ hoveredRow, setHoveredRow ] = useState( null );
  const rows = funnel?.rows || [];

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
          <span className={cx( "shrink-0 text-[11px] font-semibold", !loading && getSuccessClass( parseMetricNumber( funnel?.visitorToCustomer ) || 0 ) )}>
            {loading ? "—" : funnel?.visitorToCustomer || "—"}
          </span>
        </div>
        <div className="w-full">
          <SectionRangeSelect
            value={range}
            onChange={onRangeChange}
            label="Funnel conversion range"
          />
        </div>
      </div>

      <div className="relative mt-3 rounded-lg border border-slate-200 bg-white p-3" data-funnel-panel>
        <div className="space-y-1.5">
          {loading
            ? Array.from( { length: 6 } ).map( ( _, index ) => (
              <div key={index} className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-2">
                {shimmer( "h-3 w-16" )}
                {shimmer( "h-[22px] w-full" )}
              </div>
            ) )
            : rows.map( ( row ) => (
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
                <p className={cx(
                  "mt-0.5 text-[12px] font-semibold leading-none",
                  hoveredRow.row.label === "Show-ups"
                    ? getShowUpClass( hoveredRow.row.stepPct )
                    : hoveredRow.row.label === "Closed (Sale)"
                      ? getConversionClass( hoveredRow.row.stepPct )
                      : getSuccessClass( hoveredRow.row.stepPct ),
                )}>
                  {hoveredRow.row.percent}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-3 flex flex-col gap-2">
          {loading ? (
            shimmer( "h-6 w-full" )
          ) : (
            <span className="inline-flex max-w-full rounded-md border border-violet-300 bg-violet-50 px-2 py-1 text-[10px] font-semibold leading-snug text-violet-600">
              {funnel?.biggestLeak || "Biggest leak: not enough funnel data yet"}
            </span>
          )}
          {!loading && funnel?.gaAvailable === false ? (
            <span className="text-[10px] font-medium text-amber-600">
              GA unavailable; CRM funnel steps are still current.
            </span>
          ) : null}
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
      <div className={cx( compact ? "mt-2 text-[20px]" : "mt-4 text-[25px]", "font-semibold leading-none tracking-normal", performanceTextForCard( card ) )}>
        {card.value}
      </div>
      <p className={cx( compact ? "mt-1.5 text-[9px]" : "mt-3 text-[11px]", "font-medium text-slate-500" )}>{card.note}</p>
    </article>
  );
}

function SmallMetricCardShimmer ( { compact = false } ) {
  return (
    <article
      className={cx(
        "rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)]",
        compact ? "min-h-[76px] px-2.5 py-2.5" : "min-h-[106px] px-4 py-4",
      )}
    >
      {shimmer( compact ? "h-2.5 w-24" : "h-3 w-28" )}
      {shimmer( compact ? "mt-3 h-5 w-16" : "mt-5 h-6 w-20" )}
      {shimmer( compact ? "mt-2 h-2.5 w-28" : "mt-4 h-3 w-36" )}
    </article>
  );
}

function CardGridSection ( { title, badge, cards, compact = false, loading = false, range, onRangeChange, rangeItems = METRIC_RANGE_ITEMS } ) {
  return (
    <section className={compact ? "min-w-0" : ""}>
      <div className={cx(
        compact ? "flex flex-col items-start gap-2" : "flex items-center justify-between gap-4",
      )}>
        <h2 className={cx( compact ? "text-[17px]" : "text-[24px]", "font-semibold leading-tight tracking-normal text-slate-950" )}>
          {title}
        </h2>
        <div className={cx( "flex items-center gap-2", compact ? "w-full justify-between" : "" )}>
          <SectionBadge>{badge}</SectionBadge>
          <SectionRangeSelect
            value={range}
            onChange={onRangeChange}
            items={rangeItems}
            label={`${title} range`}
          />
        </div>
      </div>

      <div className={cx( "grid grid-cols-1", compact ? "mt-2 gap-2" : "mt-4 gap-4 md:grid-cols-3" )}>
        {loading
          ? Array.from( { length: 3 } ).map( ( _, index ) => (
            <SmallMetricCardShimmer key={index} compact={compact} />
          ) )
          : cards.map( ( card ) => (
            <SmallMetricCard key={card.label} card={card} compact={compact} />
          ) )}
      </div>
    </section>
  );
}

function NorthStarSection ( { metrics, loading, range, onRangeChange } ) {
  return (
    <DashboardPanel>
      <div className="flex flex-col items-start gap-2">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold leading-tight tracking-normal text-slate-950">
            North-Star Metrics
          </h1>
        </div>
        <div className="flex w-full items-center justify-between gap-2">
          <SectionBadge>{rangeLabel( range )}{metrics?.todayLabel ? ` · ${metrics.todayLabel}` : ""}</SectionBadge>
          <SectionRangeSelect
            value={range}
            onChange={onRangeChange}
            label="North-star metrics range"
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {loading
          ? Array.from( { length: 4 } ).map( ( _, index ) => <MetricCardShimmer key={index} compact /> )
          : ( metrics?.metricCards || [] ).map( ( metric ) => (
            <MetricCard key={metric.label} metric={metric} compact />
          ) )}
      </div>
    </DashboardPanel>
  );
}

function HealthAlertsSection ( { alerts, loading, error, range, onRangeChange } ) {
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
        <div className="flex shrink-0 flex-col items-end gap-2">
          <SectionBadge>Auto-detected</SectionBadge>
          <SectionRangeSelect
            value={range}
            onChange={onRangeChange}
            label="Health alerts range"
          />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {loading
          ? Array.from( { length: 3 } ).map( ( _, index ) => <AlertRowShimmer key={index} /> )
          : ( alerts || [] ).map( ( alert ) => (
            <AlertRow key={alert.title} alert={alert} />
          ) )}
        {!loading && error ? (
          <p className="text-[11px] font-medium text-rose-600">{error}</p>
        ) : null}
      </div>
    </DashboardPanel>
  );
}

function ValueVelocityPanel ( { cohortCards, speedCards, cohortLoading, speedLoading, cohortRange, onCohortRangeChange, speedRange, onSpeedRangeChange } ) {
  return (
    <DashboardPanel className="space-y-4">
      <CardGridSection
        title="Customer Lifetime Value & Cohorts"
        badge="Revenue Quality"
        cards={cohortCards || []}
        compact
        loading={cohortLoading}
        range={cohortRange}
        onRangeChange={onCohortRangeChange}
        rangeItems={COHORT_RANGE_ITEMS}
      />

      <CardGridSection
        title="Lead Velocity & Speed-to-Lead"
        badge="Operational"
        cards={speedCards || []}
        compact
        loading={speedLoading}
        range={speedRange}
        onRangeChange={onSpeedRangeChange}
      />
    </DashboardPanel>
  );
}

function HeatmapCell ( { cell, day, hour, isActive, onHover, onLeave } ) {
  const level = typeof cell === "number"
    ? cell
    : heatmapLevelFromConversion( cell?.conversionRate, cell?.bookedCalls );
  const info = heatmapCellInfo( day, hour, cell );

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

function ActivityHeatmapSection ( { heatmapDays, loading, range, onRangeChange } ) {
  const [ hoveredCell, setHoveredCell ] = useState( null );
  const rows = heatmapDays || [];

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
        <div className="flex shrink-0 items-center gap-2">
          <SectionRangeSelect
            value={range}
            onChange={onRangeChange}
            items={HEATMAP_RANGE_ITEMS}
            label="Activity heatmap range"
          />
        </div>
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
            {loading
              ? Array.from( { length: 7 } ).map( ( _, rowIndex ) => (
                <div key={rowIndex} className="grid grid-cols-[48px_1fr] items-center gap-0">
                  {shimmer( "h-3 w-7" )}
                  <div className="grid grid-cols-[repeat(24,30px)] gap-0">
                    {Array.from( { length: 24 } ).map( ( __, cellIndex ) => (
                      <div key={cellIndex} className="h-[14px] w-[30px] border border-white bg-slate-100">
                        <div className="h-full w-full animate-pulse bg-slate-200/70" />
                      </div>
                    ) )}
                  </div>
                </div>
              ) )
              : rows.map( ( row ) => (
                <div key={row.day} className="grid grid-cols-[48px_1fr] items-center gap-0">
                  <div className="text-[11px] font-medium text-slate-500">{row.day}</div>
                  <div className="grid grid-cols-[repeat(24,30px)] gap-0">
                    {row.cells.map( ( cell, hour ) => (
                      <HeatmapCell
                        key={`${row.day}-${hour}`}
                        cell={cell}
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
              [ "1-25%", 1 ],
              [ "25-50%", 2 ],
              [ "50-75%", 3 ],
              [ "75-100%", 4 ],
            ].map( ( [ label, level ] ) => (
              <span key={label} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                <span className={cx( "h-2.5 w-2.5 rounded-[2px]", HEATMAP_COLORS[ level ] )} />
                {label}
              </span>
            ) )}
          </div>
          {/* <p className="text-[11px] font-medium text-slate-500">
            Note: Colors are based on conversion rate, not number of calls.
          </p> */}
        </div>
      </div>
    </section>
  );
}

export default function Metrics () {
  const { monthlyRevenueGoal } = useRevenueGoal();
  const [ metrics, setMetrics ] = useState( EMPTY_METRICS );
  const [ loading, setLoading ] = useState( {
    northStar: true,
    funnel: true,
    health: true,
    heatmap: true,
    cohort: true,
    speed: true,
  } );
  const [ error, setError ] = useState( "" );
  const [ northStarRange, setNorthStarRange ] = useState( "today" );
  const [ funnelRange, setFunnelRange ] = useState( "mtd" );
  const [ healthRange, setHealthRange ] = useState( "mtd" );
  const [ heatmapRange, setHeatmapRange ] = useState( "last7" );
  const [ cohortRange, setCohortRange ] = useState( "last90" );
  const [ speedRange, setSpeedRange ] = useState( "last7" );

  useEffect( () => {
    let cancelled = false;

    async function loadNorthStar () {
      setLoading( ( previous ) => ( { ...previous, northStar: true } ) );
      try {
        const now = new Date();
        const northBounds = getRangeBounds( northStarRange );
        const northPrior = getPriorRangeBounds( northBounds.start, northBounds.end );
        const monthRange = DateHelpers.getMonthRangeInTimezone( now, DateHelpers.DEFAULT_TIMEZONE );
        const daysInMonth = monthRange.endDate.getUTCDate();
        const dailyTarget = monthlyRevenueGoal / daysInMonth;

        const [ northTx, northPriorTx, northBookings, northPriorBookings, northCalls, northPriorCalls ] = await Promise.all( [
          fetchTransactions( northBounds.start, northBounds.end ),
          fetchTransactions( northPrior.start, northPrior.end ),
          loadCallsInRange( northBounds.start, northBounds.end, "book_date" ),
          loadCallsInRange( northPrior.start, northPrior.end, "book_date" ),
          loadCallsInRange( northBounds.start, northBounds.end, "call_date" ),
          loadCallsInRange( northPrior.start, northPrior.end, "call_date" ),
        ] );

        const northStartISO = northBounds.start.toISOString();
        const northEndISO = northBounds.end.toISOString();
        const northPriorStartISO = northPrior.start.toISOString();
        const northPriorEndISO = northPrior.end.toISOString();
        const northNet = sumNetTransactions( northTx, northStartISO, northEndISO );
        const northPriorNet = sumNetTransactions( northPriorTx, northPriorStartISO, northPriorEndISO );
        const northGross = sumGrossTransactions( northTx, northStartISO, northEndISO );
        const northPriorGross = sumGrossTransactions( northPriorTx, northPriorStartISO, northPriorEndISO );
        const confirmedCalls = northCalls.filter( ( call ) => call.confirmed === true || call.confirmed === "true" ).length;
        const organicLeads = northBookings.filter( ( call ) => sourceBucket( call.source_type ) === "organic" ).length;
        const paidLeads = northBookings.filter( ( call ) => sourceBucket( call.source_type ) === "paid" ).length;

        const metricCards = [
          {
            label: northStarRange === "today" ? "Net revenue today" : "Net revenue",
            value: formatUsd( northNet ),
            valueClass: northNet >= dailyTarget
              ? "text-emerald-600"
              : northNet >= dailyTarget * 0.6
                ? "text-amber-600"
                : "text-rose-600",
            ...metricBadge( northNet, northPriorNet, "prior period" ),
            note: `${rangeLabel( northStarRange )} · Goal-pace: ${formatUsd( dailyTarget )}/day`,
          },
          {
            label: northStarRange === "today" ? "Cash collected today" : "Cash collected",
            value: formatUsd( northGross ),
            valueClass: "text-blue-600",
            ...metricBadge( northGross, northPriorGross, "prior period" ),
            note: "Successful Kajabi charges before refunds",
          },
          {
            label: northStarRange === "today" ? "New leads today" : "New leads",
            value: formatInt( northBookings.length ),
            valueClass: "text-violet-600",
            badge: `${northBookings.length - northPriorBookings.length >= 0 ? "▲" : "▼"} ${Math.abs( northBookings.length - northPriorBookings.length )} vs prior period`,
            badgeClass: northBookings.length >= northPriorBookings.length ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600",
            note: `${formatInt( organicLeads )} organic · ${formatInt( paidLeads )} paid`,
          },
          {
            label: northStarRange === "today" ? "Booked calls today" : "Booked calls",
            value: formatInt( northCalls.length ),
            valueClass: "text-amber-600",
            badge: `${northCalls.length >= northPriorCalls.length ? "▲" : "▼"} ${Math.abs( northCalls.length - northPriorCalls.length )} vs prior period`,
            badgeClass: northCalls.length >= northPriorCalls.length ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600",
            note: `${formatInt( confirmedCalls )} confirmed · ${formatInt( Math.max( northCalls.length - confirmedCalls, 0 ) )} pending`,
          },
        ];

        if ( cancelled ) return;
        setMetrics( ( previous ) => ( {
          ...previous,
          todayLabel: new Intl.DateTimeFormat( "en-US", {
            month: "short",
            day: "numeric",
            timeZone: DateHelpers.DEFAULT_TIMEZONE,
          } ).format( now ),
          metricCards,
        } ) );
      } catch ( err ) {
        if ( !cancelled ) console.error( "[Management2 Metrics] north-star load failed:", err );
      } finally {
        if ( !cancelled ) setLoading( ( previous ) => ( { ...previous, northStar: false } ) );
      }
    }

    loadNorthStar();
    return () => {
      cancelled = true;
    };
  }, [ monthlyRevenueGoal, northStarRange ] );

  useEffect( () => {
    let cancelled = false;

    async function loadFunnel () {
      setLoading( ( previous ) => ( { ...previous, funnel: true } ) );
      try {
        const funnelBounds = getRangeBounds( funnelRange );
        const [ funnelBookings, funnelCalls, funnelSales, ga ] = await Promise.all( [
          loadCallsInRange( funnelBounds.start, funnelBounds.end, "book_date" ),
          loadCallsInRange( funnelBounds.start, funnelBounds.end, "call_date" ),
          loadClosedSalesCount( funnelBounds.start, funnelBounds.end ),
          loadGaFunnel( funnelBounds.start, funnelBounds.end ),
        ] );
        const showUpsFunnel = funnelCalls.filter( ( call ) => call.showed_up === true || call.showed_up === "true" ).length;
        const funnel = buildFunnel( ga, funnelBookings.length, showUpsFunnel, funnelSales );
        if ( cancelled ) return;
        setMetrics( ( previous ) => ( {
          ...previous,
          funnel: { ...EMPTY_METRICS.funnel, ...funnel },
        } ) );
      } catch ( err ) {
        if ( !cancelled ) console.error( "[Management2 Metrics] funnel load failed:", err );
      } finally {
        if ( !cancelled ) setLoading( ( previous ) => ( { ...previous, funnel: false } ) );
      }
    }

    loadFunnel();
    return () => {
      cancelled = true;
    };
  }, [ funnelRange ] );

  useEffect( () => {
    let cancelled = false;

    async function loadHealth () {
      setLoading( ( previous ) => ( { ...previous, health: true } ) );
      setError( "" );
      try {
        const now = new Date();
        const healthBounds = getRangeBounds( healthRange );
        const healthPrior = getPriorRangeBounds( healthBounds.start, healthBounds.end );
        const monthRange = DateHelpers.getMonthRangeInTimezone( now, DateHelpers.DEFAULT_TIMEZONE );
        const monthEnd = monthRange.endDate;

        const [ healthTx, healthCalls, healthPriorCalls, aov ] = await Promise.all( [
          fetchTransactions( healthBounds.start, healthBounds.end ),
          loadCallsInRange( healthBounds.start, healthBounds.end, "call_date" ),
          loadCallsInRange( healthPrior.start, healthPrior.end, "call_date" ),
          loadSalesAov( healthBounds.start, healthBounds.end ),
        ] );

        const healthStartISO = healthBounds.start.toISOString();
        const healthEndISO = healthBounds.end.toISOString();
        const healthNet = sumNetTransactions( healthTx, healthStartISO, healthEndISO );
        const currentShowRate = pct(
          healthCalls.filter( ( call ) => call.showed_up === true || call.showed_up === "true" ).length,
          healthCalls.length,
        );
        const previousShowRate = pct(
          healthPriorCalls.filter( ( call ) => call.showed_up === true || call.showed_up === "true" ).length,
          healthPriorCalls.length,
        );
        const dayOfMonth = now.getUTCDate();
        const daysInMonth = monthEnd.getUTCDate();
        const selectedDayCount = Math.max( 1, Math.round( ( startOfUTCDate( healthBounds.end ).getTime() - startOfUTCDate( healthBounds.start ).getTime() ) / DAY_MS ) + 1 );
        const selectedGoal = healthRange === "mtd"
          ? monthlyRevenueGoal * ( dayOfMonth / daysInMonth )
          : monthlyRevenueGoal * ( selectedDayCount / daysInMonth );
        const neededPerDay = Math.max( 0, ( selectedGoal - healthNet ) / selectedDayCount );
        const revenueTone = healthNet >= selectedGoal ? "success" : healthNet >= selectedGoal * 0.9 ? "warning" : "danger";
        const showTone = currentShowRate >= 55 ? "success" : currentShowRate >= 45 ? "warning" : "danger";
        const aovTone = aov.best?.aov >= 875 ? "success" : aov.best?.aov >= 750 ? "warning" : "danger";
        const alerts = [
          {
            tone: showTone,
            title: `Show-up rate is ${formatPct( currentShowRate )} in ${rangeLabel( healthRange )} (vs ${formatPct( previousShowRate )} prior period)`,
            body: "Computed from calls scheduled in the selected range with showed_up=true.",
            ...alertClasses( showTone ),
          },
          {
            tone: revenueTone,
            title: `${healthNet >= selectedGoal ? "On" : "Behind"} pace — ${formatUsd( healthNet )} of ${formatUsd( selectedGoal )} (${formatPct( pct( healthNet, selectedGoal ) )}) in ${rangeLabel( healthRange )}`,
            body: healthNet >= selectedGoal ? "Current net revenue is pacing at or above target." : `Need ${formatUsd( neededPerDay )}/day to catch up.`,
            ...alertClasses( revenueTone ),
          },
          {
            tone: aovTone,
            title: aov.best ? `AOV leader — ${aov.best.name} closed ${formatUsd( aov.best.aov )} (team avg ${formatUsd( aov.overall )})` : "AOV unavailable — no priced sales in selected range",
            body: aov.best ? "AOV uses outcome_log yes rows joined to offers.price." : "Add priced offers to closed sales to populate this alert.",
            ...alertClasses( aovTone ),
          },
        ];

        if ( cancelled ) return;
        setMetrics( ( previous ) => ( { ...previous, alerts } ) );
      } catch ( err ) {
        if ( cancelled ) return;
        console.error( "[Management2 Metrics] health alerts load failed:", err );
        setError( err?.message || "Failed to load alerts" );
      } finally {
        if ( !cancelled ) setLoading( ( previous ) => ( { ...previous, health: false } ) );
      }
    }

    loadHealth();
    return () => {
      cancelled = true;
    };
  }, [ healthRange, monthlyRevenueGoal ] );

  useEffect( () => {
    let cancelled = false;

    async function loadHeatmap () {
      setLoading( ( previous ) => ( { ...previous, heatmap: true } ) );
      try {
        const heatmapBounds = getRangeBounds( heatmapRange );
        const heatmapDays = await buildHeatmapDays( heatmapBounds.start, heatmapBounds.end );
        if ( cancelled ) return;
        setMetrics( ( previous ) => ( { ...previous, heatmapDays } ) );
      } catch ( err ) {
        if ( !cancelled ) console.error( "[Management2 Metrics] heatmap load failed:", err );
      } finally {
        if ( !cancelled ) setLoading( ( previous ) => ( { ...previous, heatmap: false } ) );
      }
    }

    loadHeatmap();
    return () => {
      cancelled = true;
    };
  }, [ heatmapRange ] );

  useEffect( () => {
    let cancelled = false;

    async function loadCohorts () {
      setLoading( ( previous ) => ( { ...previous, cohort: true } ) );
      try {
        const cohortBounds = getRangeBounds( cohortRange );
        const cohortCards = await buildCohortCards( cohortBounds.start, cohortBounds.end );
        if ( cancelled ) return;
        setMetrics( ( previous ) => ( { ...previous, cohortCards } ) );
      } catch ( err ) {
        if ( !cancelled ) console.error( "[Management2 Metrics] cohorts load failed:", err );
      } finally {
        if ( !cancelled ) setLoading( ( previous ) => ( { ...previous, cohort: false } ) );
      }
    }

    loadCohorts();
    return () => {
      cancelled = true;
    };
  }, [ cohortRange ] );

  useEffect( () => {
    let cancelled = false;

    async function loadSpeed () {
      setLoading( ( previous ) => ( { ...previous, speed: true } ) );
      try {
        const speedBounds = getRangeBounds( speedRange );
        const speedCards = await buildSpeedCards( speedBounds.start, speedBounds.end );
        if ( cancelled ) return;
        setMetrics( ( previous ) => ( { ...previous, speedCards } ) );
      } catch ( err ) {
        if ( !cancelled ) console.error( "[Management2 Metrics] speed load failed:", err );
      } finally {
        if ( !cancelled ) setLoading( ( previous ) => ( { ...previous, speed: false } ) );
      }
    }

    loadSpeed();
    return () => {
      cancelled = true;
    };
  }, [ speedRange ] );

  return (
    <div className="grid grid-cols-1 gap-2 xl:grid-cols-8 xl:items-start">
      <div className="min-w-0 xl:col-span-2">
        <NorthStarSection
          metrics={metrics}
          loading={loading.northStar}
          range={northStarRange}
          onRangeChange={setNorthStarRange}
        />
        <div className="mt-4">
          <FunnelSection
            funnel={metrics.funnel}
            loading={loading.funnel}
            range={funnelRange}
            onRangeChange={setFunnelRange}
          />
        </div>
      </div>

      <div className="min-w-0 space-y-4 xl:col-span-4">
        <HealthAlertsSection
          alerts={metrics.alerts}
          loading={loading.health}
          error={error}
          range={healthRange}
          onRangeChange={setHealthRange}
        />

        <DashboardPanel className="p-4">
          <ActivityHeatmapSection
            heatmapDays={metrics.heatmapDays}
            loading={loading.heatmap}
            range={heatmapRange}
            onRangeChange={setHeatmapRange}
          />
        </DashboardPanel>
      </div>

      <div className="min-w-0 xl:col-span-2">
        <ValueVelocityPanel
          cohortCards={metrics.cohortCards}
          speedCards={metrics.speedCards}
          cohortLoading={loading.cohort}
          speedLoading={loading.speed}
          cohortRange={cohortRange}
          onCohortRangeChange={setCohortRange}
          speedRange={speedRange}
          onSpeedRangeChange={setSpeedRange}
        />
      </div>
    </div>
  );
}
