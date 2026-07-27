# Prompt Governance, Research Evidence, and Concept Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing 120-source async pipeline into a centrally governed,
research-persistent report flow that resolves broad concepts before scoring and
keeps FMART-O independent from brief clarity and evidence readiness.

**Architecture:** Keep the existing queue, worker stages, report contract, and
external-agent adapter. Add a generated prompt bundle, a resolving research
phase, additive research tables, idempotent persistence, and a report-native
Research & Sources tab. Move all authoritative score and verdict work into the
deterministic finalizer.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Supabase Edge Functions,
Deno, PostgreSQL/RLS, PGMQ, Kimi structured output, Tavily search/extract.

## Global Constraints

- Keep up to 6 rounds, 60 queries, 120 sources, 20 Tavily results per query,
  parallel search, and batched extraction.
- Do not call paid providers from tests or manual validation.
- Preserve `external_agent.v1`, legacy reports, exports, sharing, and re-runs.
- Add database changes through timestamped additive migrations only.
- Keep original inputs separate from the resolved scenario.
- FMART-O uses the supplied weighted score and the four fixed verdict bands.
- Missing public facts affect confidence/readiness only.
- Do not change existing secret names or log private prompt/input bodies.

---

### Task 1: Prompt bundle and provenance

**Files:**
- Create: `supabase/functions/_shared/ai/concept-ai-policy.md`
- Create: `supabase/functions/_shared/ai/prompts/*.md`
- Create: `supabase/functions/_shared/ai/policies/*.json`
- Create: `supabase/functions/_shared/ai/promptManifest.ts`
- Create: `supabase/functions/_shared/ai/promptBundle.generated.ts`
- Create: `scripts/build-prompt-bundle.mjs`
- Create: `scripts/check-prompt-bundle.mjs`
- Modify: `package.json`
- Test: `src/lib/promptBundle.test.ts`

**Interfaces:**
- Produces: `PROMPT_BUNDLE`, `PROMPT_BUNDLE_VERSION`,
  `PROMPT_BUNDLE_HASH`, `getStagePrompt(stage)`.

- [ ] Write a test that runs the compiler in check mode, verifies all eight
  stages, verifies hashes, and rejects a stale generated bundle.
- [ ] Run `npm test -- src/lib/promptBundle.test.ts` and confirm the missing
  compiler/bundle failure.
- [ ] Add source prompts, JSON policies, compiler, generated TypeScript, and
  package scripts.
- [ ] Run `npm run prompts:build` and
  `npm test -- src/lib/promptBundle.test.ts`.
- [ ] Commit the prompt-governance slice.

### Task 2: Brief responsibility, resolver, and deterministic decision logic

**Files:**
- Create: `supabase/functions/_shared/ai/schemas/resolved-concept.schema.ts`
- Create: `supabase/functions/_shared/conceptResolver.ts`
- Modify: `supabase/functions/_shared/analysisCore.ts`
- Modify: `supabase/functions/_shared/evidence.ts`
- Modify: `src/lib/evidence.ts`
- Modify: `src/types/analysis.ts`
- Test: `supabase/functions/_shared/conceptGovernance.test.ts`
- Test: `src/lib/evidence.test.ts`

**Interfaces:**
- Produces: `ResolvedConcept`, `resolveConcept`,
  `validateResolvedConcept`, `resolvedScenarioCompleteness`,
  `claimSourceCoverage`.

- [ ] Write failing tests for public-field exclusions from Brief Clarity,
  resolver source-ID validation, unresolved private decisions, verdict
  immutability, readiness weights, and FMART-O bands.
- [ ] Run the focused tests and confirm each failure names missing behavior.
- [ ] Add the resolver schema/validator and responsibility classification.
- [ ] Remove verdict writes from both `ensureEvidenceFields` implementations.
- [ ] Update readiness to use research, confidence, claim coverage, and resolved
  scenario completeness with high-impact private-decision penalties.
- [ ] Run focused tests and commit this slice.

### Task 3: Worker integration and prompt use

**Files:**
- Modify: `supabase/functions/_shared/researchAgent.ts`
- Modify: `supabase/functions/_shared/analysisCore.ts`
- Modify: `supabase/functions/analysis-worker/index.ts`
- Modify: `supabase/functions/start-analysis/index.ts`
- Modify: `supabase/functions/analyze-concept/index.ts`
- Test: `supabase/functions/_shared/researchHardening.test.ts`
- Test: `supabase/functions/_shared/conceptGovernance.test.ts`

**Interfaces:**
- Consumes: prompt bundle and `resolveConcept`.
- Produces: research `phase: "resolving"`, job `resolved_concept`, and final
  report `resolvedConcept`.

- [ ] Write failing tests for stage prompt selection, resolving transition,
  broad-concept failure behavior, and specific-concept fallback.
