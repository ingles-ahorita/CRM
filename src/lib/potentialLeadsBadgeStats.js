import { computePotentialLeadLtStatus, LT_STATUS } from "../../lib/potentialLeadLtStatus.js";

/**
 * A potential lead hidden on the management page (not actionable):
 *  • LT1 ("Name + Email" only), or
 *  • "Other" (no LT stage) without a phone number.
 * Shared with the page's baseRows filter so both stay in lockstep.
 */
export function isHiddenPotentialLead(row, lt) {
  if (lt === LT_STATUS.LT1) return true;
  if (lt == null && !String(row?.phone ?? "").trim()) return true;
  return false;
}

/**
 * Assigned to a currently-active setter. A null setter, or one pointing at a
 * deactivated setter, counts as "unassigned" (the assignment dropdown only
 * lists active setters, so such rows already render as "— Unassigned —").
 */
export function isAssignedToActiveSetter(row, activeSetterIds) {
  const id = row?.assigned_setter_id;
  if (!id) return false;
  return activeSetterIds instanceof Set
    ? activeSetterIds.has(id)
    : (activeSetterIds || []).includes(id);
}

/**
 * Potential Leads badge numbers — contacted / received — over exactly the rows
 * shown on the management page (LT1 + Other-without-phone hidden). These mirror
 * the page's "Received" and "Contacted" KPI cards 1:1 (no unassigned exclusion):
 *  • received  = visible leads in scope.
 *  • contacted = visible leads with a logged contact attempt, excluding booked
 *    (LT4/LT5) — same rule the page's "Contacted" card uses.
 */
export function computePotentialLeadsBadgeStats(rows, { crmConfirmedEmails = null } = {}) {
  let received = 0;
  let contacted = 0;
  for (const row of rows || []) {
    const lt = computePotentialLeadLtStatus(row, { crmConfirmedEmails });
    if (isHiddenPotentialLead(row, lt)) continue; // not shown on the page
    received += 1;
    const booked = lt === LT_STATUS.LT4 || lt === LT_STATUS.LT5;
    if (!booked && row.last_contact_attempt_at) contacted += 1;
  }
  return { received, contacted };
}