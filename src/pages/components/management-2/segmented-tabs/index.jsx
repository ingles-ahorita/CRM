function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function SegmentedTabs({
  items = [],
  activeId,
  onChange,
  size = "md",
  className = "",
  activeClassName = "",
  /** When true, tab buttons use inline-flex so labels + trailing badges align */
  tabInline = false,
  /** When true, bar shrinks to content width instead of stretching full width */
  fit = false,
}) {
  const sizeClasses =
    size === "xs"
      ? "px-2 py-0.5 text-[11px] leading-tight"
      : size === "sm"
        ? "px-2.5 py-1 text-[11px] leading-tight"
        : "px-5 py-2 text-[13.5px]";

  const rounding = size === "xs" ? "rounded-md" : "rounded-lg";

  return (
    <div
      className={cx(
        "flex flex-nowrap items-stretch border border-slate-200/80 bg-slate-100/70 p-0.5 gap-0.5 shadow-inner",
        fit ? "w-fit max-w-full" : "max-w-full !w-full justify-between",
        rounding,
        className,
      )}
    >
      {items.map((item) => {
        const id = item?.id ?? item?.label;
        const label = item?.label ?? String(id ?? "");
        const title = item?.title ?? label;
        const isActive = id === activeId;

        const trailing = item?.trailing;

        return (
          <button
            key={String(id)}
            type="button"
            title={title}
            onClick={() => onChange?.(id)}
            aria-current={isActive ? "page" : undefined}
            className={cx(
              "relative shrink-0 font-semibold transition-all duration-200 select-none",
              tabInline && "inline-flex items-center justify-center gap-0",
              rounding,
              "focus-visible:ring-2 focus-visible:ring-indigo-400/60 !outline-none bg-slate-100/70",
              sizeClasses,
              isActive
                ? "!bg-white text-indigo-700 shadow-[0_1px_3px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/80"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/70",
              activeClassName && isActive ? activeClassName : "",
            )}
          >
            <span className={cx(trailing && "inline-flex items-center gap-1.5")}>
              <span>{label}</span>
              {trailing}
            </span>
          </button>
        );
      })}
    </div>
  );
}