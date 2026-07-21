# Report Quality Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the older reports' decision usefulness across PDF, PowerPoint, and Excel without reintroducing unsupported facts, false zeroes, `Month 0`, or the old stray `62` defect.

**Architecture:** Keep canonical report generation as the single source of truth. Improve the deterministic Supabase seed so degraded AI runs still contain specific costs, labeled scenario estimates, tailored risks, and actionable roadmap content; normalize invalid break-even values at the server/export boundary; and make Excel preserve unknown values rather than coercing them to zero. PDF and PowerPoint continue to consume the same canonical report and therefore gain the richer content without diverging calculations.

**Tech Stack:** TypeScript, Supabase Edge Functions (Deno-compatible), React/Vite, Vitest, ExcelJS, jsPDF, PptxGenJS.

## Global Constraints

- Preserve the current authentication, RLS, privacy, canonical validation, MCP, and CI fixes on GitHub `main`.
- Treat `0` as an internal missing-value sentinel only where the existing schema requires a number; never display it as real revenue, market size, payback, or break-even.
- Break-even/payback must be a positive month when present; otherwise display `Requires validation`.
- Every deterministic estimate must include an explicit assumption basis and remain distinguishable from verified evidence.
- Do not copy the old report's stray `62`, unsupported figures presented as facts, or duplicate filler.
- Use red-green-refactor for every behavior change and run the complete verification suite before publishing.

---

### Task 1: Enforce positive break-even semantics

**Files:**
- Modify: `src/test/unit/financialValidation.test.ts`
- Create: `src/test/unit/exportDecisionPack.test.ts`
- Modify: `src/test/unit/reportSeed.test.ts`
- Modify: `supabase/functions/_shared/analysis/financial.ts`
- Modify: `supabase/functions/_shared/analysis/reportSeed.ts`
- Modify: `src/lib/exportDecisionPack.ts`

**Interfaces:**
- Consumes: `validateFinancialModel(report)`, `buildBaseReportFromSeed(args)`, `extractBreakEvenMonth(raw)`.
- Produces: positive-only break-even validation and the canonical fallback label `Requires validation`.

- [ ] **Step 1: Write failing tests for zero-month inputs**

```ts
it("rejects zero-month break-even", () => {
  const report = makeReport();
  report.financials.breakEvenSummary = "Month 0";
  expect(validateFinancialModel(report).warnings.map((warning) => warning.code))
    .toContain("break_even_invalid");
});

it("never exports Month 0", () => {
  expect(extractBreakEvenMonth("Month 0")).toBeNull();
  const report = makeReport();
  report.financials.breakEvenSummary = "Month 0";
  expect(buildExportDecisionPack(report, inputs).financial.breakEvenDisplay)
    .toBe("Requires validation");
});
```

- [ ] **Step 2: Run the focused tests and verify the expected failures**

Run: `npm test -- src/test/unit/financialValidation.test.ts src/test/unit/exportDecisionPack.test.ts src/test/unit/reportSeed.test.ts`

Expected: failures showing `Month 0` is currently accepted or displayed.

- [ ] **Step 3: Implement positive-month normalization**

```ts
function positiveMonth(value: unknown, fallback: number): number {
  const rounded = Math.round(finite(value, fallback));
  return rounded > 0 ? rounded : fallback;
}

const breakEvenMonths = positiveMonth(
  scenario.breakEvenMonths,
  [12, 18, 30][index],
);
```

In `validateFinancialModel`, change the bound to `breakEven.value <= 0`; in `extractBreakEvenMonth`, return only finite values greater than zero and map explicit zero-month/year strings to `Requires validation`.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `npm test -- src/test/unit/financialValidation.test.ts src/test/unit/exportDecisionPack.test.ts src/test/unit/reportSeed.test.ts`

Expected: all focused tests pass.

### Task 2: Restore decision-useful deterministic content

**Files:**
- Modify: `src/test/unit/resilientReport.test.ts`
- Modify: `src/test/unit/reportSeed.test.ts`
- Modify: `supabase/functions/_shared/analysis/resilientSeed.ts`
- Modify: `supabase/functions/_shared/analysis/reportSeed.ts`

