ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS source_schema_version text,
  ADD COLUMN IF NOT EXISTS canonical_schema_version text,
  ADD COLUMN IF NOT EXISTS original_payload jsonb,
  ADD COLUMN IF NOT EXISTS normalization_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS normalization_timestamp timestamptz;

UPDATE public.reports
SET canonical_schema_version = COALESCE(canonical_schema_version, 'canonical_report.v2'),
    source_schema_version = COALESCE(
      source_schema_version,
      CASE WHEN source_mode = 'external_agent' THEN 'external_agent.v1' ELSE 'in_app.v1' END
    );

CREATE INDEX IF NOT EXISTS reports_source_mode_idx ON public.reports (source_mode);