- [ ] Run focused tests and confirm expected failures.
- [ ] Replace hard-coded planner/reviewer/report strings with governed prompts.
- [ ] Add resolver stage persistence and retry behavior before generation.
- [ ] Deprecate `analyze-concept` as a final engine and route authenticated
  final analyses to the durable job entry point without changing field helpers.
- [ ] Run focused tests and commit this slice.

### Task 4: Additive schema and idempotent research persistence

**Files:**
- Create through Supabase CLI:
  `supabase/migrations/*_add_report_research_snapshots.sql`
- Create: `supabase/functions/_shared/researchPersistence.ts`
- Modify: `supabase/functions/analysis-worker/index.ts`
- Modify: `supabase/functions/start-analysis/index.ts`
- Modify: `src/integrations/supabase/types.ts`
- Modify: `supabase/tests/external_report_contract_rls.sql`
- Test: `supabase/functions/_shared/researchPersistence.test.ts`

**Interfaces:**
- Produces: `persistReportResearchSnapshot(db, payload)`,
  `report_research_runs`, and `report_research_sources`.

- [ ] Write failing unit tests with a stateful fake database proving one run,
  no duplicate sources on retry, 120-source persistence, metadata preservation,
  and surfaced failures.
- [ ] Run focused tests and confirm failures.
- [ ] Use `supabase migration new add_report_research_snapshots`.
- [ ] Add nullable provenance/resolver job columns, research tables, indexes,
  comments, grants, read policies using `can_view_report`, and blocked client
  writes.
- [ ] Add idempotent persistence and call it before marking the job complete.
- [ ] Add SQL policy tests for owner/shared access and unrelated-user/client
  write denial.
- [ ] Update generated types from the migration shape and run schema/type
  consistency tests.
- [ ] Commit this slice.

### Task 5: Research repository and report interface

**Files:**
- Create: `src/lib/reportResearch.ts`
- Create: `src/components/report/research/ResearchSourcesPanel.tsx`
- Create: `src/components/report/research/ResearchSourcesPanel.test.tsx`
- Create: `src/components/report/evidence/ReportEvidenceSummary.tsx`
- Modify: `src/pages/Results.tsx`
- Modify: `src/pages/Results.test.tsx`
- Modify: `src/components/report/InteractiveDashboard.tsx`
- Modify: `src/components/report/evidence/EvidencePanel.tsx`
- Modify: `src/pages/SharedReport.tsx`
- Modify: `src/pages/DecisionRoom.tsx`

**Interfaces:**
- Produces: `getReportResearchRun`,
  `listReportResearchSources`, and one `Research & Sources` workspace tab.

- [ ] Write failing component tests for one report summary, 20-row paging,
  filters, sorting, long URLs, zero sources, legacy fallback, and external
  reports.
- [ ] Run focused UI tests and confirm expected failures.
- [ ] Add the typed repository queries and paged source component.
- [ ] Add the tab and compact Overview summary.
- [ ] Move detailed evidence/claim mapping into Research & Sources and remove
  repeated report-level mounts from other report sections.
- [ ] Run focused tests at 390 px and desktop test dimensions.
- [ ] Commit this slice.

### Task 6: Re-run semantics, versions, exports, and compatibility

**Files:**
- Modify: `supabase/functions/start-analysis/index.ts`
- Modify: `supabase/functions/analysis-worker/index.ts`
- Modify: `src/lib/reports.ts`
- Modify: `src/lib/evidence.ts`
- Modify: `supabase/functions/_shared/evidence.ts`
- Modify only as required: export modules under `src/lib/export*` and
  `src/lib/pdf/*`
- Test: `src/lib/reports.test.ts`
- Test: `src/lib/evidence.test.ts`
- Test: existing report contract/export suites

**Interfaces:**
- Produces: immediate `parent_report_id`, stable `root_report_id`, and version
  deltas for readiness, research quality, and unresolved decisions.

- [ ] Write failing tests for immediate-parent semantics and root family
  listing, original-row immutability, snapshot independence, and new deltas.
- [ ] Run focused tests and confirm failures.
- [ ] Persist immediate parent and root separately and update family queries
  with legacy fallback.
- [ ] Extend version entries without breaking old entries.
- [ ] Run external-agent, legacy, share, export, and report-contract suites.
- [ ] Commit this slice.

### Task 7: Verification, rollback, and publication

**Files:**
- Create: `docs/rollback/prompt-governance-research-evidence.md`
- Modify: documentation only for exact validation and deployment status.

- [ ] Run `npm run prompts:check`.
- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run Deno checks for every changed Edge Function and shared module.
- [ ] Run Supabase migration and SQL-policy checks available in the repository.
- [ ] Start the app with mocked/local data and inspect mobile, desktop, light,
  dark, 120-source, zero-source, legacy, and external-agent states.
- [ ] Confirm no live Tavily or Kimi request occurred.
- [ ] Review `git diff`, commit all intended files, push the branch, and open a
  draft PR against `main`.
- [ ] Report every command result, deployment status, gap, assumption, and
  manual verification step.
