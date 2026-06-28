ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;
CREATE INDEX IF NOT EXISTS reports_user_archived_idx ON public.reports (user_id, archived_at);