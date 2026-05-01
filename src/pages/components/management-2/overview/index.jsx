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
      <ManagementDashboard />
      <GoalRevenueVisualBlock />
      <TrendsChartPanel />
      <FunnelSnapshots />
      <TopOfFunnelPanel />
      <RecoveredLeadsFunnel />
      <CommissionOverviewSnapshot />
    </div>
  );
}