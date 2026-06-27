// =============================================================================
// Phase 2 — Executive Decision Memo template
// -----------------------------------------------------------------------------
// One-page memo with 6 labeled blocks (Recommendation, Why this can work,
// Why this can fail, Money logic, Validation required, Next 30 days).
// Bullets only — no AI paragraphs.
// =============================================================================

import { type Doc, subTitle, bulletList, paragraph, C } from "../engine";
import type { MemoSections } from "../derive";

export function placeExecutiveMemo(doc: Doc, sections: MemoSections) {
  paragraph(
    doc,
    "Read in under 60 seconds. Each block answers a single executive question.",
    { size: 9, italic: true, color: C.muted },
  );

  const block = (label: string, items: string[]) => {
    if (!items.length) return;
    subTitle(doc, label);
    bulletList(doc, items, { size: 9.5 });
  };

  block("Recommendation", sections.recommendation);
  block("Why this can work", sections.whyCanWork);
  block("Why this can fail", sections.whyCanFail);
  block("Money logic", sections.moneyLogic);
  block("Validation required", sections.validation);
  block("Next 30 days", sections.next30Days);
}
