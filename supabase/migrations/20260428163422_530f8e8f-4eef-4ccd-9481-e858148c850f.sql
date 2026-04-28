
-- Profiles
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "Profiles viewable by everyone"
  on public.profiles for select using (true);
create policy "Users insert own profile"
  on public.profiles for insert with check (auth.uid() = user_id);
create policy "Users update own profile"
  on public.profiles for update using (auth.uid() = user_id);

-- Roles
create type public.app_role as enum ('admin', 'user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "Roles viewable by self or admin"
  on public.user_roles for select
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
create policy "Admins manage roles"
  on public.user_roles for all
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Timestamp trigger function
create or replace function public.update_updated_at_column()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_profiles_updated
  before update on public.profiles
  for each row execute function public.update_updated_at_column();

-- New user trigger -> profile + default role
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  ) on conflict (user_id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'user')
    on conflict (user_id, role) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Reports
create type public.report_status as enum ('draft', 'in_review', 'approved', 'rejected');

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique default encode(gen_random_bytes(9), 'base64'),
  user_id uuid not null,
  title text not null,
  industry text,
  inputs jsonb not null,
  output jsonb not null,
  status report_status not null default 'draft',
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_reports_user on public.reports(user_id);
create index idx_reports_slug on public.reports(slug);
alter table public.reports enable row level security;

create policy "Public reports viewable by slug"
  on public.reports for select using (is_public = true or auth.uid() = user_id);
create policy "Users create own reports"
  on public.reports for insert with check (auth.uid() = user_id);
create policy "Owners update own reports"
  on public.reports for update using (auth.uid() = user_id);
create policy "Owners delete own reports"
  on public.reports for delete using (auth.uid() = user_id);

create trigger trg_reports_updated
  before update on public.reports
  for each row execute function public.update_updated_at_column();

-- Comments
create table public.report_comments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  user_id uuid not null,
  section text,
  body text not null,
  created_at timestamptz not null default now()
);
create index idx_comments_report on public.report_comments(report_id);
alter table public.report_comments enable row level security;

create policy "Comments viewable when report viewable"
  on public.report_comments for select
  using (exists (select 1 from public.reports r where r.id = report_id and (r.is_public = true or r.user_id = auth.uid())));
create policy "Signed-in users add comments to viewable reports"
  on public.report_comments for insert
  with check (auth.uid() = user_id and exists (select 1 from public.reports r where r.id = report_id and (r.is_public = true or r.user_id = auth.uid())));
create policy "Users delete own comments"
  on public.report_comments for delete using (auth.uid() = user_id);

-- Status history
create table public.report_status_history (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  changed_by uuid not null,
  from_status report_status,
  to_status report_status not null,
  note text,
  created_at timestamptz not null default now()
);
alter table public.report_status_history enable row level security;

create policy "Status history viewable when report viewable"
  on public.report_status_history for select
  using (exists (select 1 from public.reports r where r.id = report_id and (r.is_public = true or r.user_id = auth.uid())));
create policy "Owner or admin records status changes"
  on public.report_status_history for insert
  with check (
    auth.uid() = changed_by and exists (
      select 1 from public.reports r where r.id = report_id and (r.user_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
    )
  );
