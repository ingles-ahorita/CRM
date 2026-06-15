import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

// Components
import Header from "./components/management-2/header";
import Tabs from "./components/management-2/tabs";
import OverviewTab from "./components/management-2/overview";
import CloserTab from "./components/management-2/closer";
import LeadsTab from "./components/management-2/leads";
import PotentialLeadsTab from "./components/management-2/potential-leads";
import SetterTab from "./components/management-2/setter";
import MetricsTab from "./components/management-2/metrics";
import SalesTab from "./components/management-2/sales";
import PerformanceTab from "./components/management-2/performance";
import OrganicStatsTab from "./components/management-2/organic-stats";
import NotificationsTab from "./components/management-2/notifications";
import WatchListTab from "./components/management-2/watch-list";
import { usePlatformEventsBadge } from "../hooks/usePlatformEventsBadge";
import { useWatchList } from "../hooks/useWatchList";

export default function Management2() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { refresh: refreshNotificationsBadge } = usePlatformEventsBadge();
  const { count: watchBelowCount } = useWatchList({ pollMs: 5 * 60 * 1000 });

  // Validate and parse the current tab from URL
  const validTabs = [
    "overview",
    "watch",
    "leads",
    "potential-leads",
    "closer",
    "setter",
    "metrics",
    "sales",
    "performance",
    "organic",
    "notifications",
  ];
  const currentTab = searchParams.get("tab");
  const activeTab = validTabs.includes(currentTab) ? currentTab : "overview";

  // If the URL has an invalid or missing tab, gracefully update the URL without pushing a new history state
  useEffect(() => {
    if (!validTabs.includes(currentTab)) {
      setSearchParams({ tab: "overview" }, { replace: true });
    }
  }, [currentTab, setSearchParams]);

  // Handle tab switching
  const handleTabChange = (tabId) => {
    setSearchParams({ tab: tabId });
  };

  return (
    <div className="min-h-screen bg-slate-50/30 p-6 md:p-8">
      <div className="mx-auto max-w-[1600px]">
        {/* Header + Tabs on the same row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
          <Header />
          <div className="flex-shrink-0">
            <Tabs activeTab={activeTab} onTabChange={handleTabChange} watchBelowCount={watchBelowCount} />
          </div>
        </div>

        {/* Tab Content Area */}
        <div>
          {activeTab === "overview" && <OverviewTab />}
          {activeTab === "watch" && <WatchListTab />}
          {activeTab === "closer" && <CloserTab />}
          {activeTab === "leads" && <LeadsTab />}
          {activeTab === "potential-leads" && <PotentialLeadsTab />}
          {activeTab === "setter" && <SetterTab />}
          {activeTab === "metrics" && <MetricsTab />}
          {activeTab === "sales" && <SalesTab />}
          {activeTab === "performance" && <PerformanceTab />}
          {activeTab === "organic" && <OrganicStatsTab />}
          {activeTab === "notifications" && (
            <NotificationsTab onSeen={refreshNotificationsBadge} />
          )}
        </div>
      </div>
    </div>
  );
}