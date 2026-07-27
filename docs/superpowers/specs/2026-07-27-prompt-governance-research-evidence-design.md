# Prompt Governance, Research Evidence, and Concept Resolution Design

## Status

Approved for implementation by the user on 2026-07-27. This document records
the accepted architecture from the supplied implementation specification and
the repository audit against `main` at `c054366`.

## Runtime dependency map

The active in-app path is:

`Analyze.tsx` → `src/lib/analysisJobs.ts` → `start-analysis` →
`analysis_jobs`/PGMQ → `analysis-worker` → `researchAgent.ts` →
Tavily search/extract → Kimi review → report-part generation →
`ensureEvidenceFields` → `finalizeReportDeterministically` → `reports` →
`Results.tsx` → exports/version comparison.

The MCP path writes canonical reports through `src/lib/mcp/*` and the bundled
`supabase/functions/mcp/index.ts`. External-agent reports use
`external_agent.v1` normalization in `src/lib/reportContract.ts`. They do not
run through the in-app research pipeline unless explicitly re-run.

The repository also contains `analyze-concept`, a synchronous final-report
engine with a separate Tavily basic search capped at eight results. There is no
repository call site. It must stop being an independent final-analysis engine.
`autofill-brief` and `complete-field` remain lightweight helpers.

The report renderer requires canonical `ConceptInputs` and
`FeasibilityReport`. PDF, XLSX, PPTX, Decision Pack, Results, Shared Report,
Decision Room, and version comparison consume `report.output`.

## Confirmed defects

1. `ensureEvidenceFields` computes a consumer verdict and writes the result
   back to `scores.verdict`. The frontend repeats this on every read. A valid
   FMART-O score can therefore display the wrong authoritative verdict.
2. `computeDecisionReadiness` gives the whole brief-quality score a fixed 25%
   weight.
3. `assessInputQuality` treats research-resolvable public facts, including
   competitor URLs, as user-owned requirements.
4. Research state can hold 120 sources, but completed reports have no durable,
   queryable source snapshot.
5. Report prompts live as hard-coded strings in `analysisCore.ts` and
   `researchAgent.ts`.
6. Broad ideas go directly from research review to scoring.
7. `start-analysis` stores the root as `parent_report_id`, while the schema now
   has a separate `root_report_id`.
8. Evidence detail is mounted in Results, Shared Report, and Decision Room and
   competes with the dashboard research content. There is no permanent
   Research & Sources workspace tab.

## Selected architecture

### Prompt bundle

Markdown and JSON files under `supabase/functions/_shared/ai` are editable
sources. A Node script compiles them into committed TypeScript with SHA-256
hashes. Edge Functions import the generated module only; they never read files
at runtime. A check script fails when sources and generated output differ.

### Concept Resolver

After Kimi research review, the worker changes `ResearchState.phase` to
`resolving` while the job remains in the top-level `researching` stage. The
resolver receives the original inputs, research state, quality, and review. It
returns `resolved-concept.v1`, validates all cited source IDs against the saved
snapshot, and keeps user facts, research facts, inferences, assumptions, and
private decisions distinct.

The resolver has the normal stage retry budget. If it fails and the brief is
specific, report generation may continue without a fabricated resolver result.
If the concept is materially broad, the job ends with safe user wording.

### Scoring and readiness

`ensureEvidenceFields` adds missing evidence structures only. It never changes
FMART-O scores or the legacy verdict.

`finalizeReportDeterministically` owns weight normalization, dimension
normalization, overall score, authoritative verdict, confidence caps, and
readiness.

Readiness uses:

- 35% research quality
- 25% average analyst confidence
- 25% claim-to-source coverage
- 15% resolved-scenario completeness

Only unresolved high-impact private decisions receive an explicit penalty.
Brief Clarity and research-resolvable omissions never alter feasibility.

### Permanent research snapshot

Two additive RLS-protected tables store one research run per report and its
deduplicated sources. The worker upserts the report, run, and sources using
stable conflict keys. The report is not marked complete until research
persistence succeeds. Retry reuses the same run and source rows.

Authenticated clients receive read-only access when
`can_view_report(report_id)` is true. Client inserts, updates, and deletes stay
blocked. The service role writes snapshots.

### Report interface

Results gains a `Research & Sources` workspace tab. It loads the summary and
queries first, then sources in pages of 20 with server-side filters and sorting.
Extracted content is plain text, truncated, collapsed by default, and never
rendered as HTML.

Overview contains one compact report-level evidence summary. Research &
Sources contains detailed quality, queries, freshness, review, sources, and
claim evidence. Other sections keep only claim-specific citations.

Legacy reports fall back to recognized citations in `report.output` and show a
`Legacy research snapshot` label. External-agent reports continue through
their current canonical adapter and get an empty or legacy source view.

### Versions

Each re-run stores the immediate source report in `parent_report_id` and the
family root in `root_report_id`. The child keeps its own prompt provenance,
resolved concept, research run, and source rows. Family queries use
`root_report_id` and retain compatibility with earlier root-parent rows.

### Rollback

Feature flags control the resolver and Research & Sources tab. Reverting the
code commit disables the new flow. Additive tables and nullable columns may
remain unused. The previous generated prompt bundle can be restored by
reverting its source and generated files together.
