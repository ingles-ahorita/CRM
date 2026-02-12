import { supabase } from '../lib/supabaseClient';
import { findCustomerByEmail } from '../lib/kajabiApi';

/**
 * Fetches all outcome_log entries with outcome='yes', then for each associated call
 * tries to find the Kajabi customer by email via the Kajabi API.
 * @returns {Promise<Array<{ call_id: number, lead_id: number, email: string | null, name: string | null, outcome_log_id: number, kajabi_customer_id: string | null, kajabi_name: string | null, error?: string }>>}
 */
export async function findKajabiCustomerIdsForOutcomeYes() {
  const { data: outcomeLogs, error: logError } = await supabase
    .from('outcome_log')
    .select(`
      id,
      call_id,
      outcome,
      calls!call_id (
        id,
        lead_id,
        email,
        name
      )
    `)
    .eq('outcome', 'yes');

  if (logError) {
    throw new Error(`Failed to fetch outcome_log: ${logError.message}`);
  }

  const rows = outcomeLogs || [];
  const results = [];

  for (const row of rows) {
    const call = row.calls;
    if (!call) continue;
    const callId = call.id;
    const leadId = call.lead_id;
    const email = call.email ?? null;
    const name = call.name ?? null;

    let kajabi_customer_id = null;
    let kajabi_name = null;
    let err = null;

    if (email && String(email).trim()) {
      try {
        const customer = await findCustomerByEmail(email);
        if (customer) {
          kajabi_customer_id = customer.id;
          kajabi_name = customer.name ?? null;
        }
      } catch (e) {
        err = e.message || String(e);
      }
    }

    results.push({
      call_id: callId,
      lead_id: leadId,
      email,
      name,
      outcome_log_id: row.id,
      kajabi_customer_id,
      kajabi_name,
      error: err ?? undefined,
    });
  }

  return results;
}
