import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import * as DateHelpers from "../../../../utils/dateHelpers";
import { getConfirmationColor, getShowUpColor } from "../../../../utils/performanceBenchmarks";
import SegmentedTabs from "../segmented-tabs";

function cx ( ...parts ) {
  return parts.filter( Boolean ).join( " " );
}

function shimmer ( className = "" ) {
  return <div className={cx( "animate-pulse rounded-md bg-slate-200/70", className )} />;
}

function pct ( num, den ) {
  const n = Number( num );
  const d = Number( den );
  if ( !Number.isFinite( n ) || !Number.isFinite( d ) || d <= 0 ) return 0;
  return ( n / d ) * 100;
}

const TIME_RANGE_ITEMS = [
  { id: "mtd", label: "MTD", title: "This month (MTD)" },
  { id: "lastMonth", label: "Last mo", title: "Last month" },
];

function getSnapshotRange ( range ) {
  const now = new Date();

  if ( range === "lastMonth" ) {
    const previousMonthDate = new Date(
      Date.UTC( now.getUTCFullYear(), now.getUTCMonth() - 1, 15 ),
    );
    const monthRange = DateHelpers.getMonthRangeInTimezone(
      previousMonthDate,
      DateHelpers.DEFAULT_TIMEZONE,
    );
    return {
      startISO: monthRange.startDate.toISOString(),
      endISO: monthRange.endDate.toISOString(),
      label: "Last month",
    };
  }

  const monthRange = DateHelpers.getMonthRangeInTimezone( now, DateHelpers.DEFAULT_TIMEZONE );
  const { dayEnd } = DateHelpers.getDayBoundsLocal( now );
  const endDate =
    monthRange.endDate.getTime() < dayEnd.getTime() ? monthRange.endDate : dayEnd;

  return {
    startISO: monthRange.startDate.toISOString(),
    endISO: endDate.toISOString(),
    label: "This month (MTD)",
  };
}

function SetterBarsShimmer () {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
      {shimmer( "mb-4 h-4 w-40" )}
      <div className="flex flex-col gap-2">
        {[ 1, 2, 3, 4 ].map( ( i ) => (
          <div key={i} className="flex items-center gap-2 py-1.5">
            {shimmer( 'h-4 w-[70px]' )}
            {shimmer( "h-[14px] flex-1 rounded-full" )}
            {shimmer( 'h-4 w-[45px]' )}
          </div>
        ) )}
      </div>
    </div>
  );
}

function BarChartRow ( { name, value, colorClass, customStyle, delayMs, animate, tooltip } ) {
  const [ width, setWidth ] = useState( 0 );

  useEffect( () => {
    if ( !animate ) {
      setWidth( 0 );
      return;
    }
    const timer = setTimeout( () => {
      setWidth( value );
    }, delayMs );
    return () => clearTimeout( timer );
  }, [ value, delayMs, animate ] );

  const finalColorClass = typeof colorClass === 'function' ? colorClass( value ) : colorClass;
  const finalStyle = typeof customStyle === 'function' ? customStyle( value ) : ( customStyle || {} );

  return (
    <div className="group relative -mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50/50">
      <div className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 rounded-md bg-slate-950 px-2 py-1 text-[10px] font-semibold whitespace-nowrap text-white opacity-0 shadow-[0_10px_24px_rgba(2,6,23,0.35)] transition-opacity duration-150 group-hover:opacity-100">
        {tooltip}
      </div>
      <div className="w-[70px] text-[13px] font-semibold text-slate-700">{name}</div>
      <div className="relative h-[14px] flex-1 overflow-hidden rounded-full bg-slate-100 shadow-inner">
        <div
          className={cx( `absolute top-0 left-0 h-full rounded-full transition-all duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)]`, finalColorClass )}
          style={{ width: `${width}%`, ...finalStyle }}
        />
      </div>
      <div className="w-[48px] text-right text-[13.5px] font-bold tabular-nums text-slate-800">
        {value.toFixed( 1 )}%
      </div>
    </div>
  );
}

function BarChartCard ( { title, data, colorClass, customStyle, kind, animate } ) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
      <h3 className="mb-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-600/90">{title}</h3>
      {data.length === 0 ? (
        <div className="py-5 text-center text-[13px] text-slate-500">No setter stats for this month yet.</div>
      ) : (
        <div className="flex flex-col gap-1">
          {data.map( ( item, idx ) => (
            <BarChartRow
              key={`${item.id || item.name}-${kind}`}
              name={item.name}
              value={item.value}
              colorClass={colorClass}
              customStyle={customStyle}
              delayMs={100 + idx * 100}
              animate={animate}
              tooltip={item.tooltip}
            />
          ) )}
        </div>
      )}
    </div>
  );
}

