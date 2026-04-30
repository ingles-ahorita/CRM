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
}) {
  const sizeClasses =
    size === "sm"
      ? "px-3 py-1.5 text-[12px]"
      : "px-5 py-2 text-[13.5px]";

  return (
    <div
      className={cx(
        "inline-flex rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 gap-0.5 shadow-inner",
        className,
      )}
    >
      {items.map((item) => {
        const id = item?.id ?? item?.label;
        const label = item?.label ?? String(id ?? "");
        const isActive = id === activeId;

        return (
          <button
            key={String(id)}
            onClick={() => onChange?.(id)}
            aria-current={isActive ? "page" : undefined}
            className={cx(
              "relative rounded-lg font-semibold transition-all duration-200 select-none",
              "focus-visible:ring-2 focus-visible:ring-indigo-400/60 !outline-none bg-slate-100/70",
              sizeClasses,
              isActive
                ? "!bg-white text-indigo-700 shadow-[0_1px_4px_rgba(15,23,42,0.10)]"
                : "text-slate-500 hover:text-slate-800 hover:bg-white/60",
              activeClassName && isActive ? activeClassName : "",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
