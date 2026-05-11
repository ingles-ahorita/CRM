import { useEffect, useRef, useState } from "react";
import {
  Instagram,
  Link,
  Monitor,
  Search,
  Smartphone,
  Target,
  TrendingDown,
  TrendingUp,
  Youtube,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import WorldMap from "react-svg-worldmap";

const TOP_LINE_CARDS = [
  {
    label: "Website views",
    value: "48,210",
    valueClass: "text-blue-600",
    badge: "▲ 12% vs prior 30d",
    badgeClass: "bg-emerald-100 text-emerald-700",
    note: "Unique visitors: 31,440",
  },
  {
    label: "VSL watched",
    value: "15,420",
    valueClass: "text-indigo-600",
    badge: "▲ 5.2%",
    badgeClass: "bg-emerald-100 text-emerald-700",
    note: "Watch rate: 32% of views",
  },
  {
    label: "Opt-ins",
    value: "3,124",
    valueClass: "text-violet-600",
    badge: "▲ 8.4%",
    badgeClass: "bg-emerald-100 text-emerald-700",
    note: "Opt-in rate: 6.5%",
  },
  {
    label: "Bookings",
    value: "412",
    valueClass: "text-amber-600",
    badge: "▲ 4%",
    badgeClass: "bg-emerald-100 text-emerald-700",
    note: "Book rate: 13.2% of opt-ins",
  },
  {
    label: "Show + close",
    value: "38",
    valueClass: "text-emerald-600",
    badge: "▼ 9%",
    badgeClass: "bg-red-100 text-red-600",
    note: "$23,440 closed revenue",
  },
];

const COUNTRY_ROWS = [
  {
    code: "MX",
    country: "Mexico",
    views: "18,420 views",
    width: 100,
    optIns: "1,284",
    optRate: "7.0%",
    optClass: "text-emerald-600",
    bookings: "168",
    bookRate: "13.1%",
    bookClass: "text-emerald-600",
    revenue: "$9,240",
  },
  {
    code: "US",
    country: "United States",
    views: "13,290 views",
    width: 72,
    optIns: "912",
    optRate: "6.9%",
    optClass: "text-emerald-600",
    bookings: "132",
    bookRate: "14.5%",
    bookClass: "text-emerald-600",
    revenue: "$8,820",
  },
  {
    code: "CO",
    country: "Colombia",
    views: "7,710 views",
    width: 42,
    optIns: "492",
    optRate: "6.4%",
    optClass: "text-emerald-600",
    bookings: "52",
    bookRate: "10.6%",
    bookClass: "text-amber-600",
    revenue: "$2,180",
  },
  {
    code: "EC",
    country: "Ecuador",
    views: "4,410 views",
    width: 24,
    optIns: "284",
    optRate: "6.4%",
    optClass: "text-amber-600",
    bookings: "34",
    bookRate: "12.0%",
    bookClass: "text-emerald-600",
    revenue: "$1,640",
  },
  {
    code: "AR",
    country: "Argentina",
    views: "2,510 views",
    width: 14,
    optIns: "148",
    optRate: "5.9%",
    optClass: "text-amber-600",
    bookings: "16",
    bookRate: "10.8%",
    bookClass: "text-red-500",
    revenue: "$760",
  },
  {
    code: "ES",
    country: "Spain",
    views: "1,640 views",
    width: 9,
    optIns: "104",
    optRate: "6.3%",
    optClass: "text-amber-600",
    bookings: "10",
    bookRate: "9.6%",
    bookClass: "text-red-500",
    revenue: "$520",
  },
  {
    code: "BR",
    country: "Brazil",
    views: "21,340 views",
    width: 116,
    optIns: "1,322",
    optRate: "6.2%",
    optClass: "text-amber-600",
    bookings: "141",
    bookRate: "10.7%",
    bookClass: "text-amber-600",
    revenue: "$6,920",
  },
  {
    code: "OTHER",
    country: "Other (12)",
    views: "230 views",
    width: 1,
    optIns: "—",
    optRate: "",
    bookings: "—",
    bookRate: "",
    revenue: "$280",
  },
];

const WORLD_MAP_DATA = COUNTRY_ROWS.filter( ( row ) => row.code !== "OTHER" ).map( ( row ) => ( {
  country: row.code.toLowerCase(),
  value: Number( row.views.replace( /[^0-9]/g, "" ) ),
} ) );

const COUNTRY_NAME_LOOKUP = COUNTRY_ROWS.reduce( ( lookup, row ) => {
  lookup[ row.country ] = row;
  return lookup;
}, {} );

const MAP_VIEW_RANGES = [
  { label: "<5k", color: "#bfdbfe" },
  { label: "5-10k", color: "#93c5fd" },
  { label: "10-20k", color: "#60a5fa" },
  { label: "20k+", color: "#2563eb" },
];

const COUNTRY_FLAGS = {
  AR: "🇦🇷",
  BR: "🇧🇷",
  CO: "🇨🇴",
  EC: "🇪🇨",
  ES: "🇪🇸",
  MX: "🇲🇽",
  OTHER: "🌐",
  US: "🇺🇸",
};

const BEST_COUNTRIES = [
  [ "🇺🇸 USA", "14.5% book rate · highest AOV" ],
  [ "🇲🇽 Mexico", "13.1% book rate · highest volume" ],
  [ "🇪🇨 Ecuador", "12.0% book rate · low cost/lead" ],
];

const UNDERPERFORMING_COUNTRIES = [
  [ "🇪🇸 Spain", "9.6% book · low show-up" ],
  [ "🇦🇷 Argentina", "10.8% book · payment friction" ],
  [ "🇨🇴 Colombia", "10.6% book · weak follow-up" ],
];

const TRAFFIC_SOURCES = [
  {
    Icon: Instagram,
    name: "Instagram (Organic)",
    meta: "21,440 views · 1,420 opt-ins · 6.6% conv",
    revenue: "$8,940",
  },
  {
    Icon: Youtube,
    name: "YouTube (Organic)",
    meta: "12,820 views · 940 opt-ins · 7.3% conv",
    revenue: "$6,210",
  },
  {
    Icon: Target,
    name: "Meta Ads",
    meta: "8,510 views · 510 opt-ins · 6.0% conv",
    revenue: "$4,840",
  },
  {
    Icon: Search,
    name: "Google Ads",
    meta: "3,210 views · 198 opt-ins · 6.2% conv",
    revenue: "$2,180",
  },
  {
    Icon: Link,
    name: "Direct / Referral",
    meta: "2,230 views · 56 opt-ins · 2.5% conv",
    revenue: "$1,270",
  },
];

const FUNNEL_DRILLDOWN_ROWS = [
  {
    code: "MX",
    country: "Mexico",
    viewsToOptIn: "7.0%",
    optIns: "1,284",
    optInToBook: "13.1%",
    bookings: "168",
    bookToShow: "62%",
    shows: "104",
    showToClose: "14%",
    closes: "15",
    endToEnd: "0.080%",
    endClass: "bg-emerald-100 text-emerald-700",
    aov: "$615",
  },
  {
    code: "US",
    country: "USA",
    viewsToOptIn: "6.9%",
    optIns: "912",
    optInToBook: "14.5%",
    bookings: "132",
    bookToShow: "68%",
    shows: "90",
    showToClose: "16%",
    closes: "14",
    endToEnd: "0.109%",
    endClass: "bg-emerald-100 text-emerald-700",
    aov: "$735",
  },
  {
    code: "CO",
    country: "Colombia",
    viewsToOptIn: "6.4%",
    optIns: "492",
    optInToBook: "10.6%",
    bookings: "52",
    bookToShow: "54%",
    shows: "28",
    showToClose: "11%",
    closes: "3",
    endToEnd: "0.040%",
    endClass: "bg-amber-100 text-amber-700",
    aov: "$485",
  },
  {
    code: "EC",
    country: "Ecuador",
    viewsToOptIn: "6.4%",
    optIns: "284",
    optInToBook: "12.0%",
    bookings: "34",
    bookToShow: "58%",
    shows: "20",
    showToClose: "12%",
    closes: "2",
    endToEnd: "0.054%",
    endClass: "bg-amber-100 text-amber-700",
    aov: "$510",
  },
  {
    code: "AR",
    country: "Argentina",
    viewsToOptIn: "5.9%",
    optIns: "148",
    optInToBook: "10.8%",
    bookings: "16",
    bookToShow: "48%",
    shows: "8",
    showToClose: "9%",
    closes: "1",
    endToEnd: "0.028%",
    endClass: "bg-red-100 text-red-600",
    aov: "$420",
  },
  {
    code: "ES",
    country: "Spain",
    viewsToOptIn: "6.3%",
    optIns: "104",
    optInToBook: "9.6%",
    bookings: "10",
    bookToShow: "44%",
    shows: "4",
    showToClose: "8%",
    closes: "1",
    endToEnd: "0.021%",
    endClass: "bg-red-100 text-red-600",
    aov: "$510",
  },
];

const LANDING_PAGES = [
  [ "/vsl-mexico", "8.2% conv" ],
  [ "/vsl-usa", "7.4% conv" ],
  [ "/free-class", "5.8% conv" ],
  [ "/blog/aprender-ingles", "3.1% conv" ],
];

function cx ( ...classes ) {
  return classes.filter( Boolean ).join( " " );
}

function SectionBadge ( { children } ) {
  return (
    <span className="inline-flex h-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white px-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 shadow-sm">
      {children}
    </span>
  );
}

function TopLineCard ( { card } ) {
  return (
    <article className="min-w-0 rounded-xl border border-slate-200 bg-white px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {card.label}
      </p>
      <div className={cx( "mt-1.5 text-[21px] font-semibold leading-none tracking-normal", card.valueClass )}>
        {card.value}
      </div>
      <div className="mt-1">
        <span className={cx( "inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-none", card.badgeClass )}>
          {card.badge}
        </span>
      </div>
      <p className="mt-1 truncate text-[10px] font-medium text-slate-500" title={card.note}>{card.note}</p>
    </article>
  );
}

function TopLineSection () {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-2">
      <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <h1 className="text-[16px] font-semibold tracking-normal text-slate-950">
          Global Performance
        </h1>
        <p className="shrink-0 text-[11px] font-medium text-slate-500">
          Last 30 days
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {TOP_LINE_CARDS.map( ( card ) => (
          <TopLineCard key={card.label} card={card} />
        ) )}
      </div>
    </section>
  );
}

