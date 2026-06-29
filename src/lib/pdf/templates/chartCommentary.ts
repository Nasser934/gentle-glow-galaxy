// Phase 2A — Chart + commentary template (safe placement).
// Reserves space for heading + chart + interpretation as a single block.
// If chart image is missing, the heading is suppressed (no stranded headings).
import {
  type Doc, subTitle, paragraph, placeChartImage, placeChartFallback,
  reserveBlock,
} from "../engine";

export interface ChartCommentaryOpts {
  caption: string;
  imageUrl: string | null | undefined;
  maxHeight?: number;
  interpretation?: string;
  /** Shown only when the chart image is missing AND we still want the section to render. */
  fallbackMessage?: string;
}

export function placeChartCommentary(doc: Doc, opts: ChartCommentaryOpts) {
  // If we have nothing to show, render nothing — don't strand the heading.
  if (!opts.imageUrl && !opts.fallbackMessage) return;

  const chartH = opts.imageUrl ? (opts.maxHeight ?? 220) : 80;
  // Reserve heading (~26pt) + chart + interpretation (~24pt) so the block
  // never splits across pages and the heading never sits alone at the bottom.
  reserveBlock(doc, 30 + chartH + (opts.interpretation ? 28 : 8));

  subTitle(doc, opts.caption);
  if (opts.imageUrl) {
    placeChartImage(doc, opts.imageUrl, opts.maxHeight ?? 220);
  } else if (opts.fallbackMessage) {
    placeChartFallback(doc, opts.fallbackMessage);
  }
  if (opts.interpretation) {
    paragraph(doc, opts.interpretation, { size: 9, italic: true });
  }
}
