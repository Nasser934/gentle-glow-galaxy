
# Phase 0 — PDF/Product Quality Rescue: Audit & Design Spec

Current PDF quality: **3/10**. Build passes, output does not. This phase is **diagnosis + spec only** — no code changes. Implementation lands in Phases 1–7.

---

## 1. Root-cause diagnosis (why the PDF feels like an AI dump)

1. **No decision narrative.** The exporter walks the data model top‑to‑bottom (`drawCover → exec summary → scores → why-this-score → input quality → evidence → market → financial → risk → funding → appendices`). It explains the *report*, not the *decision*.
2. **Evidence layer dominates the main story.** Input Quality, Evidence Mix, Claim Map appear on pages 3–5, before market or financials. They belong near the end and in appendices.
3. **No page-purpose discipline.** `ensureSpace()` only checks remaining height; nothing prevents a section title from landing in the bottom 25% of a page, nothing forces a chart/table to start fresh, nothing repeats section context on continuation pages.
4. **Charts captured by named registry but only 3 names exist** (`fmart-radar`, `market-growth`, `capex`). Financial, risk, evidence, scenario, unit-economics charts do not exist as data-backed visuals at all.
5. **Financial model is static strings.** `Financials.scenarios[].annualRevenue: "SAR 18.9M"`, `breakEvenSummary: "Month 4–6"`. The 24-month deterministic engine the user wants does not exist, and the PDF leaks this by printing "not available" wording.
6. **Citations are unfiltered.** `MarketResearch.citations` is printed verbatim — Tavily snippets, markdown `#`, duplicates, missing titles, no relevance ranking.
7. **Tables are too wide.** Assumption Register, Why-this-score, Claim Map use 7–9 columns squeezed into 499pt content width → 6.8–8pt fonts, awkward wraps, orphan headings.
8. **Verdict duplication.** `cleanRecommendationLabel` only handles prefix collisions; Decision Scorecard + Why-this-score + Methodology each restate the same scoring story.
9. **Cover KPI is clipped.** `BREAK-EVEN (BASE)` uses `splitTextToSize(...)` then prints only `v[0]` → "Break-even occurs in Month" with the month dropped on the second wrap line.
10. **TOC + page numbering.** TOC is rendered last then page-shuffled; section page references are recorded *before* `addPage()` calls inside the section, so deep references can drift by ±1.

---

## 2. Page-by-page diagnosis (current output)

| Pg | Section | Problems |
|----|---------|----------|
| 1 | Cover | Break-even KPI truncated. No top drivers, no blockers count, no funding need, no runway. Provenance bar present but no source-quality snapshot. Feels like a title page, not an investment memo cover. |
| 2 | TOC | OK structurally; page refs can drift ±1 due to TOC injection order. |
| 3 | Exec Summary + Scorecard + Radar + start of "Why this score" | 4 things on one page. Exec summary is a long AI paragraph. Scorecard and Why-this-score restate the same info. Radar squeezed. |
| 4 | "Why this score" continuation + Evidence Mix heading | Table breaks without "(continued)" header. **Orphan heading**: Evidence Mix title at page bottom, content on next page. Input Quality block is too prominent and appears before market/financial. |
| 5 | Evidence Mix + Claim Evidence + start of Market | Evidence interrupts the decision flow. Market begins after provenance content. |
| 6 | Competitive landscape + research signals | Crammed. Citations: raw markdown, truncated snippets, duplicate "Tavily web" labels, no relevance, no takeaway curation. |
| 7 | Citations continuation → Financial Analysis | Major section starts after a broken unrelated table. "24-month deterministic forecast not available" wording — credibility killer. |
| 8 | CapEx chart + OpEx + Scenarios + Risks + Funding | 5 sub-sections crammed. CapEx chart disconnected from caption. Tables too dense. No section separation. |
| 9 | Strategic Recommendations + Next Steps | Generic. Not tied to validation gates, milestones, or funding decisions. |
| 10–11 | Appendix A Project Brief + Appendix B Assumption Register | Brief is a dump. Register is a 9-column DB table at 6.8pt. **Orphan heading**: "Improvement Plan — Top Actions" at bottom of p11, content on p12. |
| 12 | Appendix C Methodology | Mostly whitespace. Report ends weakly. |

