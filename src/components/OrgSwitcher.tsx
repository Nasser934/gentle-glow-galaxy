import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOptionalTenant } from "@/contexts/TenantContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function OrgSwitcher() {
  const navigate = useNavigate();
  const tenantCtx = useOptionalTenant();

  const { data: rows = [] } = useQuery({
    queryKey: ["my-tenants"],
    queryFn: async () => {
      const client = supabase as any;
      const { data, error } = await client
        .from("tenant_members")
        .select("role, tenants(id,name,slug,status)")
        .eq("status", "active")
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });

  const tenants = useMemo(
    () =>
      rows
        .map((row: any) => ({
          role: row.role,
          tenant: Array.isArray(row.tenants) ? row.tenants[0] : row.tenants,
        }))
        .filter((row: any) => row.tenant?.id && row.tenant?.status === "active"),
    [rows],
  );

  const activeSlug = tenantCtx?.tenant.slug ?? tenants[0]?.tenant.slug;

  if (!activeSlug) {
    return (
      <div className="flex h-9 items-center gap-2 rounded-md border border-border/70 px-3 text-sm text-muted-foreground">
        <Building2 className="h-4 w-4" />
        No workspace
      </div>
    );
  }

  return (
    <Select
      value={activeSlug}
      onValueChange={(slug) => navigate(`/t/${slug}/dashboard`)}
    >
      <SelectTrigger className="h-9 w-[220px]">
        <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
        <SelectValue placeholder="Select workspace" />
      </SelectTrigger>
      <SelectContent>
        {tenants.map(({ tenant, role }: any) => (
          <SelectItem key={tenant.id} value={tenant.slug}>
            {tenant.name} · {role}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
