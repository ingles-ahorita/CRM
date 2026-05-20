/**
 * Human-readable labels for platform_events rows (Activity tab).
 */

const SETTING_LABELS = {
  monthly_revenue_goal_usd: "the monthly revenue goal",
};

function formatActor(actorDisplay, actorType) {
  const name = (actorDisplay || "").trim();
  if (name) return name;
  if (actorType === "admin") return "Admin";
  return "Someone";
}

function formatSettingValue(key, value) {
  const n = Number(value);
  if (key === "monthly_revenue_goal_usd" && Number.isFinite(n)) {
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  if (value == null || value === "") return "—";
  return String(value);
}

/** @param {Record<string, unknown>} item @returns {string} */
export function formatPlatformEventSummary(item) {
  const eventType = item?.event_type;
  const meta = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const key = meta.key ?? item?.entity_id;

  if (eventType === "settings.updated" && key) {
    const label = SETTING_LABELS[key] || `setting “${key}”`;
    const actor = formatActor(item.actor_display, item.actor_type);
    const oldVal = meta.old_value ?? meta.oldValue;
    const newVal = meta.new_value ?? meta.newValue;

    if (oldVal !== undefined && newVal !== undefined) {
      const from = formatSettingValue(key, oldVal);
      const to = formatSettingValue(key, newVal);
      if (key === "monthly_revenue_goal_usd") {
        return `${actor} updated ${label} from $${from} to $${to}`;
      }
      return `${actor} updated ${label} from ${from} to ${to}`;
    }

    if (key === "monthly_revenue_goal_usd") {
      return `${actor} updated ${label}`;
    }
  }

  return item?.summary || "Activity";
}
