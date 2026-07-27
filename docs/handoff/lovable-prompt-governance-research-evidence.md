# Lovable Integration Handoff Prompt

Copy the prompt below into Lovable after the pull request is available.

---

You are integrating a completed, tested implementation into the Concept AI
project:

- Repository: `Nasser934/gentle-glow-galaxy`
- Base branch: `main`
- Feature branch: `agent/prompt-governance-research-evidence`
- The feature branch is the source of truth for this integration.

Do not recreate the feature from scratch. Inspect the branch diff, preserve its
architecture, and connect any repository, Supabase, Edge Function, route, or UI
integration that Lovable Cloud did not pick up automatically.

## Objective

The implementation upgrades the existing asynchronous deep-research pipeline
without creating a second report engine:

```text
User input
→ start-analysis
→ analysis_jobs and queue
→ analysis-worker
→ Kimi research planning
→ parallel Tavily search
→ Tavily extraction
→ Kimi research review
→ Concept Resolver
→ resolved baseline scenario
→ staged market, financial, decision, and actions analysis
→ deterministic arithmetic and FMART-O validation
→ report save
→ permanent research snapshot save
→ report rendering and exports
```

Keep the existing limits:

- Maximum 6 research rounds
- Maximum 60 planned queries
- Maximum 120 unique sources
- 20 Tavily results per query
- Parallel searching
- Batched extraction

Do not call live Kimi or Tavily while checking the integration.

## Main changes already implemented

### 1. Central prompt governance

The editable prompt sources are under:

```text
supabase/functions/_shared/ai/
├── concept-ai-policy.md
├── prompts/
│   ├── research-planner.md
│   ├── research-reviewer.md
│   ├── concept-resolver.md
│   ├── market-analyst.md
│   ├── financial-analyst.md
│   ├── decision-analyst.md
│   ├── actions-analyst.md
│   └── report-editor.md
├── policies/
├── schemas/resolved-concept.schema.ts
├── promptManifest.ts
└── promptBundle.generated.ts
```

Edge Functions import only `promptBundle.generated.ts`. They must not read
Markdown or JSON files at runtime.

Commands:

```bash
npm run prompts:build
npm run prompts:check
```

`prompts:check` must fail if the generated bundle does not match its source
files. Every new job/report stores the policy version, prompt version, prompt
hash, model ID, and report schema version in the existing provenance fields.

### 2. Concept Resolver

The resolver runs after research review and before report generation:

- Implementation:
  `supabase/functions/_shared/conceptResolver.ts`
- Schema:
  `supabase/functions/_shared/ai/schemas/resolved-concept.schema.ts`
- Job field:
  `analysis_jobs.resolved_concept`
- Report field:
  optional `output.resolvedConcept`

It selects a research-supported baseline from 2–3 plausible scenarios, keeps
alternatives, separates user facts/research/inference/assumptions, and records
unresolved private decisions.

The top-level job status remains `researching`; only
`research_state.phase = "resolving"` is new.

Feature switch:

```text
CONCEPT_RESOLVER_ENABLED=false
```

This disables the resolver without deleting stored data. Do not use an API key
as a feature switch.

### 3. Brief Clarity and deterministic decision logic

`inputQualityScore` remains for backward compatibility, but the UI label and
meaning are now **Brief Clarity**.

Missing public facts do not reduce Brief Clarity or FMART-O:

- Market size and growth
- Competitor names, URLs, and public pricing
- Public regulations, licences, and standards
- Public technology maturity/options
- Public cost and demand benchmarks

Missing private decisions may still reduce Brief Clarity:

- Budget
- Timeline
- Internal team capability
- Internal constraints/dependencies
- Proprietary traction, quotations, or contracts

Brief Clarity, research quality, and decision readiness cannot change:

- `scores.financial`
- `scores.market`
- `scores.achievability`
- `scores.risk`
- `scores.timing`
- `scores.operational`
- `scores.overall`
- `scores.verdict`

FMART-O is finalized in code:

```text
overall >= 7.5              → PROCEED
overall >= 6.0 and < 7.5    → PROCEED WITH CAUTION
overall >= 4.5 and < 6.0    → REVISE
overall < 4.5               → DO NOT PROCEED
```

The finalizer:

1. Adds missing evidence metadata.
2. Normalizes weights to a sum of 1.
3. Recalculates the weighted FMART-O score.
4. Sets the authoritative verdict.
5. Caps confidence based on evidence quality.
6. Filters claim citations to saved source IDs.
7. Calculates readiness independently.
8. Rebuilds the display decision from the finalized score.
9. Sanitizes user-facing text before save.

