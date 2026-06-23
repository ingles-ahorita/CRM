/* eslint-disable react-refresh/only-export-components -- context module intentionally exports the provider, hook, and tz constants together */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

// Global timezone toggle shared by the Management screen's Leads and
// Potential Leads tabs. "local" = the viewer's browser timezone; "madrid" =
// Europe/Madrid (the ads-account timezone). The choice drives BOTH the
// displayed times and the day-bucketing / date-range math on those tabs.

export const MADRID_TZ = 'Europe/Madrid';
export const LOCAL_TZ =
  (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';

const STORAGE_KEY = 'management.timezoneMode'; // 'local' | 'madrid'

const ManagementTimezoneContext = createContext({
  mode: 'local',
  useMadrid: false,
  timeZone: LOCAL_TZ,
  setMode: () => {},
  toggle: () => {},
});

function readInitialMode() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'madrid' ? 'madrid' : 'local';
  } catch {
    return 'local';
  }
}

export function ManagementTimezoneProvider({ children }) {
  const [mode, setMode] = useState(readInitialMode);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore persistence failures (private mode, etc.) */
    }
  }, [mode]);

  const value = useMemo(() => {
    const useMadrid = mode === 'madrid';
    return {
      mode,
      useMadrid,
      timeZone: useMadrid ? MADRID_TZ : LOCAL_TZ,
      setMode,
      toggle: () => setMode((m) => (m === 'madrid' ? 'local' : 'madrid')),
    };
  }, [mode]);

  return (
    <ManagementTimezoneContext.Provider value={value}>
      {children}
    </ManagementTimezoneContext.Provider>
  );
}

export function useManagementTimezone() {
  return useContext(ManagementTimezoneContext);
}
