import { supabase } from './supabaseClient';

/** DB ids of the Lock-in and Payoff offers (stable, do not change). */
export const LOCK_IN_OFFER_DB_ID = '8c714af6-f994-4a62-9c36-ed75281bef22'; 
export const PAYOFF_OFFER_DB_ID = '745b70ff-dd84-4d2b-9d2a-dc6f8a27a1b4';

/**
 * Fetches the Kajabi offer ids for Lock-in and Payoff from the offers table.
 * @returns {Promise<{ lockInKajabiId: string | null, payoffKajabiId: string | null }>}
 */
export async function getSpecialOfferKajabiIds() {
  const { data, error } = await supabase
    .from('offers')
    .select('id, kajabi_id')
    .in('id', [LOCK_IN_OFFER_DB_ID, PAYOFF_OFFER_DB_ID]);

  if (error) {
    console.error('[specialOffers] Error fetching special offers:', error);
    return { lockInKajabiId: null, payoffKajabiId: null };
  }

  const rows = data || [];
  let lockInKajabiId = null;
  let payoffKajabiId = null;
  rows.forEach((row) => {
    const kajabiId = row.kajabi_id ? String(row.kajabi_id) : null;
    if (row.id === LOCK_IN_OFFER_DB_ID) lockInKajabiId = kajabiId;
    if (row.id === PAYOFF_OFFER_DB_ID) payoffKajabiId = kajabiId;
  });
  return { lockInKajabiId, payoffKajabiId };
}
