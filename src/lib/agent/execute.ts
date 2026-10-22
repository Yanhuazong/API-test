import { toolDefinition, type ToolName, type ToolOutcome } from "@/lib/agent/catalog";

export interface ForwardedCredentials {
  apiKey: string | null;
  authorization: string | null;
}

/** Keep only the fields a model needs; never echo request headers. */
function compactRecord(tool: ToolName, record: Record<string, unknown>): Record<string, unknown> {
  const pick = (...keys: string[]) => Object.fromEntries(keys.filter((key) => key in record).map((key) => [key, record[key]]));
  switch (tool) {
    case "list_services":
      return pick("id", "name", "description", "eligibility");
    case "search_available_slots":
      return pick("id", "serviceId", "startsAt", "endsAt", "room", "advisorName", "available");
    case "get_my_bookings": {
      const slot = record.slot as Record<string, unknown> | undefined;
      return {
        ...pick("id", "slotId", "status", "createdAt", "canceledAt"),
        ...(slot ? { serviceName: slot.serviceName, startsAt: slot.startsAt, endsAt: slot.endsAt } : {}),
      };
    }
    case "get_booking":
      return pick("id", "slotId", "status", "createdAt", "canceledAt", "serviceName", "startsAt", "endsAt", "room");
    case "close_slot":
      return pick("id", "status", "startsAt", "endsAt", "room");
    case "reset_workspace":
      return { reset: true };
    default:
      return pick("id", "slotId", "status", "createdAt", "canceledAt");
  }
}

export async function executeTool(
  baseUrl: string,
  credentials: ForwardedCredentials,
  tool: ToolName,
  args: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<ToolOutcome> {
  const { method, path, body } = toolDefinition(tool).request(args);
  const headers: Record<string, string> = {};
  if (credentials.apiKey) headers["X-API-Key"] = credentials.apiKey;
  if (credentials.authorization) headers.Authorization = credentials.authorization;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const base: ToolOutcome = { tool, request: { method, path }, httpStatus: 0, ok: false, recordIds: [] };
  let response: Response;
  try {
    response = await fetchImpl(new URL(path, baseUrl), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return { ...base, errorCode: "NETWORK_ERROR", errorMessage: "The advising API could not be reached." };
  }
  const remaining = response.headers.get("x-ratelimit-remaining");
  const retryAfter = response.headers.get("retry-after");
  const outcome: ToolOutcome = {
    ...base,
    httpStatus: response.status,
    ok: response.ok,
    requestId: response.headers.get("x-request-id") ?? undefined,
    ...(remaining !== null ? { rateLimitRemaining: Number(remaining) } : {}),
    ...(retryAfter !== null ? { retryAfterSeconds: Number(retryAfter) } : {}),
  };
  let parsed: { data?: unknown; error?: { code?: string; message?: string } } | null = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    return { ...outcome, errorCode: parsed?.error?.code ?? `HTTP_${response.status}`, errorMessage: parsed?.error?.message };
  }
  const data = parsed?.data;
  if (Array.isArray(data)) {
    const rows = data.map((row) => compactRecord(tool, row as Record<string, unknown>));
    return { ...outcome, recordIds: rows.map((row) => String(row.id)), data: rows };
  }
  if (data && typeof data === "object") {
    const row = compactRecord(tool, data as Record<string, unknown>);
    return { ...outcome, recordIds: typeof row.id === "string" ? [row.id] : [], data: row };
  }
  return outcome;
}
