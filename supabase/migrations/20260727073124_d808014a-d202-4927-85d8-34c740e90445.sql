ALTER TABLE public.analysis_jobs
  ADD COLUMN IF NOT EXISTS parent_report_id uuid REFERENCES public.reports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS root_report_id uuid REFERENCES public.reports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS previous_inputs jsonb,
  ADD COLUMN IF NOT EXISTS previous_output jsonb;

UPDATE public.analysis_jobs SET research_state = '{}'::jsonb WHERE research_state IS NULL;
UPDATE public.analysis_jobs SET research_quality = '{}'::jsonb WHERE research_quality IS NULL;

ALTER TABLE public.analysis_jobs
  ALTER COLUMN research_state SET DEFAULT '{}'::jsonb,
  ALTER COLUMN research_quality SET DEFAULT '{}'::jsonb;

ALTER TABLE public.analysis_jobs
  ALTER COLUMN research_state SET NOT NULL,
  ALTER COLUMN research_quality SET NOT NULL;

CREATE INDEX IF NOT EXISTS analysis_jobs_parent_report_id_idx ON public.analysis_jobs(parent_report_id);