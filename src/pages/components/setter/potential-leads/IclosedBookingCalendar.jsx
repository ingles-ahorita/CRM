import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';

function cx(...c) {
  return c.filter(Boolean).join(' ');
}

function formatSlotLabel(time24) {
  const [h, m] = String(time24 || '0:0').split(':').map(Number);
  const d = new Date(2000, 0, 1, h || 0, m || 0);
  return format(d, 'h:mm a');
}

function toDateKey(date) {
  return format(date, 'yyyy-MM-dd');
}

export default function IclosedBookingCalendar({
  timeZone = 'America/New_York',
  enabled = true,
  value = null,
  onChange,
}) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [availabilities, setAvailabilities] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);

  const fetchSlots = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/iclosed?resource=event-dates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ timeZone, currentDate: toDateKey(viewMonth) }),
      });
      const text = await res.text();
      let json;
      try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
      if (!res.ok) throw new Error(json?.message || json?.error || `Error ${res.status}`);
      const map = json?.data?.availabilities;
      setAvailabilities(map && typeof map === 'object' ? map : {});
    } catch (e) {
      setAvailabilities({});
      setError(e?.message || 'Failed to load available slots');
    } finally {
      setLoading(false);
    }
  }, [enabled, timeZone, viewMonth]);

  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  const monthDays = useMemo(() => {
    return eachDayOfInterval({ start: startOfMonth(viewMonth), end: endOfMonth(viewMonth) });
  }, [viewMonth]);

  const leadingBlanks = useMemo(() => getDay(startOfMonth(viewMonth)), [viewMonth]);

  const availableDateKeys = useMemo(
    () => new Set(Object.keys(availabilities || {})),
    [availabilities],
  );

  const slotsForSelected = selectedDate ? (availabilities[selectedDate] || []) : [];
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="iclosed-booking-calendar select-none">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-slate-900">Select a date &amp; time</h4>
          <p className="text-[11px] text-slate-400">{timeZone.replace(/_/g, ' ')}</p>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-1 py-1">
          <button
            type="button"
            onClick={() => {
              setViewMonth((m) => subMonths(m, 1));
              setSelectedDate(null);
              setSelectedTime(null);
              onChange?.(null);
            }}
            className="iclosed-cal-nav-btn rounded-md bg-white p-1 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            aria-label="Previous month"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="w-[110px] text-center text-[13px] font-semibold text-slate-800">
            {format(viewMonth, 'MMMM yyyy')}
          </span>
          <button
            type="button"
            onClick={() => {
              setViewMonth((m) => addMonths(m, 1));
              setSelectedDate(null);
              setSelectedTime(null);
              onChange?.(null);
            }}
            className="iclosed-cal-nav-btn rounded-md bg-white p-1 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            aria-label="Next month"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 ring-1 ring-red-100">
          {error}
        </div>
      )}

      {/* Calendar grid */}
      <div className="rounded-xl border border-slate-100 bg-white">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-slate-100 px-1 py-2">
          {weekdays.map((d) => (
            <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {d}
            </div>
          ))}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7 gap-y-1 px-1 py-2">
          {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`b${i}`} />)}

          {monthDays.map((day) => {
            const key = toDateKey(day);
            const inMonth = isSameMonth(day, viewMonth);
            const hasSlots = availableDateKeys.has(key);
            const isSelected = selectedDate === key;
            const isToday = isSameDay(day, new Date());

            return (
              <div key={key} className="flex items-center justify-center py-0.5">
                <button
                  type="button"
                  disabled={!hasSlots || loading || !inMonth}
                  onClick={() => {
                    setSelectedDate(key);
                    setSelectedTime(null);
                    onChange?.(null);
                  }}
                  className={cx(
                    'iclosed-cal-day relative flex h-8 w-8 items-center justify-center rounded-full bg-white text-[13px] font-medium transition-colors duration-100',
                    !inMonth && 'text-slate-200',
                    inMonth && !hasSlots && 'cursor-default text-slate-300',
                    inMonth && hasSlots && !isSelected && 'is-available cursor-pointer text-slate-700',
                    isSelected && 'is-selected',
                    isToday && !isSelected && 'ring-1 ring-indigo-400',
                  )}
                >
                  {format(day, 'd')}
                  {/* availability dot */}
                  {inMonth && hasSlots && !isSelected && (
                    <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-indigo-400" />
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {loading && (
          <div className="pb-3 text-center text-[11px] text-slate-400">Loading…</div>
        )}
      </div>

      {/* Time slots */}
      {selectedDate && (
        <div className="mt-4">
          <div className="mb-2.5 flex items-center gap-1.5">
            <Clock size={13} className="text-indigo-500 shrink-0" />
            <span className="text-[12px] font-semibold text-slate-700">
              {format(parseISO(selectedDate), 'EEEE, MMMM d')}
            </span>
            <span className="ml-auto text-[11px] text-slate-400">
              {slotsForSelected.length} slot{slotsForSelected.length !== 1 ? 's' : ''}
            </span>
          </div>
          {slotsForSelected.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {slotsForSelected.map((slot) => {
                const dateTime = fromZonedTime(`${selectedDate}T${slot}:00`, timeZone).toISOString();
                const active = selectedTime === slot || value?.dateTime === dateTime;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => {
                      setSelectedTime(slot);
                      onChange?.({
                        date: selectedDate,
                        time: slot,
                        dateTime,
                        timeZone,
                      });
                    }}
                    className={cx(
                      'iclosed-cal-slot rounded-lg bg-white px-2 py-2 text-[12px] font-semibold text-slate-700 transition-colors duration-100 hover:bg-slate-50',
                      active && 'is-active',
                    )}
                  >
                    {formatSlotLabel(slot)}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-[12px] text-slate-400">No times available.</p>
          )}
        </div>
      )}
    </div>
  );
}
