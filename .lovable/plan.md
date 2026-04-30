## Goal
Do a system review pass, fix the one outstanding lint warning, rewrite the README to reflect the actual product (Concept AI), and push everything to GitHub.

## 1. System health check (read-only verification)
- Hit each edge function with a minimal payload via `supabase--curl_edge_functions` to confirm they respond:
  - `analyze-concept` — main feasibility pipeline (Tavily + Gemini)
  - `autofill-brief` — multi-field AI fill
  - `complete-field` — single-field AI completion
- Tail recent logs (`supabase--edge_function_logs`) for any errors in the last runs.
- Run `supabase--read_query` spot-checks against `reports`, `notifications`, `report_comments`, `report_status_history` to confirm RLS-protected tables are reachable and well-formed.
- Confirm required secrets are present: `LOVABLE_API_KEY`, `TAVILY_API_KEY` (already set).

If any check fails, fix it before continuing. Expected fixes (if needed) are scoped to the affected edge function only.

## 2. Security lint fix
The Supabase linter flags one warning:

> Signed-In Users Can Execute SECURITY DEFINER Function

The three SECURITY DEFINER functions in the project are `notify_on_comment`, `notify_on_status`, and `handle_new_user`. These are all trigger-only helpers — no user code should call them via RPC. Apply a migration:

```sql
revoke execute on function public.notify_on_comment()  from anon, authenticated, public;
revoke execute on function public.notify_on_status()   from anon, authenticated, public;
revoke execute on function public.handle_new_user()    from anon, authenticated, public;
```

`has_role` is intentionally callable (used by RLS policies) and stays as-is.

## 3. README rewrite
Replace the boilerplate `README.md` with a product-accurate version covering:

- **What it is** — Concept AI: AI-powered feasibility analysis (FMART scoring) for PMO, IT, Telecom, Infrastructure, Government, Real Estate.
- **Key features** — 4-step concept input, Tavily-grounded research, FMART scoring with confidence + methodology, financial sensitivity (Monte Carlo + tornado), industry templates, sharing via `/r/:slug`, comments + status workflow, notifications, multi-format export (PDF / PPTX / XLSX), comparison mode, light/dark theme.
- **Tech stack** — Vite, React 18, TypeScript, Tailwind, shadcn/ui, framer-motion, recharts, Lovable Cloud (Supabase: Auth, Postgres + RLS, Edge Functions), Lovable AI Gateway (Gemini), Tavily search.
- **Architecture** — short diagram of routes, edge functions, and DB tables.
- **Local development** — `npm i` / `npm run dev` / `npm test`.
- **Environment** — note that `.env` is auto-managed by Lovable Cloud; secrets (`LOVABLE_API_KEY`, `TAVILY_API_KEY`) live in Cloud.
- **Deployment** — via Lovable Publish; custom domain instructions.
- **Project links** — Lovable project, preview URL, published URL.

No emojis. Concise, professional tone.

## 4. GitHub sync
GitHub sync in Lovable is automatic and bidirectional once the project is connected. After the README and migration land, every change is auto-committed and pushed to the connected repo — no manual `git push` is needed or possible from the agent.

If GitHub is not yet connected, I will surface a clear note in the final reply telling you to open **Connectors → GitHub → Connect project** so the auto-push can take effect. (I cannot perform the OAuth connection on your behalf.)

## Deliverables
- One DB migration revoking EXECUTE on the 3 trigger-only SECURITY DEFINER functions.
- Rewritten `README.md`.
- Verification notes for edge functions and DB.
- Confirmation that the changes have been auto-synced to GitHub (or a clear instruction to connect GitHub if it isn't yet).

## Out of scope
- No new features or UI changes.
- No edits to auto-generated files (`src/integrations/supabase/client.ts`, `types.ts`, `.env`, `supabase/config.toml` project-level keys).
