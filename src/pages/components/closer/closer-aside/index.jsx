import React from "react";
import PayoffOpportunities from "./components/payoff-opportunities";
import AovByCloser from "./components/aov-by-closer";
import PifRateLeaderboard from "./components/pif-rate-leaderboard";
import RecoveredLeads from "./components/recovered-leads";
import ShowUpLeaderboard from "./components/show-up-leaderboard";

import AovByCloserShimmer from "../shimmers/closer-aside/aov-by-closer";
import PayoffOpportunitiesShimmer from "../shimmers/closer-aside/payoff-opportunities";
import PifRateLeaderboardShimmer from "../shimmers/closer-aside/pif-rate-leaderboard";
import RecoveredLeadsShimmer from "../shimmers/closer-aside/recovered-leads";
import ShowUpLeaderboardShimmer from "../shimmers/closer-aside/show-up-leaderboard";

export default function CloserAside({
  loading = false,
  pifRateLoading = false,
  showUpLoading = false,
  aovLoading = false,
  payoffLoading = false,
  recoveredLoading = false,
  pifRateEntries,
  pifRateTitleRight,
  pifRateFooter,
  showUpEntries,
  payoffEntries,
  recoveredStats,
  recoveredLeads,
  recoveredRange,
  onRecoveredRangeChange,
  aovEntries,
  aovRange,
  onAovRangeChange,
}) {
  return (
    <div className="md:col-span-3 lg:col-span-2 flex flex-col gap-4">
      {loading || pifRateLoading ? (
        <PifRateLeaderboardShimmer />
      ) : (
        <PifRateLeaderboard
          entries={pifRateEntries}
          titleRight={pifRateTitleRight}
          footer={pifRateFooter}
        />
      )}
      {loading || showUpLoading ? (
        <ShowUpLeaderboardShimmer />
      ) : (
        <ShowUpLeaderboard entries={showUpEntries} />
      )}
      {loading || recoveredLoading ? (
        <RecoveredLeadsShimmer />
      ) : (
        <RecoveredLeads
          stats={recoveredStats}
          leads={recoveredLeads}
          range={recoveredRange}
          onRangeChange={onRecoveredRangeChange}
        />
      )}
      {loading || payoffLoading ? (
        <PayoffOpportunitiesShimmer />
      ) : (
        <PayoffOpportunities entries={payoffEntries} />
      )}
      {loading || aovLoading ? (
        <AovByCloserShimmer />
      ) : (
        <AovByCloser
          entries={aovEntries}
          range={aovRange}
          onRangeChange={onAovRangeChange}
        />
      )}
    </div>
  );
}