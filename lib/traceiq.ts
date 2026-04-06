/**
 * TraceIQ backend client — POST /run-test
 * Set NEXT_PUBLIC_TRACEIQ_API_URL to override (defaults to production Railway).
 */

export type Scenario = "healthy" | "slow" | "error";

export type RunTestRequest = {
  scenario: Scenario;
  request_count?: number;
};

export type RunTestMetrics = {
  avg_latency: number;
  p95_latency: number;
  p99_latency: number;
  min_latency: number;
  max_latency: number;
  error_rate: number;
  success_rate: number;
};

export type RunTestMeta = {
  request_count: number;
  duration_ms: number;
  timestamp: string;
};

export type RunTestResponse = {
  scenario: Scenario;
  metrics: RunTestMetrics;
  latencies: number[];
  issue: string;
  explanation: string;
  fixes: string[];
  meta: RunTestMeta;
};

export type ValidationDetailItem = {
  type?: string;
  loc?: (string | number)[];
  msg?: string;
  input?: unknown;
  ctx?: Record<string, unknown>;
};

export type RunTestError =
  | { kind: "invalid_scenario"; message: string }
  | {
      kind: "validation";
      message: string;
      fieldErrors: { field: string; message: string }[];
    }
  | { kind: "http"; status: number; message: string }
  | { kind: "network"; message: string }
  | { kind: "aborted"; message: string };

const DEFAULT_BASE =
  process.env.NEXT_PUBLIC_TRACEIQ_API_URL ?? "https://traceiq.up.railway.app";

const CLIENT_TIMEOUT_MS = 120_000;

function normalizeBaseUrl(base: string): string {
  return base.replace(/\/$/, "");
}

function parseJsonDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return "Request failed";
  }
}

function parseValidationErrors(detail: unknown): { field: string; message: string }[] {
  if (!Array.isArray(detail)) return [];
  const out: { field: string; message: string }[] = [];
  for (const item of detail) {
    if (!item || typeof item !== "object") continue;
    const row = item as ValidationDetailItem;
    const loc = row.loc;
    const msg = typeof row.msg === "string" ? row.msg : "Invalid value";
    if (Array.isArray(loc) && loc.length > 0) {
      const field = loc.filter((x) => typeof x === "string").join(".");
      out.push({ field: field || "body", message: msg });
    } else {
      out.push({ field: "request", message: msg });
    }
  }
  return out;
}

function isNum(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

/** Ensures JSON matches the contract so the UI does not crash on `.toFixed()` etc. */
export function assertRunTestResponse(data: unknown): RunTestResponse {
  if (!data || typeof data !== "object") {
    const err: RunTestError = {
      kind: "http",
      status: 200,
      message: "Invalid response: expected a JSON object.",
    };
    throw err;
  }
  const o = data as Record<string, unknown>;
  const metrics = o.metrics;
  const meta = o.meta;
  if (!metrics || typeof metrics !== "object" || !meta || typeof meta !== "object") {
    const err: RunTestError = {
      kind: "http",
      status: 200,
      message: "Invalid response: missing metrics or meta.",
    };
    throw err;
  }
  const m = metrics as Record<string, unknown>;
  const ms = meta as Record<string, unknown>;
  const need =
    isNum(m.avg_latency) &&
    isNum(m.p95_latency) &&
    isNum(m.p99_latency) &&
    isNum(m.min_latency) &&
    isNum(m.max_latency) &&
    isNum(m.error_rate) &&
    isNum(m.success_rate) &&
    isNum(ms.duration_ms) &&
    typeof ms.request_count === "number" &&
    typeof ms.timestamp === "string";
  if (!need) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[TraceIQ] unexpected response shape", data);
    }
    const err: RunTestError = {
      kind: "http",
      status: 200,
      message:
        "Response did not match the expected API shape. Check the browser console (dev) for details.",
    };
    throw err;
  }
  const latencies = o.latencies;
  const fixes = o.fixes;
  if (!Array.isArray(latencies) || !Array.isArray(fixes)) {
    const err: RunTestError = {
      kind: "http",
      status: 200,
      message: "Invalid response: latencies and fixes must be arrays.",
    };
    throw err;
  }
  return {
    scenario: o.scenario as Scenario,
    metrics: m as unknown as RunTestMetrics,
    latencies: latencies as number[],
    issue: typeof o.issue === "string" ? o.issue : "",
    explanation: typeof o.explanation === "string" ? o.explanation : "",
    fixes: fixes.filter((x): x is string => typeof x === "string"),
    meta: {
      request_count: ms.request_count as number,
      duration_ms: ms.duration_ms as number,
      timestamp: ms.timestamp as string,
    },
  };
}

export function isRunTestError(e: unknown): e is RunTestError {
  return (
    typeof e === "object" &&
    e !== null &&
    "kind" in e &&
    typeof (e as { kind: unknown }).kind === "string"
  );
}

export function formatRunTestError(err: RunTestError): string {
  switch (err.kind) {
    case "invalid_scenario":
      return err.message;
    case "validation":
      if (err.fieldErrors.length === 0) return err.message;
      return err.fieldErrors.map((e) => `${e.field}: ${e.message}`).join("\n");
    case "http":
      return err.message;
    case "network":
      return err.message;
    case "aborted":
      return err.message;
    default:
      return "Something went wrong";
  }
}

export async function runTest(
  body: RunTestRequest,
  options?: { baseUrl?: string; signal?: AbortSignal }
): Promise<RunTestResponse> {
  const baseUrl = normalizeBaseUrl(options?.baseUrl ?? DEFAULT_BASE);
  const url = `${baseUrl}/run-test`;

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, CLIENT_TIMEOUT_MS);

  const outer = options?.signal;
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      const timeoutMsg =
        "Request timed out after 120 seconds. The server may be busy — try a lower request count.";
      const cancelMsg = "Request was cancelled.";
      const err: RunTestError = {
        kind: "aborted",
        message: timedOut ? timeoutMsg : cancelMsg,
      };
      throw err;
    }
    const err: RunTestError = {
      kind: "network",
      message:
        "Could not reach the TraceIQ server. Check your connection or try again later.",
    };
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (res.ok) {
    const raw: unknown = await res.json();
    if (process.env.NODE_ENV === "development") {
      console.debug("[TraceIQ] run-test OK", {
        url,
        keys:
          raw && typeof raw === "object"
            ? Object.keys(raw as object)
            : typeof raw,
      });
    }
    return assertRunTestResponse(raw);
  }

  let payload: { detail?: unknown } = {};
  try {
    payload = (await res.json()) as { detail?: unknown };
  } catch {
    /* empty */
  }

  const detail = payload.detail;

  if (res.status === 400) {
    if (detail === "Invalid scenario") {
      const err: RunTestError = {
        kind: "invalid_scenario",
        message: "That scenario name is not valid.",
      };
      throw err;
    }
    const err: RunTestError = {
      kind: "http",
      status: 400,
      message: parseJsonDetail(detail),
    };
    throw err;
  }

  if (res.status === 422) {
    const fieldErrors = parseValidationErrors(detail);
    const err: RunTestError = {
      kind: "validation",
      message: "Validation failed",
      fieldErrors,
    };
    throw err;
  }

  const err: RunTestError = {
    kind: "http",
    status: res.status,
    message: parseJsonDetail(detail) || `Server returned ${res.status}`,
  };
  throw err;
}