It also rejects invalid report arithmetic in the section that produced it, so
the existing stage retry regenerates the correct section:

- CapEx item totals must match low/high totals.
- CapEx midpoint must match `(low + high) / 2`.
- Annual OpEx must equal monthly OpEx × 12.
- Market and financial currency must match.
- Parsed market values must satisfy `TAM >= SAM >= SOM`.

Decision readiness is on a 0–10 scale:

```text
35% research quality
25% average analyst confidence
25% claim-to-source coverage
15% resolved-scenario completeness
minus a bounded penalty for unresolved high-impact private decisions
```

Bands:

```text
7.5–10.0 → READY
5.0–7.4  → NEEDS VALIDATION
< 5.0    → INSUFFICIENT EVIDENCE
```

### 4. Permanent research storage

Apply the additive migration:

```text
supabase/migrations/20260727122948_add_report_research_snapshots.sql
```

It adds nullable prompt/resolver provenance fields to `analysis_jobs` and
creates:

- `report_research_runs`
- `report_research_sources`

The migration also adds indexes, comments, the `can_view_report(report_id)`
helper, RLS read policies, and client write restrictions.

Expected access:

- Report owners can read their research snapshot.
- Anyone allowed to view a public report can read its research snapshot.
- Unrelated users cannot read private report research.
- Browser clients cannot insert, update, or delete research rows.
- Service-role Edge Functions perform writes.

Persistence is implemented in:

```text
supabase/functions/_shared/researchPersistence.ts
```

Saving is idempotent:

- One research run per report.
- Unique source key: `(report_id, normalized_url)`.
- Sources are upserted in batches.
- Excerpts are capped at 6,000 characters.
- A retry does not duplicate a run or source.
- Research persistence failure keeps the report row and retries the saving
  stage; it must not silently mark the job completed.

### 5. Research & Sources UI

The report workspace has one tab:

```text
Research & Sources
```

Primary files:

```text
src/lib/reportResearch.ts
src/components/report/research/ResearchSourcesPanel.tsx
src/components/report/evidence/ReportEvidenceSummary.tsx
src/pages/Results.tsx
src/pages/SharedReport.tsx
```

The tab shows:

- Research totals and quality
- Covered/missing categories
- Freshness warnings
- Executed queries and statuses
- Research review
- Full saved source list
- 20-source pagination
- Category/domain/authority/extraction/freshness filters
- Relevance/authority/date/domain/strength sorting
- Safe external links using `rel="noopener noreferrer"`

The initial mobile view does not load all excerpts.

Feature switch:

```text
VITE_RESEARCH_SOURCES_ENABLED=false
```

This hides the new tab without deleting research data.

Legacy and external-agent reports fall back to recognized embedded sources
such as `output.research.sources` and `output.research.citations`. They show a
`Legacy research snapshot` label or a safe empty state.

### 6. Evidence placement

The report-level decision/evidence summary appears once in the report Overview.
It contains:

- FMART-O score and authoritative verdict
- Decision readiness
- Research quality
- Resolved analytical baseline
- Brief Clarity
- Evidence mix
- Unresolved private decisions

Detailed research quality, query history, sources, freshness, gaps, and
claim-evidence mapping belong in Research & Sources.

Do not re-add the old full `EvidenceSections` component to every report tab.
Decision Room now links to Research & Sources instead of repeating a top-source
list.

### 7. Async entry points and legacy engine

The frontend continues to use:

```text
start-analysis → analysis-worker
```

`analyze-concept` is now a deprecated compatibility proxy to
`start-analysis`. It must not generate a separate eight-result final report.

Do not move `autofill-brief` or `complete-field` into the expensive
deep-research pipeline.

Do not route existing `source_mode=external_agent` reports through the Concept
Resolver unless the owner explicitly re-runs them through the internal
analysis pipeline.

### 8. Re-run behavior

A re-run:

- Leaves the original report unchanged.
- Creates a new child report.
- Uses the immediate source report as `parent_report_id`.
- Keeps the family root in `root_report_id`.
- Stores its own prompt provenance, resolved concept, research run, and
  sources.
- Compares FMART-O, confidence, readiness, research quality, changed inputs,
  and unresolved private decisions.
- Reuses an in-flight matching job idempotently.

Do not change new children to point directly to the root.

## Lovable integration checklist

1. Pull the feature branch exactly as committed.
2. Confirm these imports resolve in all changed Edge Functions.
3. Apply the new migration in timestamp order.
4. Regenerate Supabase types using the project-supported workflow after the
   migrated database is available. Compare the output with
   `src/integrations/supabase/types.ts`; do not remove unrelated generated
   fields.