---

## 3. Target architecture — new page order

```text
1   Cover (Investment Memo cover)
2   Executive Decision Memo (CEO 60s read)
3   Investment Snapshot (KPI grid)
4   Feasibility Scorecard (radar + 6-row table)
5   Financial Forecast (24m charts, or Legacy summary if no forecast)
6   Unit Economics & Scenario Comparison
7   Market & Customer
8   Competition & Positioning
9   Risk & Mitigation (heatmap)
10  Validation Roadmap (30/60/90)
11  Evidence & Source Quality
A   Appendix A — Project Brief (grouped)
B   Appendix B — Assumption Register (5-col, grouped)
C   Appendix C — Methodology (short)
D   Appendix D — Version History (only if data exists)
```

Each page = **one purpose**. No section starts in the bottom 25% of a page. Continuation pages repeat `"<Section> — continued"`.

---

## 4. Data model gaps (drive Phases 3+)

Current `FeasibilityReport` is missing:

- `financialForecast` (the whole 24m engine)
  - `assumptions: FinancialAssumption[]`  (initialCash, capexMonth1, arpu, churnMonthlyPct, cacPerCustomer, grossMarginPct, payroll/cloud/sales/compliance/otherOpex, ramp, priceGrowth, expansion)
  - `monthly: { pessimistic, base, optimistic } : MonthlyFinancialProjection[24]`
  - `summary: { pessimistic, base, optimistic } : ScenarioSummary` (breakEvenMonth, minCash, fundingGap, runwayMonths, month24Revenue/MRR/Customers, maxBurn, payback, ltv, cac, ltvCacRatio)
  - `riskFlags: FinancialRiskFlag[]`
- `unitEconomics` (derived but exposed for charts)
- `validationRoadmap` (30/60/90 plan tying actions → assumptions → score impact)
- `decisionDrivers` (top 3 reasons-can-work, top 3 reasons-can-fail)  ← for cover + memo
- `sourceQuality` (per-source: type, publisher, relevance, supportedClaim, confidence)

Existing fields kept; legacy reports must export gracefully (Phase 5 legacy fallback).

---

## 5. Chart inventory (named registry — no positional capture)

Required `data-pdf-chart="..."` IDs:

| ID | Source today | Phase to add |
|----|--------------|--------------|
| `fmart-radar` | ✅ exists | — |
| `market-growth` | ✅ exists | — |
| `capex` | ✅ exists | rename to `capex-breakdown`, gain caption |
| `tam-sam-som-funnel` | ❌ | P4 |
| `competitor-positioning` (2×2) | ❌ | P4 |
| `risk-heatmap` | ❌ | P4 |
| `cash-balance-24m` | ❌ | P4 |
| `revenue-vs-expenses` | ❌ | P4 |
| `cumulative-cash-flow` | ❌ | P4 |
| `customer-ramp` | ❌ | P4 |
| `mrr-arr-growth` | ❌ | P4 |
| `scenario-comparison` | ❌ | P4 |
| `unit-economics` (cards, not chart) | ❌ | P4 |
| `funding-gap` | ❌ | P4 |
| `sensitivity-tornado` | partial in SensitivityPanel | P4 (wire registry) |
| `evidence-mix` | ❌ (drawn directly in PDF today) | P4 (also render in DOM for parity) |
| `source-quality` | ❌ | P4 |

Rules:
- Each chart appears **once**.
- Each chart has caption + source/interpretation line.
- If data missing → render a **professional fallback card** ("Requires validation"), never a blank PNG.
- Capture only via `[data-pdf-chart="name"]`; never by index.

---

## 6. Layout engine rules (Phase 1)

