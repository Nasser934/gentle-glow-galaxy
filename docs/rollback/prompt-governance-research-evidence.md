# Prompt Governance and Research Evidence Rollback

This release is additive. Its database tables and nullable columns can remain
in place if the application code is rolled back; no destructive database
rollback is required.

## Fast feature rollback

- Set `CONCEPT_RESOLVER_ENABLED=false` for `analysis-worker` to skip Concept
  Resolution. Specific briefs continue through the existing report stages;
  materially broad briefs fail with a user-safe message instead of being
  silently scored.
- Set `VITE_RESEARCH_SOURCES_ENABLED=false` at frontend build time to hide the
  Research & Sources tab. Saved research snapshots remain available for a
  later re-enable.

Neither switch contains or depends on a provider secret.

## Code rollback

Revert the commits on `agent/prompt-governance-research-evidence` in reverse
order, or redeploy the last known-good commit from `main`. Leave
`report_research_runs`, `report_research_sources`, and the nullable
`analysis_jobs` provenance columns in place. Older code does not depend on
them, and removing them would make rollback unnecessarily destructive.

If only prompt behavior must be restored, revert the prompt-source commit and
run:

```bash
npm run prompts:build
npm run prompts:check
```

Commit the regenerated `promptBundle.generated.ts` with its matching Markdown
and JSON sources. Never restore only the generated file because the staleness
check will correctly reject a mismatched bundle.

## Data and compatibility

- Do not delete saved research runs, sources, prompt hashes, or resolved
  concepts. They are inert when the feature is disabled and remain useful for
  audit history.
- Existing report output is not rewritten by this release.
- Legacy and `external_agent.v1` reports continue to use their embedded
  citation fallback when no durable research run exists.
- Re-runs keep their immediate `parent_report_id` and stable `root_report_id`;
  rollback must not re-parent existing report rows.

## Recovery validation

After a rollback, run `npm test`, `npm run typecheck`, `npm run lint`, and
`npm run build`. Open one legacy report, one external-agent report, and one
new-format report. Confirm report rendering, sharing, exports, and re-run
creation before promoting the rollback.
