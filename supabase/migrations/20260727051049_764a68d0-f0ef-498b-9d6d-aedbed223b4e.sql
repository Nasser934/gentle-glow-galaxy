alter table public.analysis_jobs
  add column if not exists generation_step integer not null default 0,
  add column if not exists generation_parts jsonb not null default '{}'::jsonb,
  add column if not exists stage_attempts jsonb not null default '{}'::jsonb,
  add column if not exists stage_detail text,
  add column if not exists queue_pending boolean not null default false,
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz;

create index if not exists analysis_jobs_active_worker_idx
on public.analysis_jobs (status, queue_pending, lease_expires_at)
where status not in ('completed', 'failed');

create unique index if not exists reports_save_operation_key_unique
on public.reports (save_operation_key)
where save_operation_key is not null;

drop trigger if exists analysis_jobs_set_updated_at on public.analysis_jobs;
create trigger analysis_jobs_set_updated_at
before update on public.analysis_jobs
for each row execute function public.update_updated_at_column();

create or replace function public.enqueue_analysis_job(p_job_id uuid, p_delay integer default 0)
returns bigint
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'pgmq'
as $$
declare
  v_claimed_job uuid;
  v_msg_id bigint;
begin
  update public.analysis_jobs
  set queue_pending = true
  where id = p_job_id
    and status not in ('completed', 'failed')
    and queue_pending = false
    and (lease_expires_at is null or lease_expires_at < now())
  returning id into v_claimed_job;

  if v_claimed_job is null then
    return null;
  end if;

  select pgmq.send('analysis_jobs', jsonb_build_object('job_id', p_job_id), greatest(p_delay, 0))
  into v_msg_id;

  return v_msg_id;
end;
$$;

create or replace function public.claim_analysis_job(p_job_id uuid, p_lease_seconds integer default 180)
returns setof public.analysis_jobs
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
begin
  return query
  update public.analysis_jobs j
  set
    queue_pending = false,
    lease_token = gen_random_uuid(),
    lease_expires_at = now() + make_interval(secs => greatest(p_lease_seconds, 30))
  where j.id = p_job_id
    and j.status not in ('completed', 'failed')
    and (j.lease_expires_at is null or j.lease_expires_at < now())
  returning j.*;
end;
$$;

revoke all on function public.claim_analysis_job(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_analysis_job(uuid, integer) to service_role;

create or replace function public.kick_analysis_worker()
returns void
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'net', 'pgmq'
as $$
declare
  v_secret text;
  v_pending integer;
  v_job record;
begin
  update public.analysis_jobs
  set status = 'failed', stage = 'failed', stage_detail = null,
      error = 'Analysis exceeded the maximum processing window.',
      completed_at = now(), queue_pending = false, lease_token = null, lease_expires_at = null
  where status not in ('completed', 'failed')
    and started_at < now() - interval '2 hours';

  for v_job in
    update public.analysis_jobs
    set lease_token = null, lease_expires_at = null, queue_pending = false
    where status not in ('completed', 'failed')
      and lease_expires_at is not null
      and lease_expires_at < now()
    returning id
  loop
    perform public.enqueue_analysis_job(v_job.id, 0);
  end loop;

  for v_job in
    select id from public.analysis_jobs
    where status not in ('completed', 'failed')
      and queue_pending = false
      and lease_token is null
      and updated_at < now() - interval '2 minutes'
  loop
    perform public.enqueue_analysis_job(v_job.id, 0);
  end loop;

  select count(*) into v_pending
  from public.analysis_jobs
  where status not in ('completed', 'failed') and queue_pending = true;

  if v_pending = 0 then return; end if;

  select worker_secret into v_secret from public.job_worker_config where id = true;

  perform net.http_post(
    url := 'https://smjiyjenxbtfiiovxbnq.supabase.co/functions/v1/analysis-worker',
    headers := jsonb_build_object('Content-Type','application/json','x-worker-secret', v_secret),
    body := '{}'::jsonb
  );
end;
$$;