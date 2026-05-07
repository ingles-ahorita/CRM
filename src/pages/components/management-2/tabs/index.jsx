import { useMemo } from "react";
import { Bell } from "lucide-react";
import SegmentedTabs from "../segmented-tabs";
import { useTodayNewLeadsCount } from "../../../../hooks/useTodayNewLeadsCount";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "closer", label: "Closer" },
  { id: "leads", label: "Leads" },
  { id: "setter", label: "Setter" },
  { id: "metrics", label: "Metrics" },
  { id: "sales", label: "Sales" },
  { id: "performance", label: "Performance" },
];

function cx(...c) {
  return c.filter(Boolean).join(" ");
}

export default function Tabs({ activeTab, onTabChange }) {
  const todayNewLeads = useTodayNewLeadsCount();

  const items = useMemo(
    () =>
      TABS.map((t) => {
        if (t.id !== "leads") return t;
        const trailing =
          todayNewLeads == null ? null : (
            <span
              className={cx(
                "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums leading-none shadow-sm ring-1 ring-inset",
                todayNewLeads > 0
                  ? "bg-red-600 text-white ring-red-700/30"
                  : "bg-slate-200/90 text-slate-600 ring-slate-400/20",
              )}
              title={`${todayNewLeads} call${todayNewLeads === 1 ? "" : "s"} with call date today (same as Leads → Today when sorted by call date)`}
              aria-label={`${todayNewLeads} call${todayNewLeads === 1 ? "" : "s"} with call date today`}
            >
              <Bell className="h-3 w-3 shrink-0 opacity-95" strokeWidth={2.5} aria-hidden />
              {todayNewLeads}
            </span>
          );
        return { ...t, trailing };
      }),
    [todayNewLeads],
  );

  return (
    <SegmentedTabs
      items={items}
      activeId={activeTab}
      onChange={onTabChange}
      tabInline
    />
  );
}
