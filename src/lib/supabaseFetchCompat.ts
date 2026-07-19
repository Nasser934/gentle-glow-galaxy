type FetchLike = typeof fetch;

type PostgrestErrorBody = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

const OPTIONAL_REPORT_COLUMNS = new Set([
  "save_operation_key",
  "model_id",
  "prompt_version",
  "scoring_engine_version",
  "research_timestamp",
  "source_snapshot_metadata",
  "input_hash",
  "report_schema_version",
  "generation_timestamp",
]);

export const ANALYSIS_CLIENT_TIMEOUT_MS = 180_000;
export const ANALYSIS_RETRY_DELAY_MS = 100;
const ANALYSIS_PATH = "/functions/v1/analyze-concept";
const TRANSIENT_ANALYSIS_STATUSES = new Set([500, 502, 503, 504]);

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

async function requestBodyText(input: RequestInfo | URL, init?: RequestInit): Promise<string | null> {
  if (typeof init?.body === "string") return init.body;
  if (input instanceof Request) {
    try {
      return await input.clone().text();
    } catch {
      return null;
    }
  }
  return null;
}

function isReportsInsert(input: RequestInfo | URL, init?: RequestInit): boolean {
  return requestMethod(input, init) === "POST" && requestUrl(input).includes("/rest/v1/reports");
}

function isAnalysisRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  return requestMethod(input, init) === "POST" && requestUrl(input).includes(ANALYSIS_PATH);
}

function analysisRequestInit(input: RequestInfo | URL, init?: RequestInit): RequestInit | undefined {
  if (!isAnalysisRequest(input, init) || init?.signal) return init;
  return {
    ...init,
    signal: AbortSignal.timeout(ANALYSIS_CLIENT_TIMEOUT_MS),
  };
}

function isAbortLike(error: unknown) {
  return error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError");
}

const wait = (milliseconds: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, milliseconds);
});

/**
 * Analysis requests get one automatic retry for network transport failures and
 * transient 5xx Edge Function responses. Validation/auth/rate-limit responses
 * are returned immediately and are never retried.
 */
async function fetchAnalysisWithRetry(
  baseFetch: FetchLike,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!isAnalysisRequest(input, init)) return baseFetch(input, init);

  // Prepare both Request copies before the first fetch consumes the body.
  const firstInput = input instanceof Request ? input.clone() : input;
  const retryInput = input instanceof Request ? input.clone() : input;

  try {
    const firstResponse = await baseFetch(firstInput, analysisRequestInit(firstInput, init));
    if (!TRANSIENT_ANALYSIS_STATUSES.has(firstResponse.status)) return firstResponse;

    console.warn(JSON.stringify({
      event: "analysis_edge_retry",
      reason: "transient_status",
      status: firstResponse.status,
    }));
  } catch (error) {
    // A user cancellation or the full three-minute deadline must not start a
    // second long-running request. Transport failures such as TypeError do.
    if (isAbortLike(error)) throw error;
    console.warn(JSON.stringify({
      event: "analysis_edge_retry",
      reason: "network_transport_failure",
      errorName: error instanceof Error ? error.name : "unknown",
    }));
  }

  await wait(ANALYSIS_RETRY_DELAY_MS);
  return baseFetch(retryInput, analysisRequestInit(retryInput, init));
}

function missingReportColumn(error: PostgrestErrorBody): string | null {
  if (error.code !== "PGRST204") return null;
  const text = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  const quoted = text.match(/["']([A-Za-z][A-Za-z0-9_]*)["']\s+column/i)?.[1];
  const unquoted = text.match(/column\s+["']?([A-Za-z][A-Za-z0-9_]*)["']?/i)?.[1];
  const column = quoted ?? unquoted ?? null;
  return column && OPTIONAL_REPORT_COLUMNS.has(column) ? column : null;
}

function stripColumn(body: string, column: string): string | null {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown> | Record<string, unknown>[];
    const strip = (row: Record<string, unknown>) => {
      const next = { ...row };
      delete next[column];
      return next;
    };
    return JSON.stringify(Array.isArray(parsed) ? parsed.map(strip) : strip(parsed));
  } catch {
    return null;
  }
}

function retryInit(input: RequestInfo | URL, init: RequestInit | undefined, body: string): RequestInit {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }
  return {
    ...init,
    method: requestMethod(input, init),
    headers,
    body,
  };
}

async function parsePostgrestError(response: Response): Promise<PostgrestErrorBody | null> {
  try {
    return await response.clone().json() as PostgrestErrorBody;
  } catch {
    return null;
  }
}

/**
 * Compatibility layer for Lovable Cloud:
 * - allows the existing production analysis endpoint to run for three minutes;
 * - retries one transient Edge Function/network failure automatically;
 * - retries report inserts only when known optional columns are absent.
 */
export function createSchemaCompatibleFetch(baseFetch: FetchLike = fetch): FetchLike {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = await requestBodyText(input, init);
    let response = await fetchAnalysisWithRetry(baseFetch, input, init);

    if (response.ok || !isReportsInsert(input, init) || body === null) {
      return response;
    }

    let compatibleBody = body;
    const removedColumns = new Set<string>();

    for (let attempt = 0; attempt < OPTIONAL_REPORT_COLUMNS.size; attempt += 1) {
      const errorBody = await parsePostgrestError(response);
      if (!errorBody) return response;

      const column = missingReportColumn(errorBody);
      if (!column || removedColumns.has(column)) return response;

      const stripped = stripColumn(compatibleBody, column);
      if (!stripped || stripped === compatibleBody) return response;

      removedColumns.add(column);
      compatibleBody = stripped;
      console.warn(JSON.stringify({
        event: "report_save_schema_compat_retry",
        missingColumn: column,
      }));

      response = await baseFetch(
        requestUrl(input),
        retryInit(input, init, compatibleBody),
      );
      if (response.ok) return response;
    }

    return response;
  }) as FetchLike;
}
