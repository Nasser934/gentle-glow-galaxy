# Security Policy

## Sensitive data

Do not commit secrets to the repository.

Browser-exposed variables must use the `VITE_` prefix and must only contain publishable/public values.

Server-side secrets must stay in Lovable/Supabase Edge Function secrets:

- `LOVABLE_API_KEY`
- `TAVILY_API_KEY`

## Authentication

The app uses Supabase Auth. Client-side checks are only UX controls. Supabase Row Level Security must enforce ownership and visibility rules.

Required rules:

- Users can create reports only for themselves.
- Users can update/delete only their own reports.
- Public report links can read only reports where `is_public = true`.
- Comments can be read only when the parent report is visible.
- Status history can be read and written only by the report owner.

See `supabase/migrations/20260505000000_harden_report_rls.sql`.

## Sharing model

Current behavior keeps saved reports public by slug because the current `Results` page copies `/r/:slug` immediately after save.

Target model:

1. Save reports as private by default.
2. Add an explicit publish/share action.
3. Add revoke/unpublish support.
4. Prefer a separate `report_shares` table with expiring tokens for higher security.

## Edge Functions

Edge Functions must:

- Require authenticated requests for paid AI operations.
- Apply rate limits per user.
- Validate request body length and shape.
- Validate AI output before returning it to the frontend.
- Restrict CORS origins for production.
- Avoid logging secrets, auth tokens, or full user payloads.

## Reporting a vulnerability

Open a private security advisory in GitHub or contact the repository owner directly. Do not create a public issue for exploitable vulnerabilities.
