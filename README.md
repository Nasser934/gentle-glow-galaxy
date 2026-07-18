# Concept AI

Concept AI is an evidence-aware feasibility-analysis MVP prepared for the ADAPT 2026 Global AI Hackathon in Project Management. A guided concept brief becomes a server-validated FMART-O report, an Analysis Dashboard, an Executive Decision Room, and consistent PDF, PowerPoint, and Excel exports.

- Published app: https://gentle-glow-galaxy.lovable.app
- Synthetic judge demo: https://gentle-glow-galaxy.lovable.app/demo
- Lovable project: https://lovable.dev/projects/51d58cb5-2265-4414-a562-40b8cac715bf

## Current MVP capabilities

- Guided four-step brief with AI suggestions that the user must explicitly accept; accepted and subsequently edited fields retain origin metadata.
- Tavily research and guarded competitor-page extraction, with canonical URLs, source-quality classes, recency flags, independent-domain coverage, and explicit claim-to-source IDs.
- Deterministic FMART-O scoring across Financial, Market, Achievability, Risk, Timing, and Operational dimensions. The server validates scores and weights, recalculates the authoritative score, and applies evidence, input-quality, and critical-risk governance rules.
- Financial consistency checks for CapEx, OpEx, funding shares, scenario probabilities, investment runway, currency, and TAM ≥ SAM ≥ SOM. Unsupported precise figures are labelled as estimates or as requiring validation.
- Analysis Dashboard, seeded internal/commercial scenario simulation, risk register, explicit provenance, report comparison, flat comments, status history, version families, and owner-controlled public links.
- Canonical PDF, PowerPoint, and Excel exports. Excel preserves numeric cells and formulas; PowerPoint uses broadly available font fallbacks; PDF text is generated as selectable text.
- Authenticated user workspace with owner-controlled reports and explicit shared review links. Public reports are read-only.
- Stable public demo using synthetic internal-project data. It does not write to the database unless a signed-in user separately creates and saves an analysis.

Model-estimated confidence is an analysis indicator constrained by input completeness and evidence support. It is not accuracy, statistical certainty, or a calibrated prediction interval. Estimated Evidence Composition is a heuristic based on input completeness and available sources; claim provenance categories are the authoritative provenance display.

## Not current capabilities

The following are roadmap items, not implemented product claims:

- Trained predictive cost or schedule models, historical organization learning, or statistically calibrated accuracy.
- ERP, PPM, ServiceNow, Primavera, or Microsoft Project integrations.
- Organizations, workspaces, portfolio optimization, committee roles, autonomous approvals, or enterprise tenant governance.
- Independent Finance, Market, Risk, or Product review agents.
- Proven production adoption, paying customers, or measured time-reduction outcomes.

The current access model is an authenticated user workspace with report ownership and revocable public review links. Organization and portfolio governance belongs on the roadmap.

## Evidence and calculation model

Every major claim has a stable claim ID and one provenance category: User input, Cited source, Calculation, AI inference, Mixed, or Unknown. Sources have stable IDs, publisher/domain/date metadata, and quality levels. Community discussions are directional signals and are not treated as equivalent to official, government, academic, or primary evidence.

The model may propose dimension scores, weights, an overall score, a verdict, and confidence indicators. The authoritative server pipeline ignores the proposed overall score and verdict, validates or replaces weights, calculates the weighted score precisely, caps confidence deterministically, validates financial relationships, and stores audit metadata. Screens and exports consume that canonical object.

## Architecture

```text
src/pages
  Index             Landing and truthful MVP positioning
  Analyze           Guided brief and explicit AI-suggestion acceptance
  Results           Owner workspace, Analysis Dashboard, evidence, exports
  DecisionRoom      Executive Decision Room / 90-Second Judge Mode
  SharedReport      Exact-slug, read-only public view
  Compare           Up to three owner-accessible report versions

supabase/functions
  analyze-concept   Validation, research, AI, canonical score/report pipeline
  autofill-brief    AI draft suggestions for empty/selected brief fields
  complete-field    Single-field AI suggestion

Database
  reports                    Private-by-default reports and version audit data
  report_slug_aliases        Safe aliases preserving legacy report links
  report_comments            Flat review comments
  report_status_history      Database-derived status audit trail
  notifications              Comment notifications and recipient isolation
  analysis_requests          Privacy-safe request lifecycle and idempotency
  analysis_rate_limits       Persistent user/IP/function usage windows
  profiles                   Restricted profile data
```

## Configuration

Frontend variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Edge Function secrets/configuration:

- `LOVABLE_API_KEY`
- `TAVILY_API_KEY`
- `ANALYSIS_MODEL_ID` (optional; the saved report records the actual configured model ID)
- `ALLOWED_ORIGINS` (optional comma-separated production origins)
- `RATE_LIMIT_HASH_SALT` (optional dedicated salt; the Edge Function otherwise uses its server-only Supabase service key as the hash salt)

Never commit secrets. The repository contains only public client configuration expected by Supabase and additive migrations.

## Local development and verification

Requires Node.js 20.19.5 or newer.

```bash
npm ci
npm run lint
npm run typecheck
npm run check:edge
npm run test
npm run build
```

Database migrations are additive under `supabase/migrations`. Database policy tests are under `supabase/tests/database` and require a linked or local Supabase/Postgres environment with pgTAP.

## GitHub and Lovable synchronization

The Lovable project is connected bidirectionally to this GitHub repository. Work is developed and verified on a feature branch, then merged into the Lovable-connected active branch. That Git commit becomes the restorable Lovable history point; no Lovable prompt or credit is required for repository-originated changes.

## Hackathon judge demo

1. Open `/demo` without signing in.
2. Confirm both synthetic-data labels at the top.
3. Review the guided brief summary and server-validated FMART-O score.
4. Inspect financial assumptions, risks, source coverage, and claim provenance in Overview.
5. Open **90-Second Judge Mode** for the Executive Decision Room.
6. Return to `/demo`, open Export, and generate PDF, PowerPoint, or Excel.
7. Note that the demo is read-only and creates no database row.

## License

Proprietary. All rights reserved.
