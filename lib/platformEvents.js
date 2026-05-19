/**
 * Platform activity log — write helpers for platform_events.
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} event
 */
export async function logPlatformEvent(supabase, event) {
  const row = {
    occurred_at: event.occurred_at ?? new Date().toISOString(),
    event_type: event.event_type,
    category: event.category ?? 'system',
    severity: event.severity ?? 'info',
    priority: event.priority ?? 1,
    summary: event.summary,
    actor_type: event.actor_type ?? 'system',
    actor_id: event.actor_id ?? null,
    actor_display: event.actor_display ?? null,
    entity_type: event.entity_type ?? null,
    entity_id: event.entity_id ?? null,
    lead_id: event.lead_id ?? null,
    call_id: event.call_id ?? null,
    lead_name: event.lead_name ?? null,
    lead_email: event.lead_email ?? null,
    source: event.source ?? 'crm',
    dedupe_key: event.dedupe_key ?? null,
    metadata: event.metadata ?? {},
  };

  if (row.dedupe_key) {
    const { data: existing } = await supabase
      .from('platform_events')
      .select('id')
      .eq('dedupe_key', row.dedupe_key)
      .maybeSingle();
    if (existing?.id) return { skipped: true, id: existing.id };
  }

  const { data, error } = await supabase
    .from('platform_events')
    .insert(row)
    .select('id')
    .single();

  if (error) throw error;
  return { skipped: false, id: data?.id };
}

/** UTC day bounds for YYYY-MM-DD */
export function getUtcDayBounds(dateStr) {
  return {
    from: `${dateStr}T00:00:00.000Z`,
    to: `${dateStr}T23:59:59.999Z`,
  };
}

export function getLastDaysUtcStrings(n) {
  const out = [];
  const today = new Date(
    Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Resolve API range preset to { fromIso, toIso, label }.
 * @param {string} range
 * @param {string} [customFrom] YYYY-MM-DD
 * @param {string} [customTo] YYYY-MM-DD
 */
export function resolvePlatformEventsRange(range, customFrom, customTo) {
  const todayStr = new Date().toISOString().slice(0, 10);

  if (range === 'custom' && customFrom && customTo) {
    const fromB = getUtcDayBounds(customFrom);
    const toB = getUtcDayBounds(customTo);
    return {
      fromIso: fromB.from,
      toIso: toB.to,
      label: `${customFrom} – ${customTo}`,
    };
  }

  if (range === 'last30') {
    const days = getLastDaysUtcStrings(30);
    const fromB = getUtcDayBounds(days[0]);
    const toB = getUtcDayBounds(days[days.length - 1]);
    return { fromIso: fromB.from, toIso: toB.to, label: 'Last 30 days' };
  }

  if (range === 'last7') {
    const days = getLastDaysUtcStrings(7);
    const fromB = getUtcDayBounds(days[0]);
    const toB = getUtcDayBounds(days[days.length - 1]);
    return { fromIso: fromB.from, toIso: toB.to, label: 'Last 7 days' };
  }

  // today (default)
  const fromB = getUtcDayBounds(todayStr);
  return { fromIso: fromB.from, toIso: fromB.to, label: 'Today' };
}

export function applyTopicFilter(query, topic) {
  if (!topic || topic === 'all') return query;
  if (topic === 'bookings') return query.in('category', ['booking']);
  if (topic === 'sales') return query.in('category', ['sale']);
  if (topic === 'team') return query.in('category', ['team']);
  if (topic === 'errors') return query.eq('severity', 'error');
  if (topic === 'sync') {
    return query.or('source.eq.sync,event_type.eq.kajabi.sync');
  }
  return query;
}

export function applyLiveViewFilter(query) {
  return query.gte('priority', 2);
}
