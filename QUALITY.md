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

Or run all checks:

```bash
npm run quality
```

GitHub Actions runs the same quality gate on pushes and pull requests to `main`.

## Completed hardening

- Added CI workflow for lint, typecheck, tests, and build.
- Added `typecheck`, `quality`, `lint:fix`, and `test:coverage` scripts.
- Added Supabase environment validation at startup.
- Added auth session error handling so loading does not get stuck.
- Added reusable page loading fallback for lazy routes.
- Added React Query default behavior.
- Restored Vite dev error overlay.
- Updated app metadata from Lovable placeholders to Concept AI branding.
- Added safe filename helper and unit tests.
- Added owner-scoped report delete and status update filters.
- Added RLS hardening migration template for reports, comments, and status history.

## Required Supabase review before production

Review `supabase/migrations/20260505000000_harden_report_rls.sql` before applying it.

Check these points in Supabase:

- Existing policy names do not conflict with the new policies.
- `reports.slug` is unique and hard to guess.
- `reports.is_public` matches the intended sharing model.
- Comments are readable only when the parent report is visible.
- Status history is visible only to report owners.
- Only owners can update, delete, or change status for reports.

## Next refactor work

The next safe step is to split `src/pages/Results.tsx` into smaller components. It is too large and owns too many responsibilities:

- report toolbar
- sharing logic
- export logic
- PDF preview
- report pages
- dashboard preview

Recommended structure:

```text
src/features/reports/
  components/
    ReportToolbar.tsx
    ReportPdfPreview.tsx
    ShareButton.tsx
    ReportPage.tsx
  hooks/
    useShareReport.ts
    useExportReport.ts
  utils/
    reportFileName.ts
```

## Strict TypeScript path

Strict TypeScript is the target, but it should be enabled in phases:

1. Turn on `strictNullChecks`.
2. Remove `any` from report and Supabase helpers.
3. Add Zod schemas for `ConceptInputs` and `FeasibilityReport`.
4. Turn on `noImplicitAny`.
5. Turn on full `strict`.

Do not enable all strict flags at once unless the full app is tested after each fix.

## Edge Function hardening still recommended

- Add runtime Zod validation after AI tool-call JSON parsing.
- Standardize Supabase JS versions across all Edge Functions.
- Replace in-memory rate limiting with a persistent database-backed limit.
- Restrict CORS origins to production domains.
- Add stricter content-type and content-length checks for competitor scraping.
