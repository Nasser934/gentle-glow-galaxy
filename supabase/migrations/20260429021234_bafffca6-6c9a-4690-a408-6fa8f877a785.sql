
-- Phase 11: In-app notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  report_id uuid references public.reports(id) on delete cascade,
  actor_id uuid,
  kind text not null,        -- 'comment' | 'status' | 'shared'
  title text not null,
  body text,
  url text,
  read_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create index idx_notifications_user_unread on public.notifications (user_id, read_at, created_at desc);

alter table public.notifications enable row level security;

create policy "Users see own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "Users mark own notifications"
  on public.notifications for update
  using (auth.uid() = user_id);

create policy "Users delete own notifications"
  on public.notifications for delete
  using (auth.uid() = user_id);

-- Anyone can insert a notification (RLS-protected by trigger logic in code)
create policy "Authenticated users send notifications"
  on public.notifications for insert
  to authenticated
  with check (auth.uid() = actor_id or actor_id is null);

-- Trigger: when comment added, notify report owner (if not self)
create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r_owner uuid;
  r_title text;
  r_slug text;
begin
  select user_id, title, slug into r_owner, r_title, r_slug from public.reports where id = new.report_id;
  if r_owner is not null and r_owner <> new.user_id then
    insert into public.notifications (user_id, report_id, actor_id, kind, title, body, url)
    values (r_owner, new.report_id, new.user_id, 'comment', 'New comment on ' || coalesce(r_title,'your report'),
            substring(new.body from 1 for 240), '/r/' || r_slug);
  end if;
  return new;
end;
$$;

create trigger trg_notify_on_comment
after insert on public.report_comments
for each row execute function public.notify_on_comment();

-- Trigger: when status changes, notify report owner if changed by someone else
create or replace function public.notify_on_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r_owner uuid;
  r_title text;
  r_slug text;
begin
  select user_id, title, slug into r_owner, r_title, r_slug from public.reports where id = new.report_id;
  if r_owner is not null and r_owner <> new.changed_by then
    insert into public.notifications (user_id, report_id, actor_id, kind, title, body, url)
    values (r_owner, new.report_id, new.changed_by, 'status',
            'Status changed to ' || new.to_status || ' on ' || coalesce(r_title,'your report'),
            new.note, '/r/' || r_slug);
  end if;
  return new;
end;
$$;

create trigger trg_notify_on_status
after insert on public.report_status_history
for each row execute function public.notify_on_status();