**Interfaces:**
- Consumes: submitted concept inputs, parsed budget range, project type, public research.
- Produces: five tailored risks, five CapEx categories, four OpEx categories, three labeled financial scenarios, five contextual recommendations, and four contextual next steps.

- [ ] **Step 1: Write failing tests for rich fallback behavior**

```ts
it("builds labeled non-zero scenario estimates from a submitted budget", () => {
  const resilient = buildResilientReportSeed({
    inputs,
    publicResearch: limitedResearch,
    degradedReason: "structured_output_truncated",
  });
  const base = buildBaseReportFromSeed({
    seed: resilient.seed,
    inputs,
    publicResearch: limitedResearch,
    inputIssues: [],
  });

  expect(base.financials.capEx).toHaveLength(5);
  expect(base.financials.opEx).toHaveLength(4);
  expect(base.financials.scenarios.every((scenario) =>
    scenario.annualRevenue !== "Requires validation")).toBe(true);
  expect(base.financials.scenarios.map((scenario) => scenario.breakEven))
    .toEqual(["12 months", "18 months", "30 months"]);
  expect(new Set(base.risks.map((risk) => risk.mitigation)).size).toBe(5);
});
```

- [ ] **Step 2: Run the fallback tests and verify they fail**

Run: `npm test -- src/test/unit/resilientReport.test.ts src/test/unit/reportSeed.test.ts`

Expected: failures because fallback scenarios currently contain zero outcomes, costs are generic, and risk mitigations repeat.

- [ ] **Step 3: Implement transparent deterministic assumptions**

Use the budget range as the only financial anchor. Split it into five CapEx categories and derive a monthly operating envelope equal to 6% of CapEx midpoint, divided across four named OpEx categories. Calculate each scenario outcome from annual OpEx plus CapEx recovery over a positive payback period:

```ts
const paybackMonths = [12, 18, 30];
const annualValues = paybackMonths.map((months) =>
  Math.round(monthlyOpEx * 12 + capExMid / (months / 12))
);
```

Every scenario basis must say it is an AI-estimated planning assumption derived from submitted budget and operating-envelope assumptions. Tailor mitigations by risk keywords (`data/security/privacy`, `integration/dependency`, `adoption/demand`, `cost/funding`, `regulatory/compliance`, and competition), each with an action and measurable gate. Build recommendations and next steps from the submitted assumptions, dependencies, success factors, and regulatory considerations.

- [ ] **Step 4: Run fallback tests and verify they pass**

Run: `npm test -- src/test/unit/resilientReport.test.ts src/test/unit/reportSeed.test.ts`

Expected: all focused fallback tests pass.

### Task 3: Keep both analysis endpoints aligned

**Files:**
- Create: `supabase/functions/_shared/analysis/promptRules.ts`
- Create: `src/test/unit/promptRules.test.ts`
- Modify: `supabase/functions/analyze-concept/index.ts`
- Modify: `supabase/functions/analyze-concept-v2/index.ts`

**Interfaces:**
- Produces: `REPORT_CONTENT_RULES`, shared verbatim by both Edge Function prompts.

- [ ] **Step 1: Write a failing shared-prompt test**

```ts
it("requires positive break-even and specific mitigations", () => {
  expect(REPORT_CONTENT_RULES).toContain("positive month");
  expect(REPORT_CONTENT_RULES).toContain("specific mitigation");
  expect(REPORT_CONTENT_RULES).toContain("internal missing-value sentinel");
  expect(REPORT_CONTENT_RULES).not.toContain("Use zero for unsupported figures");
});
```

- [ ] **Step 2: Run the prompt test and verify it fails because the module does not exist**

Run: `npm test -- src/test/unit/promptRules.test.ts`

Expected: module-resolution failure for `promptRules`.

- [ ] **Step 3: Add and use the shared rules**

```ts
export const REPORT_CONTENT_RULES = `Use full currency-unit numbers. Prefer transparent estimates grounded in the submitted budget, value model, and cited research. Use 0 only as an internal missing-value sentinel when no defensible basis exists; never present it as a real outcome. Break-even or payback must be a positive month. Give every material risk a specific mitigation with an owner, action, and measurable gate. Never invent a citation or source ID.`;
```