- Page templates: `cover`, `memo`, `kpi-grid`, `chart+commentary`, `table`, `appendix`.
- `startSection(title)`: if remaining page < 25% → `addPage()` first.
- `placeTable(rows)`: if estimated height > 60% of page → `addPage()` first; always `showHead: "everyPage"`, `rowPageBreak: "avoid"`, and on continuation write `"<Section> — continued"` header band.
- `placeHeading(text)`: must be followed by ≥1 row of body or it gets pushed to next page (orphan prevention buffer ≥ 60pt).
- Max 5 columns in any main-report table. Wider tables → appendix or Excel.
- Font floors: body 9pt, tables 8.5pt, footnotes 7.5pt. No 6.8pt anywhere.
- TOC computed in a second pass after final pagination — page refs stable.
- "Page X of Y" stamped in a final pass (already in place — keep).
- Visual vocabulary: cards, callout bands, dividers, restrained color (one accent + neutrals). Reduce blue-table density.

---

## 7. Citation hygiene rules (Phase 2)

A citation is **printed only if** it has: clean title, identifiable source/publisher, URL, takeaway ≥ 20 chars, and is not a duplicate (by URL or title hash). Pre-print pipeline:
1. Strip markdown (`#`, `*`, backticks), collapse whitespace, trim ellipses.
2. Drop generic "Tavily web" labels without specifics.
3. Rank by relevance score (token overlap with concept + section), keep **top 5–7** in main report.
4. Full list → Appendix or Excel.
5. Columns in main report: Source · Title · Type · Relevance · Supports · Confidence.

---

## 8. Wording rules

- Remove every "feature not available", "simulator missing", "not yet implemented" string from PDF text.
- Legacy financial fallback wording: *"A detailed 24-month model should be generated before funding approval."*
- Rename "Input Quality" → **"Validation Required"** (decision-support framing).
- Sanitize all dev/QA terms via existing `sanitizeForConsumer` (already wired) — extend dictionary as needed.
- No internal QA language in main report; report-quality talk lives only in Evidence section + appendices.

---

## 9. Acceptance criteria ("world-class PDF")

A build is acceptable only when **all** of these are visually verified on a real PDF:

- CEO can read the decision in 60 seconds (pages 1–2).
- Investor can follow the money logic in 2 minutes (pages 3, 5, 6).
- Product owner sees exactly what to validate next (page 10).
- 0 orphan headings, 0 broken tables, 0 duplicated charts, 0 blank charts.
- 0 raw markdown/garbage citations.
- 0 "feature missing" wording.
- Financials are mathematically linked (forecast → KPIs → charts → Excel all from one `forecast.ts`).
- Legacy reports (no `financialForecast`) export cleanly via fallback.
- No section starts in bottom 25% of a page.
- Every chart has caption + interpretation.
- Page count target: 14–18 (main 11 + 3–4 appendices).

---

## 10. Phased implementation roadmap (no code yet — confirms scope)

- **Phase 1 — Layout engine**: page templates, orphan prevention, continuation headers, KPI/cover/memo primitives, TOC pass, no financial changes.
- **Phase 2 — Structure rewrite**: new page order, citation hygiene, "Validation Required" rename, dedup scorecard/why/methodology, drop "not available" wording, legacy financial fallback.
- **Phase 3 — Financial Model v2**: types + `src/lib/forecast.ts` deterministic engine; LLM provides assumptions only; powers dashboard, PDF, Excel, sensitivity.
- **Phase 4 — Dashboard charts**: all named-registry charts rendered in DOM with `data-pdf-chart`.
- **Phase 5 — PDF financial pages**: Forecast, Unit Economics, Scenario Comparison, Sensitivity, selected-months table.
- **Phase 6 — Excel v2**: assumptions sheet + scenario sheets with live formulas + summary dashboard.
- **Phase 7 — QA**: typecheck, build, **actual PDF rendered and visually inspected page-by-page** with written notes against the acceptance criteria. Build success alone is not acceptance.

---

## 11. Phase 0 deliverable — what I'm asking you to approve

Approve this audit + spec (sections 1–9) and the phase split (section 10). On approval I'll switch to build mode and execute **Phase 1 only** next, with a visual QA pass before moving to Phase 2.

No code, file edits, or schema changes have been made.
