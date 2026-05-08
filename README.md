# Concept AI

AI-powered feasibility analysis for project, IT, telecom, infrastructure, government and real-estate concepts. Capture an idea in a guided 4-step brief, get a transparent FMART feasibility report, run financial sensitivity, collaborate with your team, and export to PDF, PowerPoint or Excel.

- Live preview: https://id-preview--51d58cb5-2265-4414-a562-40b8cac715bf.lovable.app
- Published app: https://gentle-glow-galaxy.lovable.app
- Lovable project: https://lovable.dev/projects/51d58cb5-2265-4414-a562-40b8cac715bf

## What it does

Concept AI turns a short concept brief into a structured feasibility report:

- **Guided intake** — four-step form (Overview, Scope, Assumptions, Risks) with AI autofill and per-field completion.
- **Industry templates** — one-click pre-fill for SaaS, Telecom, Infrastructure, Government, Real Estate and Healthcare.
- **FMART scoring** — Financial, Market, Achievability, Risk, Timing and Operational dimensions, each with a confidence score, rationale and configurable weights.
- **Interactive dashboard** — radar chart, risk heatmap, market and CapEx visuals, methodology panel, and evidence chips.
- **Financial sensitivity** — driver sliders, tornado chart and a 2,000-iteration Monte Carlo simulation (P10 / P50 / P90 outcomes).
- **Private-first collaboration** — reports are saved private by default, then published only when the owner clicks Share. Owners can unshare links.
- **Comparison mode** — pick any two saved reports and view them side by side.
- **Multi-format export** — PDF, executive PPTX deck, and XLSX workbook.
- **Authentication** — email/password and Google sign-in. Reports are owner-only by default and shareable by slug after publishing.

## Tech stack

- **Frontend** — Vite, React 18, TypeScript, Tailwind CSS, shadcn/ui, framer-motion, recharts, react-markdown.
- **Backend** — Lovable Cloud / Supabase: Postgres with Row-Level Security, Auth, Edge Functions (Deno).
- **AI** — Lovable AI Gateway.
- **Exports** — `jspdf`, `pptxgenjs`, `exceljs`.

## Architecture

```text
src/pages
  Index            Landing
  Auth             Sign in / sign up (email + Google)
  Analyze          4-step concept brief; tries analyze-concept-v2, then legacy fallback
  ResultsV2        Private-first report dashboard + export/share actions
  Dashboard        My saved reports
  SharedReport     Public-by-slug view (/r/:slug)
  Compare          Side-by-side comparison

supabase/functions
  analyze-concept-v2  Hardened Gemini → FeasibilityReport path with auth and validation
  analyze-concept     Legacy fallback while v2 is rolling out
  autofill-brief      Bulk AI fill of empty brief fields
  complete-field      Single-field AI suggestion

Database (public schema)
  reports                   — concept inputs + FMART output, slug, status, public flag
  report_comments           — threaded comments (RLS: visible when report visible)
  report_status_history     — append-only status changes
  notifications             — owner alerts
  profiles                  — display name + avatar
  user_roles                — admin / user roles
  edge_rate_limits          — persistent Edge Function rate limiting
```

## Local development

Requires Node.js 18+.

```bash
npm install
npm run dev              # start Vite at http://localhost:8080
npm run lint             # run ESLint
npm run typecheck        # run TypeScript checks
npm run typecheck:strict # strict TypeScript target for cleanup work
npm test                 # run Vitest unit tests
npm run build            # production build
npm run quality          # lint + typecheck + test + build
npm run analyze:bundle   # inspect bundle size
```

The `.env` file is generated and managed by Lovable Cloud — do not commit secrets. Browser-safe variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Server-side secrets live in Lovable/Supabase Edge Function secrets:

- `LOVABLE_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOWED_ORIGINS`

Recommended `ALLOWED_ORIGINS`:

```text
https://gentle-glow-galaxy.lovable.app,http://localhost:8080
```

## GitHub Actions

The main CI workflow runs:

- install
- lint (informational)
- typecheck
- tests
- build
- dependency audit (informational)

A second manual workflow is available:

```text
.github/workflows/supabase-deploy.yml
```

Before running it, add these GitHub repository secrets:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_PROJECT_REF
LOVABLE_API_KEY
SUPABASE_SERVICE_ROLE_KEY
ALLOWED_ORIGINS
```

Then run:

```text
GitHub → Actions → Supabase Deploy → Run workflow
```

It can:

- apply database migrations with `supabase db push`
- set Edge Function secrets
- deploy `analyze-concept-v2`
- deploy `autofill-brief`
- deploy `complete-field`

## Quality and security

- See `QUALITY.md` for the hardening checklist, CI details, strict TypeScript path, release checklist, and speed checklist.
- See `SECURITY.md` for the security policy and Supabase RLS requirements.
- Review and apply the migrations in `supabase/migrations/` before production use.

## Deployment

1. Run CI and confirm green.
2. Run the Supabase Deploy workflow after adding required secrets.
3. Open the Lovable project and click **Share → Publish**.
4. Test sign in → analyze → save privately → share → open `/r/:slug` → unshare.

## GitHub sync

Lovable has a bidirectional GitHub integration. Once the repository is connected via **Connectors → GitHub**, every change made inside Lovable is auto-committed and pushed, and any commit pushed to GitHub is auto-pulled back into Lovable.

## Editing this code

- Open the project in Lovable and prompt your changes, or
- Clone the GitHub repository and use your own IDE, or
- Edit files directly on GitHub or via Codespaces.

## License

Proprietary. All rights reserved.
