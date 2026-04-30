import React from "react";
import LeadsTable from "./leads-table";

export default function Leads() {
  return (
    <div className="w-full max-w-[1400px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Header Area */}
      <div className="mb-4 flex flex-col items-start gap-1">
        <div className="flex items-center gap-3">
          <h2 className="text-[28px] font-bold tracking-tight text-[#0f172a]">
            Leads
          </h2>
          {/* <div className="flex items-center rounded-full bg-[#ebf5ff] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#2563eb] shadow-sm ring-1 ring-inset ring-[#2563eb]/20 mt-2">
              CURRENT (Kept as-is)
            </div> */}
        </div>
        {/* <p className="text-[13px] font-medium text-slate-500">
            Operational call list with all the existing tabs and status badges.
          </p> */}
      </div>

      {/* Dashed Container Area */}
      <div className="relative mt-5">
        {/* Outer Dashed Box */}
        <div className="rounded-[12px] border-[2px] border-dashed border-slate-300/80 bg-slate-50/50">
          <LeadsTable />
        </div>
      </div>
    </div>
  );
}
