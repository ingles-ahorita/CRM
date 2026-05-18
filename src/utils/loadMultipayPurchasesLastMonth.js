import { fetchPurchases as fetchKajabiPurchases } from "../lib/kajabiApi";
import {
  buildMultipayCardTag,
  buildMultipayCardTagTitle,
} from "./kajabiPaymentDisplay";

function hasCrmPayoff(row) {
  if (!row || row.outcome !== "yes") return false;
  const payoffId = row.kajabi_payoff_id;
  return payoffId != null && String(payoffId).trim() !== "";
}

function markPayoff(map, key, row) {
  if (!key || !hasCrmPayoff(row)) return;
  map.set(key, true);
}

/**
 * Kajabi multipay purchases from last calendar month for a closer's leads.
 * Green: 2 Kajabi pays, or CRM payoff linked (paid in full). Red: 1 pay, 30+ days, no payoff.
 */
export async function loadMultipayPurchasesLastMonth(supabase, closerId) {
  const now = new Date();
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const firstDayLastMonth = new Date(
    Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const endDate = new Date(
    Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );
  const startTs = firstDayLastMonth.getTime();
  const endTs = endDate.getTime();
  const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const allInRange = [];
  let page = 1;
  const perPage = 100;
  let done = false;
  while (!done) {
    const result = await fetchKajabiPurchases({ page, perPage, sort: "-created_at" });
    const data = result.data || [];
    if (data.length === 0) break;
    for (const p of data) {
      const createdAt = p.attributes?.created_at;
      if (!createdAt) continue;
      const ts = new Date(createdAt).getTime();
      if (ts >= startTs && ts <= endTs) allInRange.push(p);
    }
    const oldestInBatch = data[data.length - 1].attributes?.created_at;
    const oldestTs = oldestInBatch ? new Date(oldestInBatch).getTime() : 0;
    if (oldestTs > 0 && oldestTs < startTs) done = true;
    else if (data.length < perPage) done = true;
    else page++;
  }

  const multipayOnly = allInRange.filter(
    (p) => String(p.attributes?.payment_type || "").toLowerCase() === "multipay",
  );

  const customerIds = [
    ...new Set(multipayOnly.map((p) => p.relationships?.customer?.data?.id).filter(Boolean)),
  ];
  const leadByCustomerId = {};
  const leadIdsForCloser = new Set();
  if (customerIds.length > 0 && closerId) {
    const ids = customerIds.map((id) => String(id));
    const { data: leadRows } = await supabase
      .from("leads")
      .select("id, name, email, customer_id")
      .in("customer_id", ids);
    (leadRows || []).forEach((row) => {
      const cid = row.customer_id != null ? String(row.customer_id) : null;
      if (cid) leadByCustomerId[cid] = { id: row.id, name: row.name ?? null, email: row.email ?? null };
    });
    const leadIds = (leadRows || []).map((r) => r.id).filter(Boolean);
    if (leadIds.length > 0) {
      const { data: callsWithCloser } = await supabase
        .from("calls")
        .select("lead_id")
        .eq("closer_id", closerId)
        .in("lead_id", leadIds);
      (callsWithCloser || []).forEach((c) => {
        if (c.lead_id != null) leadIdsForCloser.add(c.lead_id);
      });
    }
  }

  const forThisCloser = closerId
    ? multipayOnly.filter((p) => {
        const customerId = p.relationships?.customer?.data?.id;
        const lead = customerId ? leadByCustomerId[String(customerId)] : null;
        return lead && leadIdsForCloser.has(lead.id);
      })
    : multipayOnly;

  const leadIds = [
    ...new Set(
      forThisCloser
        .map((p) => {
          const customerId = p.relationships?.customer?.data?.id;
          const lead = customerId ? leadByCustomerId[String(customerId)] : null;
          return lead?.id;
        })
        .filter(Boolean),
    ),
  ];

  const payoffByLeadId = new Map();
  const payoffByPurchaseId = new Map();

  if (closerId && leadIds.length > 0) {
    const { data: callsWithOutcomes, error: callsOutErr } = await supabase
      .from("calls")
      .select(
        "lead_id, outcome_log!call_id(outcome, kajabi_purchase_id, kajabi_payoff_id)",
      )
      .eq("closer_id", closerId)
      .in("lead_id", leadIds);

    if (callsOutErr) {
      console.warn(
        "[loadMultipayPurchasesLastMonth] calls+outcome_log:",
        callsOutErr.message,
      );
    } else {
      for (const call of callsWithOutcomes || []) {
        const leadId = call.lead_id;
        if (leadId == null) continue;
        const raw = call.outcome_log;
        const outcomes = Array.isArray(raw) ? raw : raw ? [raw] : [];
        for (const row of outcomes) {
          markPayoff(payoffByLeadId, leadId, row);
          const pid =
            row.kajabi_purchase_id != null ? String(row.kajabi_purchase_id) : null;
          markPayoff(payoffByPurchaseId, pid, row);
        }
      }
    }
  }

  return forThisCloser.map((p) => {
    const attrs = p.attributes || {};
    const createdAt = attrs.created_at;
    const customerId = p.relationships?.customer?.data?.id;
    const lead = customerId ? leadByCustomerId[String(customerId)] : null;
    const createdTs = createdAt ? new Date(createdAt).getTime() : 0;
    const isPastOneMonth = createdTs > 0 && createdTs < oneMonthAgo;
    const paymentsMade =
      attrs.multipay_payments_made != null ? Number(attrs.multipay_payments_made) : 0;
    const purchaseId = p.id != null ? String(p.id) : "";
    const hasPayoff =
      (lead?.id != null && payoffByLeadId.get(lead.id) === true) ||
      (purchaseId && payoffByPurchaseId.get(purchaseId) === true);

    let status = "gray";
    if (hasPayoff || paymentsMade === 2) status = "green";
    else if (isPastOneMonth && paymentsMade === 1) status = "red";

    const paymentType = attrs.payment_type ?? "multipay";
    const statusLabel = buildMultipayCardTag({
      paymentType,
      paymentsMade,
      status,
      hasPayoff,
    });
    const statusTitle = buildMultipayCardTagTitle({
      paymentType,
      paymentsMade,
      hasPayoff,
      kajabiPurchaseId: purchaseId || null,
    });

    return {
      lead_id: lead?.id ?? null,
      name: lead?.name ?? "—",
      email: lead?.email ?? "—",
      date: createdAt ? new Date(createdAt).toLocaleDateString("en-US", { dateStyle: "medium" }) : "—",
      status,
      statusLabel,
      statusTitle,
    };
  });
}
