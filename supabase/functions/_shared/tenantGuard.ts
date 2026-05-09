import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export type TenantRole = "owner" | "admin" | "member" | "viewer";

export async function requireTenantAccess(req: Request, allowedRoles: TenantRole[]) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const adminKey = Deno.env.get("SUPABASE_" + "SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !adminKey) {
    throw new Response(JSON.stringify({ error: "Supabase environment is not configured" }), { status: 500 });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const adminClient = createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    throw new Response(JSON.stringify({ error: "Invalid session" }), { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (_) {
    throw new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400 });
  }

  const tenantId = body?.tenantId;
  if (!tenantId || typeof tenantId !== "string") {
    throw new Response(JSON.stringify({ error: "tenantId is required" }), { status: 400 });
  }

  const { data: member, error: memberError } = await adminClient
    .from("tenant_members")
    .select("role,status")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (memberError || !member) {
    throw new Response(JSON.stringify({ error: "Tenant access denied" }), { status: 403 });
  }

  const role = member.role as TenantRole;
  if (!allowedRoles.includes(role)) {
    throw new Response(JSON.stringify({ error: "Role not permitted" }), { status: 403 });
  }

  return {
    body,
    tenantId,
    user: { id: user.id, email: user.email },
    role,
    userClient,
    adminClient,
  };
}
