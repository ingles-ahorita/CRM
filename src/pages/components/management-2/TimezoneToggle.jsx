import React from 'react';
import { Globe } from 'lucide-react';
import { useManagementTimezone, MADRID_TZ, LOCAL_TZ } from '../../../contexts/managementTimezone';
import { getUTCOffset } from '../../../utils/dateHelpers';

function cx(...p) {
  return p.filter(Boolean).join(' ');
}

// Local / Madrid timezone switch for the Leads & Potential Leads tabs.
// Reflects the shared ManagementTimezone context.
export default function TimezoneToggle() {
  const { mode, setMode } = useManagementTimezone();

  const options = [
    { key: 'local', label: 'Local', tz: LOCAL_TZ },
    { key: 'madrid', label: 'Madrid', tz: MADRID_TZ },
  ];

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-1.5 py-1 shadow-sm"
      title="Switch the timezone used for times and day filtering on Leads / Potential Leads"
    >
      <Globe size={14} className="text-slate-400" />
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">TZ</span>
      <div className="inline-flex rounded-md bg-slate-100/80 p-0.5">
        {options.map((o) => {
          const active = mode === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => setMode(o.key)}
              title={`${o.tz} (UTC${getUTCOffset(o.tz)})`}
              className={cx(
                'px-2.5 py-1 text-[11px] font-semibold rounded transition !outline-none',
                active
                  ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.10)]'
                  : 'bg-transparent text-slate-500 hover:text-slate-700',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
