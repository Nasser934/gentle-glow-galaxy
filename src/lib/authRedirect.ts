export const AUTH_RETURN_PATH_KEY = "concept-ai:auth-return-path";
export const DEFAULT_AUTH_RETURN_PATH = "/analyze";

type SessionStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const safeFallback = (fallback: unknown): string => {
  if (typeof fallback !== "string" || !fallback.startsWith("/") || fallback.startsWith("//")) {
    return DEFAULT_AUTH_RETURN_PATH;
  }
  return fallback;
};

export const sanitizeAuthReturnPath = (
  value: unknown,
  fallback: unknown = DEFAULT_AUTH_RETURN_PATH,
): string => {
  const normalizedFallback = safeFallback(fallback);
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return normalizedFallback;
  }

  try {
    const base = new URL("https://concept-ai.local");
    const parsed = new URL(value, base);
    if (parsed.origin !== base.origin || parsed.pathname === "/auth") {
      return normalizedFallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return normalizedFallback;
  }
};

export const rememberAuthReturnPath = (
  storage: SessionStorageLike,
  value: unknown,
): string => {
  const path = sanitizeAuthReturnPath(value);
  storage.setItem(AUTH_RETURN_PATH_KEY, path);
  return path;
};

export const consumeAuthReturnPath = (storage: SessionStorageLike): string | null => {
  const stored = storage.getItem(AUTH_RETURN_PATH_KEY);
  if (stored === null) return null;
  storage.removeItem(AUTH_RETURN_PATH_KEY);
  return sanitizeAuthReturnPath(stored);
};

export const clearAuthReturnPath = (storage: SessionStorageLike): void => {
  storage.removeItem(AUTH_RETURN_PATH_KEY);
};
