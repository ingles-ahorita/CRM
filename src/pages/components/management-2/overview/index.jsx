import ManagementDashboard from "./management-dashboard";
import TrendsChartPanel from "./trends-chart-panel";
import FunnelSnapshots from "./funnel-snapshots";
import TopOfFunnelPanel from "./top-of-funnel-panel";
import RecoveredLeadsFunnel from "./recovered-leads-funnel";

export default function Overview() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-8 gap-2">
        <div className="col-span-2 flex flex-col gap-3">
          <ManagementDashboard />
        </div>
        <div className="col-span-4 flex flex-col gap-3">
          <TrendsChartPanel />
          <RecoveredLeadsFunnel />
        </div>
        <div className="col-span-2 flex min-w-0 flex-col gap-3">
          <FunnelSnapshots compact />
          <TopOfFunnelPanel />
        </div>
      </div>
  
    </div>
  );
}
