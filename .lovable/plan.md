# Consumer Evidence & Improvement Layer

This is a large feature touching the data model, the analysis backend, the dashboard, the Analyze wizard, and the recommendation engine. I want to ship it in 4 reviewable phases instead of one giant change, so we can test after each phase and avoid breaking the existing report, PDF export, share links, and AI Complete buttons.

## Guiding rules (applied everywhere)

- **Backward compatible.** Old reports must keep rendering. New fields are optional. When missing, show: *"Evidence detail is available for newly generated reports. Re-run analysis to calculate input quality and evidence mix."*
- **Consumer-safe wording only.** No "QA failed", "fallback used", "template mismatch", "source notes empty", raw errors. Use: *Needs validation, Evidence is limited, Input detail is incomplete*, etc.
- **Score ≠ confidence.** Adding inputs raises *confidence*, not the feasibility score. The score can go down if new info reveals weakness — that is correct behavior.
- **Verdict rules (new):**
  - 8.5–10 + High confidence + risks mitigated → **Proceed**
  - 7.0–8.4 → **Conditional Proceed** (with *…with validation* if confidence < High)
  - confidence < 50% → never "Proceed"
  - critical risks without mitigation → never "Proceed"
  - input quality < 60% → "Improve inputs before investment decision"
  - AI assumption ratio > 40% → recommendation must include "Needs validation"
  - weak market evidence → next step = market validation, not launch
  - missing financial inputs → next step = financial validation, not execution

---

## Phase 1 — Data model + derivation helpers (no UI changes yet)

**Goal:** every report (old or new) can answer the new questions, even if the AI didn't produce the fields.

1. Extend `FeasibilityReport` in `src/types/analysis.ts` with optional fields:
   - `inputQualityScore?: number`
   - `inputCompleteness?: { overall, missingFields[], weakFields[], contradictoryFields[] }`
   - `evidenceMix?: { userInputPercent, webResearchPercent, aiAssumptionPercent }`
   - `scoreExplanation?: ScoreExplanationRow[]` (one per FMART + Operational dimension)
   - `claimEvidenceMap?: ClaimEvidenceRow[]`
   - `reportVersions?: ReportVersion[]`

2. New module `src/lib/evidence.ts` with **pure derivation functions** used both by the UI and the edge function:
   - `assessInputQuality(inputs: ConceptInputs)` → field-by-field status (`complete | needs_improvement | weak | missing`) + overall 0–100 score + impact text + suggested improvement per field. Covers all 14 input areas in the spec.
   - `deriveEvidenceMix(report, inputs)` → fallback computation from citation count + input completeness + dimension confidence when the AI didn't return one.
   - `deriveScoreExplanation(report, inputs)` → fallback builder per dimension using existing `scores.rationale`, `confidence`, and findings.
   - `deriveClaimEvidenceMap(report, inputs)` → seeds standard claims (market growth, break-even, CAC, competition, regulatory) from the existing report.
   - `computeVerdict({ score, confidenceAvg, inputQuality, aiAssumptionPct, criticalRisksWithoutMitigation, marketEvidenceWeak, financialsMissing })` → returns `{ verdict, recommendationLabel, nextStepHint, blockers[] }` implementing the new rules above.

3. Wire derivation into the report loader so the UI always has these fields. In `src/pages/Results.tsx` / `DecisionRoom.tsx` / `SharedReport.tsx`, after fetching the report do:
   ```ts
   const enriched = ensureEvidenceFields(report, inputs);
   ```
   `ensureEvidenceFields` fills missing optional fields from the derivation helpers — old reports get sensible values, new reports keep AI-provided values.

4. Add a `legacyReport` flag when fields were derived (not from AI). The UI uses it to show the "Re-run analysis to calculate input quality and evidence mix" notice on old reports.

## Phase 2 — Backend: have the analyzer emit the new fields

1. Update the prompt + JSON schema in `supabase/functions/analyze-concept/index.ts` (the v2 flow) to ask the model to return `inputQualityScore`, `inputCompleteness`, `evidenceMix`, `scoreExplanation`, and `claimEvidenceMap`. Keep the existing fields untouched.
2. Server-side, after the model returns, run the same `evidence.ts` helpers to **fill any field the model omitted** so the client always receives a complete object.
3. Recompute `scores.verdict` using `computeVerdict(...)` server-side too, so saved reports persist the corrected verdict (the BRD correction: 7.0–8.4 is *Conditional Proceed*, not *Proceed*).
4. Sanitize: strip any internal QA strings ("fallback", "template", "qa", "repair") from text fields before returning to the client.

## Phase 3 — Dashboard UI sections

