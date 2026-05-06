import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://gentle-glow-galaxy.lovable.app,http://localhost:8080")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  let allowed = allowedOrigins[0] ?? "*";
  try {
    const url = new URL(origin);
    if (url.hostname === "localhost" || url.hostname.endsWith(".lovable.app") || url.hostname.endsWith(".lovableproject.com") || allowedOrigins.includes(origin)) {
      allowed = origin;
    }
  } catch {
    // keep default
  }
  return {
    "Access-Control-Allow-Origin": allowed,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function clean(value: unknown, max = 240) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(req, { error: "Please sign in to research this report." }, 401);

    const auth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await auth.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !userData?.user?.id) return json(req, { error: "Your session has expired. Please sign in again." }, 401);

    const key = Deno.env.get("TAVILY_API_KEY");
    if (!key) return json(req, { answer: "", citations: [] });

    const body = await req.json().catch(() => ({}));
    const inputs = body?.inputs ?? {};
    const query = clean([
      inputs.projectName,
      inputs.industry,
      inputs.location,
      inputs.description,
      "market size competitors benchmarks feasibility",
    ].filter(Boolean).join(" "), 420);

    if (!query || query.length < 8) return json(req, { answer: "", citations: [] });

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: "advanced",
        max_results: 8,
        include_answer: true,
        include_raw_content: false,
      }),
    });

    if (!response.ok) return json(req, { answer: "", citations: [] });
    const data = await response.json();
    const citations = (Array.isArray(data.results) ? data.results : []).slice(0, 8).map((item: Record<string, unknown>) => {
      const url = clean(item.url, 500);
      let source = "Tavily";
      try { source = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep default */ }
      return {
        title: clean(item.title, 160) || source,
        url,
        source,
        takeaway: clean(item.content, 260) || "Supports market, competitor, or benchmark context.",
      };
    }).filter((item: { url: string }) => item.url);

    return json(req, { answer: clean(data.answer, 600), citations });
  } catch (error) {
    console.error("tavily-research failed", error);
    return json(req, { answer: "", citations: [] });
  }
});
