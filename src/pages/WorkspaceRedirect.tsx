import { useQuery } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function WorkspaceRedirect({ target = "dashboard" }: { target?: string }) {
  const location = useLocation();

  const { data: slug, isLoading } = useQuery({
    queryKey: ["default-workspace-slug"],
    queryFn: async () => {
      const client = supabase as any;
      const { data, error } = await client
        .from("tenant_members")
        .select("created_at, tenants(id,name,slug,status)")
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      const tenant = Array.isArray(data?.tenants) ? data.tenants[0] : data?.tenants;
      return tenant?.slug as string | undefined;
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!slug) {
    return <Navigate to="/" replace />;
  }

  const normalizedTarget = target.replace(/^\//, "");
  const search = location.search || "";
  return <Navigate to={`/t/${slug}/${normalizedTarget}${search}`} replace />;
}
