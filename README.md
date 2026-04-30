# Concept AI

AI-powered feasibility analysis for project, IT, telecom, infrastructure, government and real-estate concepts. Capture an idea in a guided 4-step brief, get a transparent FMART feasibility report grounded in live web research, run financial sensitivity, collaborate with your team, and export to PDF, PowerPoint or Excel.

- Live preview: https://id-preview--51d58cb5-2265-4414-a562-40b8cac715bf.lovable.app
- Published app: https://gentle-glow-galaxy.lovable.app
- Lovable project: https://lovable.dev/projects/51d58cb5-2265-4414-a562-40b8cac715bf

## What it does

Concept AI turns a short concept brief into a structured feasibility report:

- **Guided intake** — four-step form (Overview, Scope, Assumptions, Risks) with AI autofill and per-field completion.
- **Industry templates** — one-click pre-fill for SaaS, Telecom, Infrastructure, Government, Real Estate and Healthcare.
- **Grounded research** — live web search via Tavily plus targeted scraping of competitor URLs, Reddit, Hacker News and Wikipedia. Every finding is backed by citations.
- **FMART scoring** — Financial, Market, Achievability, Risk, Timing and Operational dimensions, each with a confidence score, rationale and configurable weights.
- **Interactive dashboard** — radar chart, risk heatmap, market and CapEx visuals, methodology panel, evidence chips that link findings back to sources.
- **Financial sensitivity** — driver sliders, tornado chart and a 2,000-iteration Monte Carlo simulation (P10 / P50 / P90 outcomes).
- **Collaboration** — share via `/r/:slug`, threaded comments, status workflow (draft → in review → approved / rejected), in-app notifications.
- **Comparison mode** — pick any two saved reports and view them side by side.
- **Multi-format export** — single PDF, executive PPTX deck, and a 7-sheet XLSX workbook with live formulas.
- **Authentication** — email/password and Google sign-in. Reports are owner-only by default and shareable by slug.

## Tech stack

- **Frontend** — Vite, React 18, TypeScript, Tailwind CSS, shadcn/ui, framer-motion, recharts, react-markdown.
- **Backend** — Lovable Cloud (Supabase): Postgres with Row-Level Security, Auth, Edge Functions (Deno).
- **AI** — Lovable AI Gateway (Google Gemini 2.5 family).
- **Research** — Tavily Search API.
- **Exports** — `jspdf` + `html2canvas-pro`, `pptxgenjs`, `exceljs`.

## Architecture

```text
src/pages
  Index            Landing
  Auth             Sign in / sign up (email + Google)
  Analyze          4-step concept brief
  Results          Report + export dropdown
  Dashboard        My saved reports
  SharedReport     Public-by-slug view (/r/:slug)
  Compare         Side-by-side comparison

supabase/functions
  analyze-concept  Tavily + scraping + Gemini → FeasibilityReport
  autofill-brief   Bulk AI fill of empty brief fields
  complete-field   Single-field AI suggestion

Database (public schema)
  reports                   — concept inputs + FMART output, slug, status, public flag
  report_comments           — threaded comments (RLS: visible when report visible)
  report_status_history     — append-only status changes
  notifications             — owner alerts (DB triggers on comments + status)
  profiles                  — display name + avatar
  user_roles                — separate roles table (admin / user) used by `has_role`
```

## Local development

Requires Node.js 18+.

```bash
npm install
npm run dev      # start Vite at http://localhost:5173
npm test         # run Vitest unit tests
npm run build    # production build
```

The `.env` file is generated and managed by Lovable Cloud — do not edit it manually. It exposes:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Server-side secrets live in Lovable Cloud and are injected into Edge Functions:

- `LOVABLE_API_KEY` — AI Gateway access
- `TAVILY_API_KEY` — web search

## Deployment

Open the Lovable project and click **Share → Publish**. To attach a custom domain go to **Project → Settings → Domains → Connect Domain**.

## GitHub sync

Lovable has a bidirectional GitHub integration. Once the repository is connected via **Connectors → GitHub**, every change made inside Lovable is auto-committed and pushed, and any commit pushed to GitHub is auto-pulled back into Lovable.

## Editing this code

- Open the project in Lovable and prompt your changes, or
- Clone the GitHub repository and use your own IDE (changes pushed to `main` will sync back into Lovable), or
- Edit files directly on GitHub or via Codespaces.

## License

Proprietary. All rights reserved.
