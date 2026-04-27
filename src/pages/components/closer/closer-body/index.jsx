import React from "react";
import CloserBodyStats from "./components/closer-body-stats";
import CloserMetricsTable from "./components/closer-metrics-table";
import CloserHistoricPerformance from "./components/closer-historic-performance";
import CloserTodaysLeads from "./components/closer-todays-leads";

const CloserBody = (props) => {
  return (
    <div className="md:col-span-4 lg:col-span-5 flex flex-col gap-4">
      <CloserBodyStats {...props} />
      <CloserMetricsTable
        loading={props?.metricsLoading}
        mtdLabel={props?.metricsMtdLabel}
        historicLabel={props?.metricsHistoricLabel}
        mtd={props?.metricsMtd}
        historic={props?.metricsHistoric}
      />
      <CloserHistoricPerformance
        loading={props?.historicLoading}
        range={props?.historicRange}
        onRangeChange={props?.onHistoricRangeChange}
        avgClosingRate={props?.historicAvgClosingRate}
        avgPifRate={props?.historicAvgPifRate}
        bestMonthValue={props?.historicBestMonthValue}
        bestMonthSubtext={props?.historicBestMonthSubtext}
        bestMonthHint={props?.historicBestMonthHint}
        closingBars={props?.historicClosingBars}
        pifBars={props?.historicPifBars}
        labels={props?.historicLabels}
      />
      <CloserTodaysLeads
        loading={props?.leadsLoading}
        leads={props?.leads}
        setterMap={props?.setterMap}
        activeTab={props?.activeTab}
        onTabChange={props?.onTabChange}
        payoffLoading={props?.payoffLoading}
        payoffEntries={props?.payoffEntries}
      />
    </div>
  );
};

export default CloserBody;
