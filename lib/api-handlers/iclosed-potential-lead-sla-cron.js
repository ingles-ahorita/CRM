/**
 * GET/POST /api/iclosed-potential-lead-sla-cron
 * Sends Discord DMs for open potential leads past ICLOSED_SLA_MINUTES since updated_at.
 * Uses metadata._icloud_sla.discord_sent_at (no extra DB columns).
 */

import { getSupabaseAdmin } from '../getSupabaseAdmin.js';
import {
  buildIclosedPotentialLeadDiscordMessage,
  getIclosedSlaMinutes,
  isIclosedSlaDiscordSent,
  markIclosedSlaDiscordSent,
  sendDiscordDm,
  verifyIclosedSlaCronAuth,
} from '../discordNotify.js';
import { ICLOSED_OPEN_STATUSES, rowIclosedStatus } from '../iclosedLeadStatus.js';
import { computePotentialLeadLtStatus, LT_STATUS } from '../potentialLeadLtStatus.js';
import { logPlatformEvent } from '../platformEvents.js';

export async function processIclosedPotentialLeadSlaNotifications() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('Supabase not configured');

  const minutes = getIclosedSlaMinutes();
  const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();
  const openStatuses = [...ICLOSED_OPEN_STATUSES];

  // Real population: open status + has phone + assigned setter, idle past the SLA
  // window. The discord_sent_at dedup (below) ensures one DM per lead, so only
  // not-yet-notified leads fire — the existing backlog was marked sent via a
  // one-time backfill, so only future leads notify "from now on".
  // NOTE: recipient is still hardcoded to a test Discord id in discordNotify.js
  // (test phase) — swap back to per-setter delivery on rollback.
  const { data: rows, error } = await supabase
    .from('potential_leads')
    .select('id, name, phone, email, iclosed_status, metadata, raw_payload, assigned_setter_id, updated_at')
    .in('iclosed_status', openStatuses)
    .not('phone', 'is', null)
    .not('assigned_setter_id', 'is', null)
    .lte('updated_at', cutoff)
    // Exclude already-notified leads IN the query (dedup is JSON-side) so the
    // limit only counts un-notified leads — otherwise a backlog of sent leads
    // starves newer ones. Matches both absent _icloud_sla and explicit null.
    .is('metadata->_icloud_sla->>discord_sent_at', null)
    .order('updated_at', { ascending: true })
    .limit(100);

  if (error) throw new Error(error.message);

  const results = { scanned: rows?.length ?? 0, sent: 0, skipped: 0, errors: [] };

  for (const row of rows || []) {
    if (!rowIclosedStatus(row) || !ICLOSED_OPEN_STATUSES.has(rowIclosedStatus(row))) {
      results.skipped += 1;
      continue;
    }
    if (isIclosedSlaDiscordSent(row.metadata)) {
      results.skipped += 1;
      continue;
    }
    // Only notify leads that compute to LT2/LT3 (has phone, not yet booked).
    const lt = computePotentialLeadLtStatus(row);
    if (lt !== LT_STATUS.LT2 && lt !== LT_STATUS.LT3) {
      results.skipped += 1;
      continue;
    }

    let setter = null;
    if (row.assigned_setter_id) {
      const { data: setterRow, error: setterErr } = await supabase
        .from('setters')
        .select('id, name, discord_id')
        .eq('id', row.assigned_setter_id)
        .maybeSingle();
      if (setterErr) {
        results.errors.push({ leadId: row.id, error: setterErr.message });
        continue;
      }
      setter = setterRow;
    }

    const discordId = setter?.discord_id ? String(setter.discord_id) : null;
    // ── TEMP TEST: force-fall-through so every eligible lead reaches sendDiscordDm
    // (which is also temporarily hardcoded to a single test Discord user).
    // To roll back: change `if (false && !discordId)` back to `if (!discordId)`.
    if (false && !discordId) {
      results.skipped += 1;
      console.warn(
        `[iclosed-sla-cron] skip ${row.id}: setter ${row.assigned_setter_id} missing discord_id`,
      );
      try {
        await logPlatformEvent(supabase, {
          event_type: 'potential_lead.sla_skipped',
          category: 'team',
          severity: 'warning',
          priority: 2,
          summary: `Potential lead SLA skipped — ${row.name || row.email || row.id} (no discord_id)`,
          actor_type: 'system',
          entity_type: 'potential_lead',
          entity_id: row.id,
          lead_name: row.name,
          lead_email: row.email,
          source: 'iclosed',
          dedupe_key: `potential_lead:sla_skip:${row.id}`,
          metadata: {
            href: '/management?tab=potential-leads',
            setter_id: row.assigned_setter_id,
          },
        });
      } catch (logErr) {
        console.warn('[iclosed-sla-cron] platform_events:', logErr?.message);
      }
      continue;
    }

    try {
      const message = buildIclosedPotentialLeadDiscordMessage(row);
      const sendResult = await sendDiscordDm({ userId: discordId, message });
      console.log(
        `[iclosed-sla-cron] worker response for lead ${row.id}:`,
        JSON.stringify(sendResult),
      );

      const { error: upErr } = await supabase
        .from('potential_leads')
        .update({ metadata: markIclosedSlaDiscordSent(row.metadata, nowIso) })
        .eq('id', row.id);

      if (upErr) throw new Error(upErr.message);

      results.sent += 1;

      try {
        await logPlatformEvent(supabase, {
          event_type: 'potential_lead.sla_notified',
          category: 'team',
          priority: 2,
          summary: `Discord SLA — ${row.name || row.email || 'lead'} → ${setter?.name || 'n/a'}`,
          actor_type: 'system',
          entity_type: 'potential_lead',
          entity_id: row.id,
          lead_name: row.name,
          lead_email: row.email,
          source: 'iclosed',
          dedupe_key: `potential_lead:sla_sent:${row.id}`,
          metadata: {
            href: '/management?tab=potential-leads',
            setter_id: setter?.id ?? null,
            setter_name: setter?.name ?? null,
          },
        });
      } catch (logErr) {
        console.warn('[iclosed-sla-cron] platform_events:', logErr?.message);
      }
    } catch (err) {
      results.errors.push({ leadId: row.id, error: err.message });
      console.error(`[iclosed-sla-cron] lead ${row.id}:`, err);
      await logFunctionError(supabase, {
        message: `Discord send failed — lead ${row.id} (${row.name || row.email || 'n/a'}): ${err.message}`,
        details: {
          leadId: row.id,
          email: row.email,
          phone: row.phone,
          iclosed_status: row.iclosed_status,
          assigned_setter_id: row.assigned_setter_id,
          discordId,
          stack: err.stack || String(err),
        },
      });
    }
  }

  return results;
}

/** Best-effort insert into function_errors so cron failures are traceable. */
async function logFunctionError(supabase, { message, details }) {
  try {
    await supabase.from('function_errors').insert({
      function_name: 'iclosed-potential-lead-sla-cron',
      error_message: String(message || '').slice(0, 1000),
      error_details: JSON.stringify(details ?? {}),
      source: 'iclosed-sla-cron',
    });
  } catch (e) {
    console.error('[iclosed-sla-cron] failed to log function_errors:', e?.message);
  }
}

export default async function handler(req, res) {
  const method = (req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyIclosedSlaCronAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const results = await processIclosedPotentialLeadSlaNotifications();
    console.log('[iclosed-sla-cron] done', results);
    return res.status(200).json({ ok: true, ...results });
  } catch (err) {
    console.error('[iclosed-sla-cron] error', err);
    try {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        await logFunctionError(supabase, {
          message: `cron handler failed: ${err.message}`,
          details: { stack: err.stack || String(err) },
        });
      }
    } catch {
      // ignore logging failures
    }
    return res.status(500).json({ ok: false, error: err.message });
  }
}