function countryMapStyle ( { countryValue } ) {
  if ( typeof countryValue === "undefined" ) {
    return {
      fill: "#e2e8f0",
      fillOpacity: 0.82,
      stroke: "#cbd5e1",
      strokeOpacity: 0.92,
      strokeWidth: 0.85,
      cursor: "pointer",
    };
  }

  const fill =
    countryValue < 5000
      ? "#bfdbfe"
      : countryValue < 10000
        ? "#93c5fd"
        : countryValue < 20000
          ? "#60a5fa"
          : "#2563eb";

  return {
    fill,
    fillOpacity: 0.95,
    stroke: "#ffffff",
    strokeOpacity: 1,
    strokeWidth: 0.9,
    cursor: "pointer",
  };
}

function CountryTable () {
  const [ mapTooltip, setMapTooltip ] = useState( null );
  const [ mapZoom, setMapZoom ] = useState( 1 );
  const [ mapPan, setMapPan ] = useState( { x: 0, y: 0 } );
  const mapRef = useRef( null );
  const mapDragRef = useRef( null );

  useEffect( () => {
    const mapElement = mapRef.current;

    if ( !mapElement ) return;

    const prepareMapPaths = () => {
      mapElement.querySelectorAll( "path" ).forEach( ( path ) => {
        const title = path.querySelector( "title" );

        if ( title?.textContent ) {
          path.dataset.countryName = title.textContent;
        }

        path.removeAttribute( "role" );
        path.removeAttribute( "tabindex" );
        path.removeAttribute( "aria-label" );
      } );

      mapElement.querySelectorAll( "title" ).forEach( ( title ) => {
        title.remove();
      } );
    };

    prepareMapPaths();
    const frameId = requestAnimationFrame( prepareMapPaths );

    return () => cancelAnimationFrame( frameId );
  }, [] );

  const handleMapPointerMove = ( event ) => {
    if ( mapDragRef.current ) {
      const { startPan, startX, startY } = mapDragRef.current;

      setMapPan( {
        x: startPan.x + event.clientX - startX,
        y: startPan.y + event.clientY - startY,
      } );
    }

    const countryName = event.target?.closest?.( "path" )?.dataset?.countryName;

    if ( !countryName ) {
      setMapTooltip( null );
      return;
    }

    const row = COUNTRY_NAME_LOOKUP[ countryName ];
    const rect = event.currentTarget.getBoundingClientRect();

    setMapTooltip( {
      countryName,
      containerWidth: rect.width,
      row,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    } );
  };

  const handleMapPointerDown = ( event ) => {
    if ( event.target.closest( "button" ) ) return;

    mapDragRef.current = {
      startPan: mapPan,
      startX: event.clientX,
      startY: event.clientY,
    };

    event.currentTarget.setPointerCapture?.( event.pointerId );
  };

  const stopMapDrag = () => {
    mapDragRef.current = null;
  };

  const changeMapZoom = ( amount ) => {
    setMapZoom( ( currentZoom ) => {
      const nextZoom = Math.min( 2.5, Math.max( 1, Number( ( currentZoom + amount ).toFixed( 2 ) ) ) );

      if ( nextZoom === 1 ) {
        setMapPan( { x: 0, y: 0 } );
      }

      return nextZoom;
    } );
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[18px] font-semibold leading-tight tracking-normal text-slate-950">
            Performance by Country — Geographic Breakdown
          </h2>
          <p className="mt-2 text-[12px] font-medium italic text-slate-500">
            This is the core view — tells us WHERE to spend ad-dollars next month and WHICH countries to expand into.
          </p>
        </div>
        <SectionBadge>Targeting Intelligence</SectionBadge>
      </div>

      <div className="mt-3 grid items-stretch gap-3">
        <div className="grid min-w-0 items-stretch gap-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)] xl:grid-cols-[minmax(0,1fr)_220px] 2xl:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex h-full min-w-0 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Website Views by Country
                </h3>
                <p className="mt-1 text-[12px] font-medium text-slate-500">
                  Hover the map for country-level website views.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                {MAP_VIEW_RANGES.map( ( range ) => (
                  <span key={range.label} className="flex items-center gap-1.5">
                    <span
                      className="inline-flex h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: range.color }}
                    />
                    {range.label}
                  </span>
                ) )}
              </div>
            </div>

            <div
              ref={mapRef}
              className={cx(
                "relative mt-2 flex flex-1 items-center overflow-hidden",
                mapDragRef.current ? "cursor-grabbing" : "cursor-grab",
              )}
              onPointerDown={handleMapPointerDown}
              onPointerMove={handleMapPointerMove}
              onPointerUp={stopMapDrag}
              onPointerCancel={stopMapDrag}
              onMouseLeave={() => {
                stopMapDrag();
                setMapTooltip( null );
              }}
            >
              <div
                className="h-full min-h-[218px] w-full"
                style={{
                  transform: `translate(${mapPan.x}px, ${mapPan.y}px) scale(${mapZoom})`,
                  transformOrigin: "center",
                  transition: mapDragRef.current ? "none" : "transform 160ms ease-out",
                }}
              >
                <WorldMap
                  backgroundColor="transparent"
                  borderColor="#cbd5e1"
                  color="#2563eb"
                  data={WORLD_MAP_DATA}
                  containerClassName="management-country-map h-full w-full"
                  regionClassName="management-country-map-region"
                  size="responsive"
                  strokeOpacity={1}
                  styleFunction={countryMapStyle}
                  tooltipTextFunction={() => undefined}
                />
              </div>
              <div className="absolute right-2 top-2 z-10 flex overflow-hidden rounded-lg border border-slate-200 !bg-white shadow-sm">
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center border-0 !bg-white p-0 !text-slate-600 shadow-none transition hover:!bg-slate-50 hover:!text-blue-600 disabled:!bg-white disabled:!text-slate-300"
                  disabled={mapZoom >= 2.5}
                  onPointerDown={( event ) => event.stopPropagation()}
                  onClick={( event ) => {
                    event.stopPropagation();
                    changeMapZoom( 0.5 );
                  }}
                  title="Zoom in"
                >
                  <ZoomIn className="h-3.5 w-3.5" strokeWidth={2.4} />
                </button>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center border-0 border-l border-slate-200 !bg-white p-0 !text-slate-600 shadow-none transition hover:!bg-slate-50 hover:!text-blue-600 disabled:!bg-white disabled:!text-slate-300"
                  disabled={mapZoom <= 1}
                  onPointerDown={( event ) => event.stopPropagation()}
                  onClick={( event ) => {
                    event.stopPropagation();
                    changeMapZoom( -0.5 );
                  }}
                  title="Zoom out"
                >
                  <ZoomOut className="h-3.5 w-3.5" strokeWidth={2.4} />
                </button>
              </div>
              {mapTooltip ? (
                <div
                  className="pointer-events-none absolute z-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-700 shadow-lg"
                  style={{
                    left: Math.min( mapTooltip.x + 12, Math.max( mapTooltip.containerWidth - 150, 8 ) ),
                    top: Math.max( mapTooltip.y - 38, 8 ),
                  }}
                >
                  <div className="font-bold text-slate-950">
                    {mapTooltip.row?.country || mapTooltip.countryName}
                  </div>
                  {mapTooltip.row ? (
                    <div className="mt-0.5 text-blue-600">{mapTooltip.row.views}</div>
                  ) : (
                    <div className="mt-0.5 text-red-500">No views</div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex min-w-0 flex-col">
            <div className="grid grid-cols-[minmax(0,1fr)_92px] items-center gap-3 border-b border-dashed border-slate-200 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              <div>Country</div>
              <div className="text-right">Views</div>
            </div>

            <div className="divide-y divide-dashed divide-slate-100">
              {COUNTRY_ROWS.map( ( row ) => (
                <div
                  key={row.country}
                  className="grid grid-cols-[minmax(0,1fr)_92px] items-center gap-3 py-1.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-[13px] font-medium text-slate-700" title={row.country}>
                        <span className="mr-1.5 text-[13px]" aria-hidden="true">
                          {COUNTRY_FLAGS[ row.code ]}
                        </span>
                        <span>{row.country}</span>
                      </span>
                    </div>
                    <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${Math.min( row.width, 100 )}%` }}
                      />
                    </div>
                  </div>

                  <div className="text-right text-[13px] font-semibold text-slate-950">
                    {row.views.replace( " views", "" )}
                  </div>
                </div>
              ) )}
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}

function CountryInsights () {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3">
      <CountryInsightCard
        title="Best-Performing Countries"
        Icon={TrendingUp}
        rows={BEST_COUNTRIES}
        action="Increase ad-spend in MX & US — they convert + have highest revenue."
        tone="good"
      />
      <CountryInsightCard
        title="Under-Performing Countries"
        Icon={TrendingDown}
        rows={UNDERPERFORMING_COUNTRIES}
        action="Pause cold-traffic ads in AR/ES until landing page is localized."
        tone="bad"
      />
    </div>
  );
}

function CountryInsightCard ( { title, Icon, rows, action, tone } ) {
  const isGood = tone === "good";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <h3 className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
        {Icon ? <Icon className="mr-1 inline h-3.5 w-3.5 align-[-2px]" strokeWidth={2.2} /> : null}
        {title}
      </h3>

      <div className="mt-2 divide-y divide-dashed divide-slate-100">
        {rows.map( ( [ country, detail ] ) => (
          <div key={country} className="flex items-center justify-between gap-3 py-1.5">
            <span className="text-[12px] font-medium text-slate-700">{country}</span>
            <span className="text-right text-[12px] font-semibold text-slate-950">{detail}</span>
          </div>
        ) )}
      </div>

      <div
        className={cx(
          "mt-2 rounded-md px-2.5 py-2 text-[11px] font-medium",
          isGood ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700",
        )}
      >
        <span className="font-semibold">Action:</span> {action}
      </div>
    </section>
  );
}

function TrafficSources () {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="mb-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <h2 className="text-[16px] font-semibold tracking-normal text-slate-950">
          Traffic Sources
        </h2>
        <p className="mt-1 text-[11px] font-medium text-slate-500">
          Channel performance
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          Top sources · last 30 days
        </h3>

        <div className="mt-2 divide-y divide-dashed divide-slate-100">
          {TRAFFIC_SOURCES.map( ( source ) => (
            <div key={source.name} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 py-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-50">
                <source.Icon className="h-4 w-4 text-indigo-600" strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="truncate text-[12px] font-semibold text-slate-950">
                    {source.name}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="mt-0.5 truncate text-[10px] font-medium text-slate-500" title={source.meta}>
                    {source.meta}
                  </div>
                </div>
              </div>
              <div className="text-right text-[12px] font-semibold text-slate-950">
                {source.revenue}
              </div>
            </div>
          ) )}
        </div>
      </div>
    </section>
  );
}

function FunnelDrilldown () {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[18px] font-semibold leading-tight tracking-normal text-slate-950">
          Funnel Performance by Country (Drill-down)
        </h2>
        <SectionBadge>Conversion Comparison</SectionBadge>
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
        <div className="grid grid-cols-[100px_repeat(4,minmax(80px,1fr))_64px_58px] items-end gap-2 border-b border-slate-200 pb-3 text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-500">
          <div>Country</div>
          <div className=" leading-tight">
            <span className="block">Views</span>
            <span className="ml-3 block">↓</span>
            <span className="block">Opt-in</span>
          </div>
          <div className=" leading-tight">
            <span className="block">Opt-in</span>
            <span className="ml-3 block">↓</span>
            <span className="block">Book</span>
          </div>
          <div className=" leading-tight">
            <span className="block">Book</span>
            <span className="ml-3 block">↓</span>
            <span className="block">Show</span>
          </div>
          <div className=" leading-tight">
            <span className="block">Show</span>
            <span className="ml-3 block">↓</span>
            <span className="block">Close</span>
          </div>
          <div className=" leading-tight">
            <span className="block">End</span>
            <span className="block">to end</span>
          </div>
          <div className="">Avg AOV</div>
        </div>

        <div className="divide-y divide-slate-100">
          {FUNNEL_DRILLDOWN_ROWS.map( ( row ) => (
            <div
              key={row.country}
              className="grid grid-cols-[100px_repeat(4,minmax(80px,1fr))_64px_58px] items-center gap-2 py-3"
            >
              <div className="min-w-0 truncate text-[11px] font-medium text-slate-700">
                <span className="mr-1.5 text-[12px]" aria-hidden="true">
                  {COUNTRY_FLAGS[ row.code ]}
                </span>
                {row.country}
              </div>
              <div className="text-[11px] font-medium text-slate-700 tabular-nums">
                {row.optIns}({row.viewsToOptIn})
              </div>
              <div className="text-[11px] font-medium text-slate-700 tabular-nums">
                {row.bookings}({row.optInToBook})
              </div>
              <div className="text-[11px] font-medium text-slate-700 tabular-nums">
                {row.shows}({row.bookToShow})
              </div>
              <div className="text-[11px] font-medium text-slate-700 tabular-nums">
                {row.closes}({row.showToClose})
              </div>
              <div>
                <span className={cx( "inline-flex rounded-full px-1.5 py-1 text-[9px] font-semibold", row.endClass )}>
                  {row.endToEnd}
                </span>
              </div>
              <div className="text-[11px] font-medium text-slate-700">{row.aov}</div>
            </div>
          ) )}
        </div>
      </div>
    </section>
  );
}

function DevicePagePerformance () {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-2">
      <div className="mb-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <h2 className="text-[18px] font-semibold tracking-normal text-slate-950">
          Device &amp; Page Performance
        </h2>
        <p className="mt-1 text-[12px] font-medium text-slate-500">
          UX signals
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <section className="rounded-xl border border-slate-200 bg-white p-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Device Split
          </h3>
          <div className="mt-3 flex h-8 overflow-hidden rounded-md bg-slate-100">
            <div className="flex h-full w-[66%] min-w-0 items-center justify-center bg-blue-600 px-2 text-[11px] font-semibold text-white">
              <Smartphone className="mr-1 h-3.5 w-3.5" strokeWidth={2.3} />
              Mobile 70%
            </div>
            <div className="flex h-full w-[25%] min-w-0 items-center justify-center bg-violet-600 px-1.5 text-[11px] font-semibold text-white">
              <Monitor className="mr-1 h-3.5 w-3.5" strokeWidth={2.3} />
              Desktop 24%
            </div>
            <div className="flex h-full w-[9%] min-w-[32px] items-center justify-center bg-slate-400 px-1 text-[10px] font-semibold text-white">
              6%
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] font-medium text-slate-500">
            <span>Mobile opt-in: <span className="font-semibold text-slate-700">7.1%</span></span>
            <span>Desktop: <span className="font-semibold text-slate-700">4.8%</span></span>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Top Landing Pages
          </h3>
          <div className="mt-3 divide-y divide-dashed divide-slate-100">
            {LANDING_PAGES.map( ( [ page, value ] ) => (
              <div key={page} className="flex items-center justify-between gap-4 py-2">
                <span className="truncate text-[13px] font-medium text-slate-700">{page}</span>
                <span className="shrink-0 text-[13px] font-semibold text-slate-950">{value}</span>
              </div>
            ) )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Avg Time on Page
          </h3>
          <div className="mt-3 text-[28px] font-semibold leading-none text-blue-600">
            3:42
          </div>
          <p className="mt-2 text-[12px] font-medium text-slate-500">
            VSL completion: 41%
          </p>
          <div className="mt-3">
            <span className="inline-flex rounded-md bg-emerald-100 px-2 py-1 text-[11px] font-semibold leading-none text-emerald-700">
              ▲ +0:18 vs last month
            </span>
          </div>
        </section>
      </div>
    </section>
  );
}

export default function Performance () {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-8 gap-2">
        <div className="col-span-2 flex flex-col gap-3">
          <TopLineSection />
          <DevicePagePerformance />
        </div>

        <div className="col-span-4 flex flex-col gap-3">
          <CountryTable />
          <div className="">
            <FunnelDrilldown />
          </div>
        </div>

        <div className="col-span-2 flex flex-col gap-3">
          <TrafficSources />
          <CountryInsights />
        </div>
      </div>
    </div>
  );
}
