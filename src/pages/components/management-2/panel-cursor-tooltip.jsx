import { useCallback, useState } from "react";

/** Marker on the panel that bounds cursor-relative tooltip position. */
export const PANEL_CURSOR_TIP_ATTR = "data-panel-cursor-tip";

/**
 * Keep tooltip inside panel bounds (coords relative to panel top-left).
 */
export function clampPanelCursorPosition(
  relX,
  relY,
  panelRect,
  estW = 220,
  estH = 88,
  offset = 12,
  preferAbove = true,
) {
  const pad = 10;
  const w = panelRect?.width ?? 0;
  const h = panelRect?.height ?? 0;
  let left = relX + offset;
  let top = preferAbove ? relY - estH - offset : relY + offset;
  const maxL = Math.max(pad, w - estW - pad);
  const maxT = Math.max(pad, h - estH - pad);
  left = Math.min(Math.max(pad, left), maxL);
  top = Math.min(Math.max(pad, top), maxT);
  return { left, top };
}

/**
 * Single floating tooltip per panel; position updates on pointer move.
 * Rows should NOT call clear on mouseLeave (gaps between rows cause flicker).
 */
export function usePanelCursorTooltip() {
  const [tip, setTip] = useState(null);

  const update = useCallback((payload, event, panelEl) => {
    const panel =
      panelEl ?? event.currentTarget.closest(`[${PANEL_CURSOR_TIP_ATTR}]`);
    if (!panel) return;
    const panelRect = panel.getBoundingClientRect();
    const x = event.clientX - panelRect.left;
    const y = event.clientY - panelRect.top;
    setTip((prev) => {
      if (
        prev?.payload?.id === payload?.id &&
        Math.abs(prev.x - x) < 2 &&
        Math.abs(prev.y - y) < 2
      ) {
        return prev;
      }
      return { payload, x, y, panelRect };
    });
  }, []);

  const clear = useCallback(() => setTip(null), []);

  const targetHandlers = useCallback(
    (payload) => ({
      onMouseEnter: (e) => update(payload, e),
      onMouseMove: (e) => update(payload, e),
    }),
    [update],
  );

  const handlePanelLeave = useCallback((e) => {
    const related = e.relatedTarget;
    const panel = e.currentTarget;
    if (related instanceof Node && panel.contains(related)) return;
    clear();
  }, [clear]);

  const panelBindings = useCallback(
    () => ({
      [PANEL_CURSOR_TIP_ATTR]: "",
      onMouseLeave: handlePanelLeave,
    }),
    [handlePanelLeave],
  );

  /** Panel-level move: avoids flicker when crossing child elements / row gaps. */
  const PANEL_TIP_ROW_ATTR = "data-panel-tip-row";

  const panelRowBindings = useCallback(
    (resolvePayloadFromRow) => ({
      [PANEL_CURSOR_TIP_ATTR]: "",
      onPointerMove: (e) => {
        const panel = e.currentTarget;
        const hit = e.target.closest(`[${PANEL_TIP_ROW_ATTR}]`);
        if (!hit || !panel.contains(hit)) return;
        const payload = resolvePayloadFromRow(hit);
        if (!payload) return;
        update(payload, e, panel);
      },
      onPointerLeave: handlePanelLeave,
    }),
    [update, handlePanelLeave],
  );

  const rowTipAttr = (id) => ({ [PANEL_TIP_ROW_ATTR]: id });

  return {
    tip,
    update,
    clear,
    panelBindings,
    panelRowBindings,
    targetHandlers,
    rowTipAttr,
    PANEL_TIP_ROW_ATTR,
  };
}

export function PanelCursorTooltip({
  tip,
  children,
  estimateWidth = 220,
  estimateHeight = 88,
  preferAbove = true,
}) {
  if (!tip?.panelRect) return null;
  const { left, top } = clampPanelCursorPosition(
    tip.x,
    tip.y,
    tip.panelRect,
    estimateWidth,
    estimateHeight,
    12,
    preferAbove,
  );

  return (
    <div
      className="pointer-events-none absolute z-50"
      style={{ left, top }}
      role="tooltip"
    >
      {typeof children === "function" ? children(tip.payload) : children}
    </div>
  );
}
