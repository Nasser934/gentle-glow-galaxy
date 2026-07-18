-- Durable client-save idempotency. Existing rows remain valid because the
-- operation key is nullable; new client retries reuse one opaque key.
alter table public.reports
  add column if not exists save_operation_key text;

alter table public.reports
  drop constraint if exists reports_save_operation_key_format_check;

alter table public.reports
  add constraint reports_save_operation_key_format_check
  check (
    save_operation_key is null
    or (
      octet_length(save_operation_key) between 16 and 128
      and save_operation_key ~ '^[A-Za-z0-9_-]+$'
    )
  );

create unique index if not exists reports_user_save_operation_key_uidx
  on public.reports (user_id, save_operation_key)
  where save_operation_key is not null;

comment on column public.reports.save_operation_key is
  'Opaque client operation key used to make report-save retries idempotent.';
