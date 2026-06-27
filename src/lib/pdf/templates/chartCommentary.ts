// Phase 1 — Chart + commentary template.
// Chart, caption, and a short interpretation line travel as one block so they
// never split across pages.
import { type Doc, subTitle, paragraph, placeChartImage, placeChartFallback } from "../engine";

export interface ChartCommentaryOpts {
  caption: string;
  imageUrl: string | null | undefined;
  maxHeight?: number;
  /** Optional 1-2 line interpretation under the chart. */
  interpretation?: string;
  /** Shown only when the chart image is missing (active charts only). */
  fallbackMessage?: string;
}

export function placeChartCommentary(doc: Doc, opts: ChartCommentaryOpts) {
  subTitle(doc, opts.caption);
  if (opts.imageUrl) {
    placeChartImage(doc, opts.imageUrl, opts.maxHeight ?? 220);
  } else if (opts.fallbackMessage) {
    placeChartFallback(doc, opts.fallbackMessage);
  } // else: silent — no future-chart placeholders in Phase 1
  if (opts.interpretation) {
    paragraph(doc, opts.interpretation, { size: 9, italic: true });
  }
}
