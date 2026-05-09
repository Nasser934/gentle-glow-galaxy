import { createContext, ReactNode, useContext } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type TenantRole = "owner" | "admin" | "member" | "viewer";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "deleted";
}

interface TenantContextValue {
  tenant: Tenant;
  role: TenantRole;
  canWrite: boolean;
  canAdmin: boolean;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { tenantSlug } = useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["tenant", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const client = supabase as any;

      const { data: tenant, error: tenantError } = await client
        .from("tenants")
        .select("id,name,slug,status")
        .eq("slug", tenantSlug)
        .single();

      if (tenantError) throw tenantError;
      if (!tenant) throw new Error("Workspace not found");

      const { data: member, error: memberError } = await client
        .from("tenant_members")
        .select("role,status")
        .eq("tenant_id", tenant.id)
        .eq("status", "active")
        .single();

      if (memberError) throw memberError;
      if (!member) throw new Error("You do not have access to this workspace");

      return {
        tenant: tenant as Tenant,
        role: member.role as TenantRole,
      };
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return <Navigate to="/dashboard" replace />;
  }

  const value: TenantContextValue = {
    tenant: data.tenant,
    role: data.role,
    canWrite: ["owner", "admin", "member"].includes(data.role),
    canAdmin: ["owner", "admin"].includes(data.role),
  };

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used inside TenantProvider");
  return ctx;
}

export function useOptionalTenant() {
  return useContext(TenantContext);
}
