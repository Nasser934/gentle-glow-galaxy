
-- 1. Reports: source_mode + external_agent_metadata
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS source_mode text NOT NULL DEFAULT 'in_app'
    CHECK (source_mode IN ('in_app', 'external_agent')),
  ADD COLUMN IF NOT EXISTS external_agent_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS reports_source_mode_idx ON public.reports(source_mode);

-- 2. report_exports queue
CREATE TABLE IF NOT EXISTS public.report_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  format text NOT NULL CHECK (format IN ('pdf', 'xlsx', 'pptx')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'ready', 'failed')),
  display_url text,
  error text,
  idempotency_key text,
  requested_by text NOT NULL DEFAULT 'mcp',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, report_id, format, idempotency_key)
);

CREATE INDEX IF NOT EXISTS report_exports_report_id_idx ON public.report_exports(report_id);
CREATE INDEX IF NOT EXISTS report_exports_user_id_idx ON public.report_exports(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_exports TO authenticated;
GRANT ALL ON public.report_exports TO service_role;

ALTER TABLE public.report_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their own report exports"
  ON public.report_exports FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER report_exports_set_updated_at
  BEFORE UPDATE ON public.report_exports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. MCP write idempotency ledger
CREATE TABLE IF NOT EXISTS public.mcp_write_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  idempotency_key text NOT NULL,
  report_id uuid REFERENCES public.reports(id) ON DELETE SET NULL,
  response jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tool_name, idempotency_key)
);

GRANT SELECT, INSERT ON public.mcp_write_idempotency TO authenticated;
GRANT ALL ON public.mcp_write_idempotency TO service_role;

ALTER TABLE public.mcp_write_idempotency ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own idempotency entries"
  ON public.mcp_write_idempotency FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own idempotency entries"
  ON public.mcp_write_idempotency FOR INSERT
  WITH CHECK (auth.uid() = user_id);
