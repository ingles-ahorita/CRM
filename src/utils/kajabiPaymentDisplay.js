/**
 * Card tags for closer multipay list (Kajabi purchase fields only).
 */

export function formatKajabiPaymentType(paymentType) {
  const raw = paymentType != null ? String(paymentType).trim() : "";
  if (!raw) return "—";
  return raw;
}

export function buildMultipayCardTag({ paymentType, paymentsMade, status, hasPayoff }) {
  const typeLabel = formatKajabiPaymentType(paymentType);
  const made = Number.isFinite(paymentsMade) ? paymentsMade : 0;

  if (hasPayoff) return "PIF";
  if (made === 2) return `${typeLabel} · 2 pays`;
  if (status === "red" && made === 1) return `${typeLabel} · 1 pay`;
  if (made === 1) return `${typeLabel} · 1 pay`;
  if (made > 2) return `${typeLabel} · ${made} pays`;
  return typeLabel;
}

export function buildMultipayCardTagTitle({
  paymentType,
  paymentsMade,
  hasPayoff,
  kajabiPurchaseId,
}) {
  const parts = [];
  if (kajabiPurchaseId) parts.push(`Purchase ${kajabiPurchaseId}`);
  parts.push(`Payment type: ${formatKajabiPaymentType(paymentType)}`);
  const made = Number.isFinite(paymentsMade) ? paymentsMade : 0;
  parts.push(`Kajabi payments made: ${made}`);
  if (hasPayoff) parts.push("CRM: payoff linked (paid in full)");
  return parts.join(" · ");
}
