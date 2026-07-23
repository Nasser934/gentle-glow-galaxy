# External-Agent Report Canonicalization Implementation Plan

> Execute this plan in the current repository. The user explicitly requested implementation, verification, commit, and push in one pass.

**Goal:** Make every saved external-agent report use the same `ConceptInputs` and `FeasibilityReport` structures as in-app reports, repair legacy rows safely, and replace report-route black screens with actionable compatibility errors.

**Architecture:** Add one shared TypeScript contract that owns canonical Zod validation, legacy alias normalization, authoritative FMART scoring, and safe export preparation. MCP create/update/validate/schema tools call that contract before writes. Report routes validate before evidence enrichment or rendering, while a route error boundary catches unexpected failures. A transactional Supabase migration backfills legacy external rows in place and preserves source payloads in metadata.

**Tech stack:** React 18, TypeScript, Zod, Vitest/Testing Library, Supabase/PostgreSQL, Vite, ESLint.

---

### Task 1: Pin the failure with regression fixtures

**Files:**
- Create: `src/test/fixtures/reports.ts`
- Create: `src/lib/reportContract.test.ts`
- Create: `src/pages/Results.test.tsx`

1. Add a representative canonical in-app fixture.
2. Add a legacy ThermoFlow external-agent fixture identified as `CAI-2026-00000094`.
3. Add failing tests for missing `scores`, required dashboard sections, and legacy normalization.
4. Run the focused tests and confirm they fail for the expected contract gap.

### Task 2: Implement the canonical report contract

**Files:**
- Create: `src/lib/reportContract.ts`
- Modify: `src/types/analysis.ts`
- Modify: `src/lib/evidence.ts`

1. Define canonical `ConceptInputs` and `FeasibilityReport` Zod schemas.
2. Normalize canonical and legacy external aliases into those exact structures.
3. Recalculate weighted FMART totals and verdicts server-side.
4. Produce field-level issues and evidence warnings for absent optional source data.
5. Keep validation strict for every dashboard-critical object and array.
6. Make evidence enrichment defensive only after canonical validation.

### Task 3: Put every MCP write behind the shared contract

**Files:**
- Modify: `src/lib/mcp/shared.ts`
- Modify: `src/lib/mcp/tools/create_external_analysis.ts`
- Modify: `src/lib/mcp/tools/update_external_analysis.ts`
- Modify: `src/lib/mcp/tools/validate_external_analysis.ts`
- Modify: `src/lib/mcp/tools/get_analysis_schema.ts`
- Modify: `src/lib/mcp/tools/get_report_display_link.ts`
- Modify: `src/lib/mcp/tools/generate_report_exports.ts`
- Regenerate: `supabase/functions/mcp/index.ts`
- Create/modify focused MCP tests

1. Publish the canonical input/report schema through `get_analysis_schema`.
2. Normalize and validate before insert/update; reject unsafe payloads with exact paths.
3. Save canonical `inputs` and `output`, preserve external metadata, and keep reports private.
4. Return owner routes for private rows and slug routes only for public rows.
5. Regenerate the MCP Edge Function from source and test write/link behavior.

### Task 4: Guard report rendering and exports

**Files:**
- Create: `src/components/report/ReportCompatibilityPanel.tsx`
- Create: `src/components/report/ReportRouteErrorBoundary.tsx`
- Modify: `src/pages/Results.tsx`
- Modify: `src/pages/SharedReport.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/report/InteractiveDashboard.tsx`
- Modify: `src/lib/exportPdf.ts`
- Modify: `src/lib/exportXlsx.ts`
- Modify: `src/lib/exportPptx.ts`
- Add component/export tests

1. Validate stored inputs/output before `ensureEvidenceFields`.
2. Render the required compatibility panel with issue names, report ID, and My Analyses link.
3. Add report-route error boundaries and a visible Suspense loading screen.
4. Guard optional arrays/nested values without hiding incompatibility warnings.
5. Assert canonical data at each exporter entry point.

### Task 5: Repair legacy external reports in place

**Files:**
- Create: `supabase/migrations/*_canonicalize_external_agent_reports.sql`
- Create: `supabase/tests/external_report_contract_rls.sql`

1. Generate a migration through the Supabase CLI.
2. Preserve identifiers, ownership, slugs, status, history, timestamps, and source metadata.
3. Store the original legacy input/output in external metadata.
4. Backfill external rows to canonical JSON, including `CAI-2026-00000094`, without inventing market/financial values.
5. Add evidence warnings for schema-safe empty values.
6. Keep and test private-report RLS ownership protections.

### Task 6: Verify, review, commit, and push

1. Run focused tests after each implementation slice.
2. Run the Codex Security diff-scan workflow and address validated findings in scope.
3. Run `npm run lint`, the TypeScript equivalent, `npm test`, and `npm run build`.
4. Inspect the final diff and working tree.
5. Commit with a clear message.
6. Push the verified commit to the GitHub repository.
