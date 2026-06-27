// =============================================================================
// Concept AI — PDF Chart Registry (Phase 1)
// -----------------------------------------------------------------------------
// Names of charts captured for the PDF, keyed by stable `data-pdf-chart` ids.
// Phase 1 only enables the three charts that exist on the dashboard today.
// Future ids are declared (typed) but NOT rendered as placeholders — the
// exporter must not draw "Chart pending data" cards for charts that aren't
// scheduled until later phases.
// =============================================================================

import html2canvas from "html2canvas-pro";

/** Phase 1 — currently active chart ids. Capture and render only these. */
export const ACTIVE_CHART_IDS = [
  "fmart-radar",
  "market-growth",
  "capex-breakdown",
] as const;

/** Forward-declared ids for Phases 4–5. Not captured nor rendered in Phase 1. */
export const FUTURE_CHART_IDS = [
  "tam-sam-som-funnel",
  "competitor-positioning",
  "risk-heatmap",
  "cash-balance-24m",
  "revenue-vs-expenses",
  "cumulative-cash-flow",
  "customer-ramp",
  "mrr-arr-growth",
  "scenario-comparison",
  "unit-economics",
  "funding-gap",
  "sensitivity-tornado",
  "evidence-mix",
  "source-quality",
] as const;

export type ActiveChartId = (typeof ACTIVE_CHART_IDS)[number];
export type FutureChartId = (typeof FUTURE_CHART_IDS)[number];
export type ChartId = ActiveChartId | FutureChartId;

export type ChartMap = Partial<Record<ActiveChartId, string | null>>;

/**
 * Capture only currently active charts from a given root element.
 * Returns dataURLs by id, or null when the node is missing / blank.
 * Future ids are intentionally NOT walked.
 */
export async function captureActiveCharts(rootEl: HTMLElement | null | undefined): Promise<ChartMap> {
  const out: ChartMap = {};
  if (!rootEl) return out;
  for (const id of ACTIVE_CHART_IDS) {
    const node = rootEl.querySelector<HTMLElement>(`[data-pdf-chart="${id}"]`);
    if (!node) { out[id] = null; continue; }
    const target = (node.querySelector(".recharts-wrapper") as HTMLElement) || node;
    const rect = target.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) { out[id] = null; continue; }
    try {
      const c = await html2canvas(target, {
        scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false,
      });
      const url = c.toDataURL("image/png");
      out[id] = url && url.length > 2000 ? url : null;
    } catch {
      out[id] = null;
    }
  }
  return out;
}