All new components live under `src/components/report/evidence/` and are rendered in `Results.tsx` (owner view) and `DecisionRoom.tsx` (executive view). Public `SharedReport.tsx` gets read-only versions without the "Improve inputs" button.

1. `WhyThisScore.tsx` — card grid, one per dimension, showing score, positive drivers, negative drivers, missing evidence, improvement actions, decision implication. Uses `scoreExplanation`.
2. `InputQualityPanel.tsx` — overall badge (Complete / Needs improvement / Weak / Missing), then a table of all 14 input areas with status badge, impact, suggestion, and an **Edit field** button that deep-links to `/analyze?reportId=…&focus=<fieldKey>`.
3. `EvidenceMixPanel.tsx` — three stacked progress bars (User input / Web research / AI assumption) at report level. Consumer-safe explanation copy.
4. `ClaimEvidenceTable.tsx` — "Evidence behind this report" table from `claimEvidenceMap`. Confidence badge per row. When AI assumption % is high, show the "needs stronger validation" hint inline.
5. Verdict pill component reused across pages updated to read from new `computeVerdict` output (label + blockers tooltip).
6. Badges added to `src/components/ui/`: `Strong input`, `Needs detail`, `Missing`, `AI-heavy assumption`, `Source-backed`, `Needs validation`. Implemented as variants on the existing `Badge`.

Styling stays inside the current Teal/Amber Linear-style tokens — no new gradients or glow.

## Phase 4 — Improve Inputs flow + Versioning

1. **Improve Report Inputs button** on Results and Decision Room. Navigates to `/analyze?reportId=<id>` (and optionally `&focus=<fieldKey>` from Input Quality rows).
2. `Analyze.tsx` reads `reportId` from query string, loads the original inputs from `reports.inputs`, pre-fills the wizard, and highlights weak/missing/contradictory fields using `assessInputQuality`. Adds inline suggestion text under highlighted fields. Existing AI Complete buttons stay.
3. Submit button label flips to **Re-run Analysis** when `reportId` is present. On submit, instead of inserting a brand-new report, call the analyzer, then save a **new row** with `parent_report_id = <id>` and append a `ReportVersion` entry computed from the diff (changed fields, score delta, confidence delta, AI-assumption delta).
4. New DB column on `reports`: `parent_report_id uuid null references reports(id)`. Migration includes GRANTs preserved on the table. RLS unchanged (owner-only writes, public reads when `is_public`).
5. `VersionComparison.tsx` on the report page lists prior versions with score / confidence / AI-assumption deltas and a short summary ("Confidence improved because pricing and competitors were added").

## Technical details

- New files:
  - `src/lib/evidence.ts`
  - `src/components/report/evidence/WhyThisScore.tsx`
  - `src/components/report/evidence/InputQualityPanel.tsx`
  - `src/components/report/evidence/EvidenceMixPanel.tsx`
  - `src/components/report/evidence/ClaimEvidenceTable.tsx`
  - `src/components/report/evidence/VersionComparison.tsx`
- Modified:
  - `src/types/analysis.ts` (additive)
  - `src/lib/reports.ts` (add `ensureEvidenceFields` wrapper, support `parent_report_id`, `listVersions(rootId)`)
  - `src/pages/Results.tsx`, `src/pages/DecisionRoom.tsx`, `src/pages/SharedReport.tsx`, `src/pages/Analyze.tsx`
  - `src/components/report/MethodologyPanel.tsx` (use new verdict)
  - `src/lib/exportPdf.ts` (add Why-this-score, Input Quality, Evidence Mix, Claim Evidence pages; keep existing layout)
  - `supabase/functions/analyze-concept/index.ts`
- Migration: `reports.parent_report_id` + index.
- Verdict rules are centralized in `computeVerdict` so PDF, dashboard, Decision Room, and shared page all agree.

## Testing checklist (run after each phase)

- Old report (pre-feature) renders with the fallback notice, no crash.
- New report shows all 4 new sections populated.
- Weak-input scenario → Input Quality flags the right fields; verdict downgrades correctly.
- Strong inputs + low score → score stays low (confidence rose, score didn't).
- Missing financials → recommendation says financial validation, never "execute".
- AI assumption % > 40 → recommendation includes "Needs validation".
- Confidence < 50% → never "Proceed".
- Re-run flow creates a new version row, prior version still accessible, comparison shows correct deltas.
- PDF export, share link, AI Complete, auth, save all still work.

## Out of scope (flag, don't build)

- Citation deep-linking inside claim evidence rows (would need source anchoring across providers).
- Comment threads on individual claims.
- Admin QA dashboard — explicitly excluded per BRD.

Approve and I'll start with Phase 1.
