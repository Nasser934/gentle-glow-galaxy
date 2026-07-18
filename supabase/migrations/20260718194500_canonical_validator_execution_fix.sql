-- The canonical helper is referenced by a reports CHECK constraint. PostgreSQL
-- evaluates that constraint for authenticated inserts/updates, so the role
-- needs EXECUTE on this side-effect-free immutable function.

create or replace function public.is_canonical_report_output(p_output jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select
    jsonb_typeof(p_output) = 'object'
    and jsonb_typeof(p_output -> 'scores') = 'object'
    and case
      when jsonb_typeof(p_output #> '{scores,overall}') = 'number'
        then (p_output #>> '{scores,overall}')::numeric between 0 and 10
      else false
    end
    and jsonb_typeof(p_output -> 'scoringAudit') = 'object'
    and jsonb_typeof(p_output -> 'qualityMetadata') = 'object'
    and jsonb_typeof(p_output -> 'sources') = 'array'
    and jsonb_typeof(p_output -> 'claims') = 'array'
    and jsonb_typeof(p_output -> 'validationWarnings') = 'array'
    and jsonb_typeof(p_output -> 'normalizedFigures') = 'object'
    and jsonb_typeof(p_output -> 'decision') = 'object'
    and jsonb_typeof(p_output -> 'reportSchemaVersion') = 'string'
    and coalesce(p_output ->> 'reportSchemaVersion', '') ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
    and p_output #>> '{qualityMetadata,reportSchemaVersion}' = p_output ->> 'reportSchemaVersion'
    and coalesce(p_output #>> '{qualityMetadata,inputHash}', '') ~ '^sha256:[0-9a-f]{64}$'
    and nullif(btrim(coalesce(p_output #>> '{qualityMetadata,modelId}', '')), '') is not null
    and nullif(btrim(coalesce(p_output #>> '{qualityMetadata,promptVersion}', '')), '') is not null
    and nullif(btrim(coalesce(p_output #>> '{qualityMetadata,scoringEngineVersion}', '')), '') is not null;
$$;

revoke execute on function public.is_canonical_report_output(jsonb) from public, anon;
grant execute on function public.is_canonical_report_output(jsonb) to authenticated;
