-- Phase 1 / Priority 3 correction: tighten author policies and preserve admin control.
-- Authors can update/delete only while they are active workspace members.
-- Owners/admins can manage workspace reports and comments without being blocked by user_id checks.

begin;

-- Reports: allow owner/admin to update any report in the tenant.
-- Allow members to update only their own reports.
drop policy if exists reports_update_owner_admin_or_author on public.reports;
create policy reports_update_owner_admin_or_author
on public.reports
for update
to authenticated
using (
  public.current_user_has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[])
  or (
    user_id = auth.uid()
    and public.current_user_has_tenant_role(tenant_id, array['member']::public.tenant_role[])
  )
)
with check (
  public.current_user_has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[])
  or (
    user_id = auth.uid()
    and public.current_user_has_tenant_role(tenant_id, array['member']::public.tenant_role[])
  )
);

-- Reports: authors can delete only while they are active members.
drop policy if exists reports_delete_owner_admin_or_author on public.reports;
create policy reports_delete_owner_admin_or_author
on public.reports
for delete
to authenticated
using (
  public.current_user_has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[])
  or (
    user_id = auth.uid()
    and public.current_user_has_tenant_role(tenant_id, array['member']::public.tenant_role[])
  )
);

-- Comments: authors can update only while they are active tenant members.
drop policy if exists comments_update_author_or_admin on public.report_comments;
create policy comments_update_author_or_admin
on public.report_comments
for update
to authenticated
using (
  public.current_user_has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[])
  or (
    user_id = auth.uid()
    and public.current_user_is_tenant_member(tenant_id)
  )
)
with check (
  public.current_user_has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[])
  or (
    user_id = auth.uid()
    and public.current_user_is_tenant_member(tenant_id)
  )
);

-- Comments: authors can delete only while they are active tenant members.
drop policy if exists comments_delete_author_or_admin on public.report_comments;
create policy comments_delete_author_or_admin
on public.report_comments
for delete
to authenticated
using (
  public.current_user_has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[])
  or (
    user_id = auth.uid()
    and public.current_user_is_tenant_member(tenant_id)
  )
);

-- Export metadata: authors can delete only while they are active tenant members.
drop policy if exists report_exports_delete_owner_admin_or_author on public.report_exports;
create policy report_exports_delete_owner_admin_or_author
on public.report_exports
for delete
to authenticated
using (
  public.current_user_has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[])
  or (
    user_id = auth.uid()
    and public.current_user_is_tenant_member(tenant_id)
  )
);

commit;