export default function Setter () {
  const [ loading, setLoading ] = useState( true );
  const [ errorMsg, setErrorMsg ] = useState( "" );
  const [ animateBars, setAnimateBars ] = useState( false );
  const [ rows, setRows ] = useState( [] );
  const [ range, setRange ] = useState( "mtd" );

  useEffect( () => {
    let cancelled = false;

    async function load () {
      setLoading( true );
      setErrorMsg( "" );
      try {
        const { startISO, endISO } = getSnapshotRange( range );

        const [ settersRes, callsRes ] = await Promise.all( [
          supabase.from( "setters" ).select( "id, name" ).eq( "active", true ).order( "name", { ascending: true } ),
          supabase
            .from( "calls" )
            .select( "setter_id, confirmed, showed_up, cancelled, call_date" )
            .not( "setter_id", "is", null )
            .not( "call_date", "is", null )
            .gte( "call_date", startISO )
            .lte( "call_date", endISO ),
        ] );

        if ( settersRes.error ) throw settersRes.error;
        if ( callsRes.error ) throw callsRes.error;

        const bySetter = new Map();
        for ( const s of settersRes.data || [] ) {
          bySetter.set( String( s.id ), {
            id: s.id,
            name: s.name || `Setter ${s.id}`,
            booked: 0,
            confirmed: 0,
            showed: 0,
          } );
        }

        for ( const c of callsRes.data || [] ) {
          if ( c?.cancelled === true ) continue;
          const sid = String( c?.setter_id || "" );
          const cur = bySetter.get( sid );
          if ( !cur ) continue;
          cur.booked += 1;
          if ( c?.confirmed === true ) cur.confirmed += 1;
          if ( c?.showed_up === true ) cur.showed += 1;
        }

        const nextRows = Array.from( bySetter.values() ).map( ( r ) => ( {
          ...r,
          pickupRate: pct( r.confirmed, r.booked ),
          showUpRate: pct( r.showed, r.confirmed ),
        } ) );

        if ( cancelled ) return;
        setRows( nextRows );
      } catch ( e ) {
        if ( cancelled ) return;
        setRows( [] );
        setErrorMsg( e?.message || "Failed to load setter snapshot" );
      } finally {
        if ( !cancelled ) setLoading( false );
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [ range ] );

  const rangeLabel = useMemo( () => getSnapshotRange( range ).label, [ range ] );

  const pickupData = useMemo(
    () =>
      [ ...rows ]
        .sort( ( a, b ) => b.pickupRate - a.pickupRate || a.name.localeCompare( b.name ) )
        .map( ( r ) => ( {
          id: r.id,
          name: r.name,
          value: r.pickupRate,
          tooltip: `${r.name}: ${r.confirmed} / ${r.booked} confirmed`,
        } ) ),
    [ rows ],
  );

  const showupData = useMemo(
    () =>
      [ ...rows ]
        .sort( ( a, b ) => b.showUpRate - a.showUpRate || a.name.localeCompare( b.name ) )
        .map( ( r ) => ( {
          id: r.id,
          name: r.name,
          value: r.showUpRate,
          tooltip: `${r.name}: ${r.showed} / ${r.confirmed} showed up`,
        } ) ),
    [ rows ],
  );

  useEffect( () => {
    if ( loading ) return;
    setAnimateBars( false );
    const id = requestAnimationFrame( () => {
      requestAnimationFrame( () => setAnimateBars( true ) );
    } );
    return () => cancelAnimationFrame( id );
  }, [ loading, rows.length ] );

  return (
    <div className="w-full max-w-[1400px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col items-start gap-1">
          <h2 className="text-[20px] font-bold tracking-tight text-[#0f172a]">Setter performance snapshot</h2>
          <p className="text-[12px] font-medium text-slate-500">{rangeLabel} · live from database</p>
        </div>
        <div className="w-full max-w-[190px]">
          <SegmentedTabs
            items={TIME_RANGE_ITEMS}
            activeId={range}
            onChange={setRange}
            size="xs"
            className="border-slate-200/90 bg-slate-100/80 [&>button+button]:ml-1.5"
            activeClassName="!bg-sky-100 !text-blue-700 !ring-sky-200/80"
          />
        </div>
      </div>

      {errorMsg ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800">
          {errorMsg}
        </div>
      ) : null}

      <div className="relative mt-5">
        <div className="rounded-[16px] border-[2px] border-dashed border-slate-300/80 bg-slate-50/50 p-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {loading ? (
              <>
                <SetterBarsShimmer />
                <SetterBarsShimmer />
              </>
            ) : (
              <>
                <BarChartCard
                  title="Pick-up rate by setter"
                  data={pickupData}
                  kind="pickup"
                  animate={animateBars}
                  colorClass={( val ) => {
                    const color = getConfirmationColor( val );
                    return `shadow-[inset_0_-2px_4px_rgba(0,0,0,0.1),0_2px_8px_${color}40]`;
                  }}
                  customStyle={( val ) => ( { backgroundColor: getConfirmationColor( val ) } )}
                />
                <BarChartCard
                  title="Show-up rate by setter"
                  data={showupData}
                  kind="showup"
                  animate={animateBars}
                  colorClass={( val ) => {
                    const color = getShowUpColor( val );
                    return `shadow-[inset_0_-2px_4px_rgba(0,0,0,0.1),0_2px_8px_${color}40]`;
                  }}
                  customStyle={( val ) => ( { backgroundColor: getShowUpColor( val ) } )}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
