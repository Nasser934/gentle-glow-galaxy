create extension if not exists pgmq;
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null default 'Untitled analysis',
  inputs jsonb not null default '{}'::jsonb,
  parent_report_id uuid references public.reports(id) on delete set null,
  status text not null default 'queued',
  stage text not null default 'queued',
  research jsonb,
  draft jsonb,
  report_id uuid references public.reports(id) on delete set null,
  error text,
  attempts integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index analysis_jobs_user_idx on public.analysis_jobs (user_id, created_at desc);
create index analysis_jobs_status_idx on public.analysis_jobs (status);
create unique index analysis_jobs_report_id_key on public.analysis_jobs (report_id) where report_id is not null;

grant select on public.analysis_jobs to authenticated;
grant all on public.analysis_jobs to service_role;

alter table public.analysis_jobs enable row level security;

create policy "Users can view their own analysis jobs"
on public.analysis_jobs for select to authenticated
using (user_id = auth.uid());

create trigger update_analysis_jobs_updated_at
before update on public.analysis_jobs
for each row execute function public.update_updated_at_column();

alter table public.analysis_jobs replica identity full;
alter publication supabase_realtime add table public.analysis_jobs;

-- internal worker config (service role only; no grants to anon/authenticated)
create table public.job_worker_config (
  id boolean primary key default true check (id),
  worker_secret text not null default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);
grant all on public.job_worker_config to service_role;
alter table public.job_worker_config enable row level security;
insert into public.job_worker_config (id) values (true) on conflict do nothing;

-- durable queue
select pgmq.create('analysis_jobs');

create or replace function public.enqueue_analysis_job(p_job_id uuid, p_delay integer default 0)
returns bigint language plpgsql security definer set search_path = 'pg_catalog','public','pgmq' as $$
declare v_msg bigint;
begin
  select pgmq.send('analysis_jobs', jsonb_build_object('job_id', p_job_id), p_delay) into v_msg;
  return v_msg;
end $$;

create or replace function public.read_analysis_job_queue(p_vt integer default 300, p_qty integer default 1)
returns table(msg_id bigint, read_ct integer, job_id uuid)
language sql security definer set search_path = 'pg_catalog','public','pgmq' as $$
  select m.msg_id, m.read_ct, (m.message ->> 'job_id')::uuid
  from pgmq.read('analysis_jobs', p_vt, p_qty) m;
$$;

create or replace function public.delete_analysis_job_msg(p_msg_id bigint)
returns boolean language sql security definer set search_path = 'pg_catalog','public','pgmq' as $$
  select pgmq.delete('analysis_jobs', p_msg_id);
$$;

revoke all on function public.enqueue_analysis_job(uuid, integer) from public, anon, authenticated;
revoke all on function public.read_analysis_job_queue(integer, integer) from public, anon, authenticated;
revoke all on function public.delete_analysis_job_msg(bigint) from public, anon, authenticated;
grant execute on function public.enqueue_analysis_job(uuid, integer) to service_role;
grant execute on function public.read_analysis_job_queue(integer, integer) to service_role;
grant execute on function public.delete_analysis_job_msg(bigint) to service_role;

-- watchdog: kick the worker every minute while work is pending
create or replace function public.kick_analysis_worker()
returns void language plpgsql security definer set search_path = 'pg_catalog','public','net','pgmq' as $$
declare v_secret text; v_pending integer;
begin
  select count(*) into v_pending from public.analysis_jobs
  where status not in ('completed','failed') and started_at > now() - interval '2 hours';
  if v_pending = 0 then return; end if;

  -- fail jobs that have been stuck far too long
  update public.analysis_jobs
  set status = 'failed', stage = 'failed', error = 'Analysis timed out. Please try again.', completed_at = now()
  where status not in ('completed','failed') and started_at < now() - interval '30 minutes';

  select worker_secret into v_secret from public.job_worker_config where id;
  perform net.http_post(
    url := 'https://smjiyjenxbtfiiovxbnq.supabase.co/functions/v1/analysis-worker',
    headers := jsonb_build_object('Content-Type','application/json','x-worker-secret', v_secret),
    body := '{}'::jsonb
  );
end $$;

revoke all on function public.kick_analysis_worker() from public, anon, authenticated;

select cron.schedule('analysis-worker-kick', '* * * * *', $$select public.kick_analysis_worker();$$);