5. Deploy only these changed Edge Function entry points:
   - `start-analysis`
   - `analysis-worker`
   - `analyze-concept`
6. Confirm shared modules are included by those deployments:
   - `_shared/analysisCore.ts`
   - `_shared/evidence.ts`
   - `_shared/researchAgent.ts`
   - `_shared/conceptResolver.ts`
   - `_shared/researchPersistence.ts`
   - `_shared/ai/**`
7. Do not rename or rotate:
   - `KIMI_CODE_API_KEY`
   - `TAVILY_API_KEY`
   - `LOVABLE_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
8. Confirm the worker service role can upsert both research tables.
9. Confirm authenticated/public report reads pass RLS and unrelated reads fail.
10. Confirm the Results route recognizes `?tab=research`.
11. Confirm old reports, external-agent reports, sharing, PDF/PPTX/XLSX export,
    and re-runs still render.
12. Do not trigger a paid analysis for smoke testing. Use existing reports,
    fixtures, or mocked provider responses.

## Required local checks

Run:

```bash
npm run prompts:check
npm test
npm run typecheck
npm run lint
npm run build
```

Expected repository result at handoff:

- 14 Vitest files pass.
- 94 tests pass.
- TypeScript passes.
- Prompt bundle check passes.
- Production build passes.
- ESLint has zero errors; existing warnings may remain.

Also run Deno checks for the three changed Edge Function entry points and the
changed shared modules in an environment that can resolve `deno.land` and
`esm.sh`.

Run the SQL/RLS test suite against a local or preview Supabase database. The
Codex environment could not run the database tests because Docker/Postgres was
not available, so do not mark database checks complete until Lovable executes
them.

## Manual smoke tests

Without starting a paid provider run:

1. Open a new-format completed report.
2. Confirm the Overview has exactly one report-level evidence summary.
3. Open Research & Sources and verify totals, queries, filters, sorting, and
   20-row pagination.
4. Test a stored 120-source fixture/report.
5. Test a report with zero sources.
6. Test a legacy report.
7. Test an `external_agent.v1` report.
8. Test desktop and approximately 390 px mobile widths.
9. Test light and dark modes.
10. Test long titles and URLs for horizontal overflow.
11. Export PDF, PPTX, and XLSX from an existing report.
12. Create a mocked re-run and confirm immediate-parent/root semantics and
    version deltas.

## Failure diagnosis

If Research & Sources is empty for a new report:

1. Check `reports.source_snapshot_metadata.researchPersistenceStatus`.
2. Check one `report_research_runs` row exists for the report.
3. Check `report_research_sources.report_id` matches the completed report.
4. Check the saving stage retried instead of marking the job completed.
5. Check RLS through `can_view_report(report_id)`.

If Concept Resolution does not run:

1. Confirm `CONCEPT_RESOLVER_ENABLED` is not `false`.
2. Check `research_state.phase` reaches `resolving`.
3. Check `analysis_jobs.resolved_concept`.
4. Confirm cited resolver source IDs exist in `research_state.sources`.

If the displayed verdict differs from FMART-O:

1. Confirm `finalizeReportDeterministically` runs after
   `ensureEvidenceFields`.
2. Confirm no later function writes `scores.verdict`.
3. Confirm `buildDecisionSummary` runs after readiness.
4. Confirm exporters prefer the finalized canonical report.

If a generated report fails repeatedly:

1. Read the safe stage error, not provider credentials or private prompt text.
2. Check CapEx totals, OpEx × 12, currency consistency, and TAM/SAM/SOM order.
3. Confirm validation runs immediately after the market or financial part so
   the retry regenerates that same part.

## Safety boundaries

- Do not edit the original user input.
- Do not label inferred baseline details as user-provided.
- Do not let Brief Clarity, evidence quality, or readiness change FMART-O.
- Do not cite a source absent from the saved snapshot.
- Do not log provider keys, tokens, private inputs, complete prompts, extracted
  bodies, or service-role credentials.
- Do not drop or rewrite existing report data.
- Do not weaken RLS.
- Do not remove external-agent or legacy adapters.
- Do not deploy or change production secrets without explicit owner approval.

The rollback guide is:

```text
docs/rollback/prompt-governance-research-evidence.md
```

If integration fails, keep the feature branch and Draft PR intact. Disable the
resolver and Research & Sources UI through the two feature switches above
instead of deleting the additive database objects.

---
