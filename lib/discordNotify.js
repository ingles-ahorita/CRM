/**
 * Shared Discord DM delivery via Cloudflare worker (POST { message, userId }).
 * Used by Calendly webhook and iClosed potential-lead SLA cron.
 *
 * iClosed SLA ops (no DB migration):
 *   ICLOSED_SLA_CRON_SECRET or CRON_SECRET — cron auth (Vercel Cron sends Bearer)
 *   ICLOSED_SLA_MINUTES — default 5
 *   DISCORD_NOTIFY_URL or ICLOSED_DISCORD_NOTIFY_URL — optional worker override
 *   setters.discord_id — per setter in Supabase
 */

import {
  ICLOSED_STATUS,
  rowIclosedStatus,
} from './iclosedLeadStatus.js';

const DEFAULT_WORKER_URL =
  'https://discord-notifiactions.floral-rain-cd3c.workers.dev/';

export function getDiscordWorkerUrl() {
  return (
    process.env.DISCORD_NOTIFY_URL ||
    process.env.ICLOSED_DISCORD_NOTIFY_URL ||
    DEFAULT_WORKER_URL
  );
}

/**
 * @param {{ message: string, userId: string, url?: string }} params
 */
export async function sendDiscordDm({ message, userId, url }) {
  const workerUrl = url || getDiscordWorkerUrl();
  const response = await fetch(workerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      userId: String(userId),
    }),
  });

  const text = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(`Discord notification failed: ${response.status} ${text}`);
  }
  // Return the worker response so callers can detect a 200 that didn't actually
  // deliver (e.g. bot can't DM the user) — the body carries Discord's verdict.
  return { status: response.status, body: text };
}

export function getIclosedSlaMinutes() {
  const raw = parseInt(process.env.ICLOSED_SLA_MINUTES || '5', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 5;
}

/** @param {object | null | undefined} metadata */
export function isIclosedSlaDiscordSent(metadata) {
  const sent = metadata?._icloud_sla?.discord_sent_at;
  return sent != null && String(sent).trim() !== '';
}

/**
 * Reset per-row SLA notify flag (15m window uses updated_at on the row).
 * @param {object | null | undefined} metadata
 */
export function mergeIclosedSlaMetadata(metadata) {
  return {
    ...(metadata && typeof metadata === 'object' ? metadata : {}),
    _icloud_sla: { discord_sent_at: null },
  };
}

/**
 * @param {object | null | undefined} metadata
 * @param {string} sentAtIso
 */
export function markIclosedSlaDiscordSent(metadata, sentAtIso) {
  return {
    ...(metadata && typeof metadata === 'object' ? metadata : {}),
    _icloud_sla: { discord_sent_at: sentAtIso },
  };
}

/**
 * Spanish DM template for iClosed potential leads.
 * Distinct message per status so setter knows urgency at a glance.
 * @param {{ name?: string | null, phone?: string | null, iclosed_status?: string | null }} lead
 */
export function buildIclosedPotentialLeadDiscordMessage(lead) {
  const st = rowIclosedStatus(lead) || ICLOSED_STATUS.POTENTIAL;
  const name = lead.name?.trim() || '—';
  const phone = lead.phone?.trim() || '—';

  if (st === ICLOSED_STATUS.QUALIFIED) {
    // Translation:
    // 🔵 New QUALIFIED lead — ready to book!
    // 👤 Lead: {name}
    // 📞 Phone: {phone}
    // 📋 This lead is qualified and ready. Help them schedule their strategy call now.
    // 🚀 Let's close it!
    return [
      '🔵 **¡Nuevo lead CALIFICADO — listo para agendar!**',
      '',
      `👤 **Lead:** ${name}`,
      '',
      `📞 **Teléfono:** ${phone}`,
      '',
      '📋 Este lead está calificado y listo. Ayúdale a agendar su llamada de estrategia ahora.',
      '',
      '🚀 ¡A cerrarlo!',
    ].join('\n');
  }

  // Potential (slate/grey in CRM → ⚪)
  // Translation:
  // ⚪ New POTENTIAL lead — hasn't booked yet!
  // 👤 Lead: {name}
  // 📞 Phone: {phone}
  // 📋 This lead is at potential stage. Contact them and guide them to book their call.
  // 👀 Keep an eye on it.
  return [
    '⚪ **¡Nuevo lead POTENCIAL — aún no ha agendado!**',
    '',
    `👤 **Lead:** ${name}`,
    '',
    `📞 **Teléfono:** ${phone}`,
    '',
    '📋 Este lead está en etapa potencial. Contáctalo y guíalo para que agende su llamada.',
    '',
    '👀 Mantente al tanto.',
  ].join('\n');
}

export function verifyIclosedSlaCronAuth(req) {
  const secret =
    process.env.ICLOSED_SLA_CRON_SECRET ||
    process.env.CRON_SECRET ||
    '';
  if (!secret) {
    console.warn('[iclosed-sla-cron] no ICLOSED_SLA_CRON_SECRET — endpoint is open');
    return true;
  }

  const headers = req.headers || {};
  const auth = headers.authorization || headers.Authorization || '';
  if (auth === `Bearer ${secret}`) return true;

  const query = req.query || {};
  if (query.secret === secret) return true;

  const cronHeader = headers['x-cron-secret'] || headers['x-vercel-cron-secret'];
  if (cronHeader === secret) return true;

  return false;
}
