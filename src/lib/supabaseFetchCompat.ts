type FetchLike = typeof fetch;

type PostgrestErrorBody = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function isReportsInsert(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = init?.method?.toUpperCase();
  return method === "POST" && requestUrl(input).includes("/rest/v1/reports");
}

function isMissingSaveOperationKey(error: PostgrestErrorBody): boolean {
  const text = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return error.code === "PGRST204" && /save_operation_key/i.test(text);
}

function stripSaveOperationKey(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown> | Record<string, unknown>[];
    const strip = (row: Record<string, unknown>) => {
      const { save_operation_key: _ignored, ...rest } = row;
      return rest;
    };
    return JSON.stringify(Array.isArray(parsed) ? parsed.map(strip) : strip(parsed));
  } catch {
    return null;
  }
}

/**
 * Temporary compatibility layer for Lovable Cloud databases that have not yet
 * applied the save_operation_key migration. The first request remains the
 * canonical path; only the specific missing-column response is retried.
 */
export function createSchemaCompatibleFetch(baseFetch: FetchLike = fetch): FetchLike {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await baseFetch(input, init);
    if (response.ok || !isReportsInsert(input, init) || typeof init?.body !== "string") {
      return response;
    }

    let errorBody: PostgrestErrorBody;
    try {
      errorBody = await response.clone().json() as PostgrestErrorBody;
    } catch {
      return response;
    }

    if (!isMissingSaveOperationKey(errorBody)) return response;

    const compatibleBody = stripSaveOperationKey(init.body);
    if (!compatibleBody) return response;

    console.warn(JSON.stringify({
      event: "report_save_schema_compat_retry",
      missingColumn: "save_operation_key",
    }));

    return baseFetch(input, { ...init, body: compatibleBody });
  }) as FetchLike;
}