Import this constant into both `analyze-concept` endpoints and interpolate it into each system prompt.

- [ ] **Step 4: Run prompt and Edge Function checks**

Run: `npm test -- src/test/unit/promptRules.test.ts`

Run: `npm run check:edge`

Expected: prompt test and all Edge Function bundle checks pass.

### Task 4: Preserve unknowns and improve Excel decision-readiness

**Files:**
- Modify: `src/test/integration/exports.test.ts`
- Modify: `src/lib/exportXlsx.ts`

**Interfaces:**
- Consumes: canonical report scenario outcomes.
- Produces: numeric scenario cells only for positive known outcomes; validation text otherwise; sensitivity formulas only when a usable base outcome exists; frozen headers and consistent print/layout styling.

- [ ] **Step 1: Write failing workbook regression tests**

```ts
it("does not coerce unknown scenario outcomes into zero", () => {
  const report = structuredClone(demoReport);
  report.financials.scenarios.forEach((scenario) => {
    scenario.annualFinancialBenefit = undefined;
    scenario.annualValueDisplay = "Requires validation";
  });
  const workbook = buildReportWorkbook(report, demoInputs);
  expect(workbook.getWorksheet("Scenarios")!.getRow(2).getCell(4).value)
    .toBe("Requires validation");
  const sensitivity = workbook.getWorksheet("Sensitivity")!;
  expect(sensitivity.getColumn(3).values.some((value) =>
    typeof value === "object" && value !== null && "formula" in value)).toBe(false);
});
```

- [ ] **Step 2: Run the export test and verify it fails with a numeric zero/formulas**

Run: `npm test -- src/test/integration/exports.test.ts`

Expected: the scenario cell is `0` and sensitivity formulas are present.

- [ ] **Step 3: Implement nullable numeric parsing and sheet finishing**

```ts
const positiveNumber = (value?: unknown): number | null => {
  const parsed = numericValue(value, Number.NaN);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
```

Write the scenario value as `positiveNumber(value) ?? "Requires validation"`. If the base outcome is null, replace the sensitivity calculations with a clear validation message. Finish every worksheet with frozen header rows, print margins, repeatable header/footer text, wrapped cells, and alternating light row fills without overriding semantic risk colors.

- [ ] **Step 4: Run all export tests**

Run: `npm test -- src/test/integration/exports.test.ts`

Expected: all PDF, PowerPoint, and Excel integration tests pass.

### Task 5: Full verification and GitHub publication

**Files:**
- Review all modified files from Tasks 1-4.

**Interfaces:**
- Produces: one GitHub branch, one commit, and one draft pull request targeting `main`.

- [ ] **Step 1: Run the complete verification suite**

Run: `npm ci`

Run: `npm run lint`

Run: `npm run typecheck`

Run: `npm run check:edge`

Run: `npm test`

Run: `npm run build`

Expected: every command exits 0; lint may retain only the repository's documented pre-existing warnings.

- [ ] **Step 2: Inspect the final diff and scope**

Run: `git status -sb`

Run: `git diff --check`

Run: `git diff --stat`

Expected: only report-generation, export, tests, and this plan are changed; no credentials, schema, RLS, auth, or unrelated files.

- [ ] **Step 3: Publish through the connected GitHub app**

Create branch `agent/restore-report-quality` from the current `main` SHA, create blobs/tree/commit from the verified local files, update the branch ref, and open a draft PR titled `Restore decision-useful report quality` with validation results and root-cause notes.

## Self-Review

- Spec coverage: backend fallback, break-even semantics, tailored content, PDF/PPTX shared content, XLSX unknown handling and styling, tests, and GitHub publication are covered.
- Placeholder scan: no `TBD`, `TODO`, or deferred implementation step remains.
- Type consistency: positive break-even remains a display string in `Financials`; missing commercial outcomes remain the existing `Requires validation` string; internal numeric outcomes are only written when positive.
