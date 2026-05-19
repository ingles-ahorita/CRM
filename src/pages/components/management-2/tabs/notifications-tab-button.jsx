import { Bell } from "lucide-react";
import { usePlatformEventsBadge } from "../../../../hooks/usePlatformEventsBadge";

function cx(...c) {
  return c.filter(Boolean).join(" ");
}

/**
 * Icon-only notifications control (sits beside main SegmentedTabs).
 */
export default function NotificationsTabButton({ active, onClick }) {
  const { unreadCount } = usePlatformEventsBadge({ enabled: !active, pollMs: 45_000 });

  const tooltip =
    unreadCount > 0
      ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
      : "Notifications";

  return (
    <button
      type="button"
      title={tooltip}
      aria-label={tooltip}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={cx(
        "relative inline-flex h-auto w-[40px] shrink-0 items-center justify-center rounded-lg font-semibold transition-all duration-200 select-none",
        "border border-slate-200/80 bg-slate-100/70 shadow-inner",
        "focus-visible:ring-2 focus-visible:ring-indigo-400/60 !outline-none",
        active
          ? "!bg-white text-indigo-700 shadow-[0_1px_3px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/80"
          : "text-slate-600 hover:bg-white/70 hover:text-slate-900",
      )}
    >
      <Bell className="h-6 w-6 opacity-80 shrink-0" strokeWidth={2} aria-hidden />
      {unreadCount > 0 ? (
        <span
          className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-0.5 text-[9px] font-extrabold leading-none text-white ring-2 ring-white tabular-nums"
          aria-hidden
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </button>
  );
}
