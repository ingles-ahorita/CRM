import React from "react";

// LeadItem.jsx-compatible YES/NO/TBD dropdown (UI only).
// Mirrors the look in CloserTodaysLeads exactly: colored bg, "PICK UP" / "CONFIRMED"
// / "SHOW UP" / "PURCHASED" labels, fixed width.
export default function StatusDropdown({
  value,
  onChange,
  label,
  disabled = false,
  outcomeLog = null,
}) {
  const getBackgroundColor = () => {
    const isDontQualify = Array.isArray(outcomeLog)
      ? outcomeLog.some((ol) => ol?.outcome === "dont_qualify")
      : outcomeLog?.outcome === "dont_qualify";
    if (isDontQualify && label === "PURCHASED") return "#000000";
    if (label === "PURCHASED") {
      const isLockIn = Array.isArray(outcomeLog)
        ? outcomeLog.some((ol) => ol?.outcome === "lock_in")
        : outcomeLog?.outcome === "lock_in";
      const isFollowUp = Array.isArray(outcomeLog)
        ? outcomeLog.some((ol) => ol?.outcome === "follow_up")
        : outcomeLog?.outcome === "follow_up";
      if (isLockIn || isFollowUp) return "#e9d5ff";
    }
    if (value === true || value === "true") return "#cfffc5ff";
    if (value === false || value === "false") return "#ff9494ff";
    if (value === null || value === "" || value === undefined || value === "null")
      return "#f9ffa6ff";
    return "#f9ffa6ff";
  };

  const isDontQualify =
    (label === "SHOW UP" || label === "PURCHASED") &&
    (Array.isArray(outcomeLog)
      ? outcomeLog.some((ol) => ol?.outcome === "dont_qualify")
      : outcomeLog?.outcome === "dont_qualify");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "3px",
        alignItems: "center",
        justifyContent: "center",
        flex: "1 1 68px",
        minWidth: 50,
      }}
    >
      <label
        style={{
          whiteSpace: "nowrap",
          fontSize: "9px",
          fontWeight: "500",
          color: "#6b7280",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {label}
      </label>
      <select
        value={String(value)}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        style={{
          appearance: "none",
          backgroundColor: getBackgroundColor(),
          color: isDontQualify && label === "PURCHASED" ? "#ffffff" : "#000000",
          borderColor: "#d1d5db",
          border: "1px solid rgba(0,0,0,0.1)",
          padding: "4px 6px",
          borderRadius: "5px",
          fontSize: "12px",
          fontWeight: "500",
          cursor: disabled ? "not-allowed" : "pointer",
          transition: "all 0.1s",
          outline: "none",
          textAlign: "center",
          width: 50,
        }}
        onMouseEnter={(e) => {
          if (disabled) return;
          e.currentTarget.style.opacity = "0.8";
          e.currentTarget.style.borderColor = "#bcbec0ff";
        }}
        onMouseLeave={(e) => {
          if (disabled) return;
          e.currentTarget.style.opacity = "1";
          e.currentTarget.style.borderColor = "#d1d5db";
        }}
      >
        <option
          value={"true"}
          style={{
            backgroundColor: "#cfffc5",
            padding: "12px",
            fontSize: "14px",
            fontWeight: "500",
          }}
        >
          YES
        </option>
        <option value={"false"}>NO</option>
        <option value={"null"}>TBD</option>
      </select>
    </div>
  );
}
