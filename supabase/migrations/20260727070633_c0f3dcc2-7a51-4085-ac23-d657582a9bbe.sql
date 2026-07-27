ALTER TABLE public.analysis_jobs
  ADD COLUMN IF NOT EXISTS research_state jsonb,
  ADD COLUMN IF NOT EXISTS research_quality jsonb,
  ADD COLUMN IF NOT EXISTS research_completed_at timestamptz;