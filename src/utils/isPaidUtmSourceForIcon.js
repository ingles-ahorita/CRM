export function isPaidUtmSourceForIcon(call) {
  const utm = String(call?.utm_source ?? "").toLowerCase();
  return utm.includes("ad") || utm.includes("ads") || utm.includes("meta");
}