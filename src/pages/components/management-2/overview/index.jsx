import ManagementDashboard from "./management-dashboard";
import GoalRevenueVisualBlock from "./goal-revenue-visual-block";
import TrendsChartPanel from "./trends-chart-panel";
import FunnelSnapshots from "./funnel-snapshots";
import TopOfFunnelPanel from "./top-of-funnel-panel";
import RecoveredLeadsFunnel from "./recovered-leads-funnel";
import CommissionOverviewSnapshot from "./commission-overview-snapshot";

export default function Overview() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-8 gap-2">
        <div className="col-span-2 flex flex-col gap-3">
          <ManagementDashboard />
          <CommissionOverviewSnapshot />
        </div>
        <div className="col-span-4 flex flex-col gap-3">
          <TrendsChartPanel />
          <FunnelSnapshots />
          <RecoveredLeadsFunnel stackPanels />
        </div>
        <div className="col-span-2 flex flex-col gap-3">
          <GoalRevenueVisualBlock />
          <TopOfFunnelPanel />
        </div>
      </div>
  
    </div>
  );
}
