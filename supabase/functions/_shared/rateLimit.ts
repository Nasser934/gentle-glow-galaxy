async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clientAddress(req: Request) {
  const raw = req.headers.get("cf-connecting-ip")
    || req.headers.get("x-real-ip")
    || req.headers.get("x-forwarded-for")?.split(",")[0]
    || "unknown";
  const value = raw.trim().slice(0, 128);
  return value || "unknown";
}

/**
 * Creates a one-way, environment-specific network identifier. The service
 * role key is available to Supabase Edge Functions and is used only as a
 * secret salt when a dedicated RATE_LIMIT_HASH_SALT is not configured.
 */
export async function pseudonymousIpHash(req: Request) {
  const salt = Deno.env.get("RATE_LIMIT_HASH_SALT")
    || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!salt || salt.length < 16) {
    throw new Error("A secure rate-limit hash salt is not configured");
  }
  return `sha256:${await sha256(`${salt}:${clientAddress(req)}`)}`;
}
