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
import { logPlatformEvent } from '../platformEvents.js';

export async function processIclosedPotentialLeadSlaNotifications() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('Supabase not configured');

  const minutes = getIclosedSlaMinutes();
  const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();
  const openStatuses = [...ICLOSED_OPEN_STATUSES];

  const { data: rows, error } = await supabase
    .from('potential_leads')
    .select('id, name, phone, email, iclosed_status, status, metadata, assigned_setter_id, updated_at')
    .in('iclosed_status', openStatuses)
    .not('assigned_setter_id', 'is', null)
    .lte('updated_at', cutoff)
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

    const { data: setter, error: setterErr } = await supabase
      .from('setters')
      .select('id, name, discord_id')
      .eq('id', row.assigned_setter_id)
      .maybeSingle();

    if (setterErr) {
      results.errors.push({ leadId: row.id, error: setterErr.message });
      continue;
    }

    const discordId = setter?.discord_id ? String(setter.discord_id) : null;
    if (!discordId) {
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
      await sendDiscordDm({ userId: discordId, message });

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
          summary: `Discord SLA — ${row.name || row.email || 'lead'} → ${setter.name}`,
          actor_type: 'system',
          entity_type: 'potential_lead',
          entity_id: row.id,
          lead_name: row.name,
          lead_email: row.email,
          source: 'iclosed',
          dedupe_key: `potential_lead:sla_sent:${row.id}`,
          metadata: {
            href: '/management?tab=potential-leads',
            setter_id: setter.id,
            setter_name: setter.name,
          },
        });
      } catch (logErr) {
        console.warn('[iclosed-sla-cron] platform_events:', logErr?.message);
      }
    } catch (err) {
      results.errors.push({ leadId: row.id, error: err.message });
      console.error(`[iclosed-sla-cron] lead ${row.id}:`, err);
    }
  }

  return results;
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
    return res.status(500).json({ ok: false, error: err.message });
  }
}
