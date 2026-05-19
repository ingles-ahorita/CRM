import { useMemo, useCallback } from "react";
import { Bell } from "lucide-react";
import SegmentedTabs from "../segmented-tabs";
import NotificationsTabButton from "./notifications-tab-button";
import { useTodayNewLeadsCount } from "../../../../hooks/useTodayNewLeadsCount";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "leads", label: "Leads" },
  { id: "closer", label: "Closers" },
  { id: "setter", label: "Setters" },
  { id: "metrics", label: "Metrics" },
  { id: "sales", label: "Sales" },
  { id: "performance", label: "Performance" },
  { id: "organic", label: "Organic Stats" },
];

function cx(...c) {
  return c.filter(Boolean).join(" ");
}

export default function Tabs({ activeTab, onTabChange }) {
  const todayBookedStats = useTodayNewLeadsCount();
  const handleNotificationsClick = useCallback(() => {
    onTabChange?.("notifications");
  }, [onTabChange]);

  const items = useMemo(
    () =>
      TABS.map((t) => {
        if (t.id !== "leads") return t;
        const trailing =
          todayBookedStats == null ? null : (
            <span
              className={cx(
                "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums leading-none shadow-sm ring-1 ring-inset",
                todayBookedStats.booked > todayBookedStats.confirmed
                  ? "bg-red-600 text-white ring-red-700/30"
                  : "bg-slate-200/90 text-slate-600 ring-slate-400/20",
              )}
              title={`${todayBookedStats.booked} booked today (book date), ${todayBookedStats.confirmed} confirmed`}
              aria-label={`${todayBookedStats.booked} booked today by book date, ${todayBookedStats.confirmed} confirmed`}
            >
              <Bell className="h-3 w-3 shrink-0 opacity-95" strokeWidth={2.5} aria-hidden />
              {todayBookedStats.booked}/{todayBookedStats.confirmed}
            </span>
          );
        return { ...t, trailing };
      }),
    [todayBookedStats],
  );

  const segmentedActiveId = activeTab === "notifications" ? null : activeTab;

  return (
    <div className="flex max-w-full flex-nowrap items-stretch gap-1.5">
      <SegmentedTabs
        items={items}
        activeId={segmentedActiveId}
        onChange={onTabChange}
        tabInline
        className="min-w-0 flex-1"
      />
      <NotificationsTabButton
        active={activeTab === "notifications"}
        onClick={handleNotificationsClick}
      />
    </div>
  );
}
