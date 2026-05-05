# Concept AI Quality Checklist

This checklist tracks the recommended hardening work for the project.

## Current automated checks

Run locally before pushing:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Or run all standard checks:

```bash
npm run quality
```

Use the strict target during cleanup work:

```bash
npm run typecheck:strict
npm run quality:strict
```

Run dependency audit:

```bash
npm run audit
```

GitHub Actions runs the standard quality gate on pushes and pull requests to `main`. It also has a manual `workflow_dispatch` trigger and a separate dependency audit job.

## Completed hardening

- Added CI workflow for lint, typecheck, tests, build, manual trigger, and dependency audit.
- Added `typecheck`, `typecheck:strict`, `quality`, `quality:strict`, `audit`, `lint:fix`, and `test:coverage` scripts.
- Added Supabase environment validation at startup.
- Added auth session error handling so loading does not get stuck.
- Added reusable page loading fallback for lazy routes.
- Added React Query default behavior.
- Restored Vite dev error overlay.
- Updated app metadata from Lovable placeholders to Concept AI branding.
- Added safe filename helper and unit tests.
- Added private-by-default report saving with explicit publish/unpublish helpers.
- Added owner-scoped report delete and status update filters.
- Added idempotent RLS hardening migration for reports, comments, and status history.
- Added database indexes and enum-safe report status constraint.
- Added `edge_rate_limits` table migration for persistent Edge Function rate limiting.
- Removed unsafe casts from the Auth page and guarded OAuth redirects.
- Removed explicit `any` from report persistence and comments mapping.
- Added `analyze-concept-v2` with authenticated access, restricted CORS, DB-backed rate limiting, and runtime AI output validation.
- Switched the frontend analysis flow to `analyze-concept-v2`.
- Added `exportPdfV2` and switched active results exports to it.
- Active `/results` route uses `ResultsV2`; legacy `Results.tsx` and `exportPdf.ts` are excluded from lint and strict typecheck.

## Required Supabase review before production

Apply/review these migrations in Supabase:

```text
supabase/migrations/20260505000000_harden_report_rls.sql
supabase/migrations/20260505001000_report_indexes_and_constraints.sql
supabase/migrations/20260505002000_rate_limits.sql
```

Check these points in Supabase:

- RLS is enabled on `reports`, `report_comments`, and `report_status_history`.
- `reports.slug` is unique and hard to guess.
- `reports.is_public` follows the intended sharing model: reports are private until explicitly published.
- Comments are readable only when the parent report is visible.
- Status history is visible only to report owners.
- Only owners can update, delete, publish, unpublish, or change status for reports.
- `edge_rate_limits` has no client-side access and is used only from Edge Functions through service role.

Required Edge Function secrets:

```text
LOVABLE_API_KEY
SUPABASE_SERVICE_ROLE_KEY
ALLOWED_ORIGINS
```

Recommended `ALLOWED_ORIGINS` value:

```text
https://gentle-glow-galaxy.lovable.app,https://your-custom-domain.com,http://localhost:8080
```

## Report sharing model

Current behavior:

1. Save generated reports as private by default.
2. Show the report to the owner immediately.
3. Publish only when the user clicks Share.
4. Copy `/r/:slug` only after publishing succeeds.
5. Let owners unpublish later.

The report helper supports this through `saveReport`, `publishReport`, and `unpublishReport`.

## Active report/export implementation

Active route:

```text
/results -> src/pages/ResultsV2.tsx
```

Active PDF exporter:

```text
src/lib/exportPdfV2.ts
```

Legacy files retained only because the GitHub connector could not safely delete the oversized blobs:

```text
src/pages/Results.tsx
src/lib/exportPdf.ts
```

They are excluded from lint and strict typecheck. Delete them manually from GitHub once the project is confirmed stable.

## Strict TypeScript path

Strict TypeScript is available through:

```bash
npm run typecheck:strict
```

The current strict target excludes inactive legacy files. Remaining strict errors, if any, should be fixed in active files before turning full strict mode on in `tsconfig.app.json`.

## Release checklist

Before production release:

1. Run GitHub Actions manually from the Actions tab.
2. Run `npm run quality` locally or in Codespaces.
3. Run `npm run audit` and review high-severity dependency findings.
4. Apply Supabase migrations.
5. Deploy `analyze-concept-v2`, `autofill-brief`, and `complete-field` Edge Functions.
6. Configure required Edge Function secrets.
7. Run one end-to-end test: sign in, analyze, save private, share, open `/r/:slug`, unshare, verify public link stops working.
