import { z } from "zod";
import { fail } from "@/lib/api";

export async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type");
  if (!contentType || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
    fail(415, "UNSUPPORTED_MEDIA_TYPE", "Send this request with Content-Type: application/json.");
  }
  try {
    return await request.json();
  } catch {
    fail(400, "MALFORMED_JSON", "The request body is not valid JSON.");
  }
}

export function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.length ? issue.path.join(".") : "_body";
      (fields[key] ??= []).push(issue.message);
    }
    fail(400, "VALIDATION_ERROR", "The request does not match the required schema.", fields);
  }
  return result.data;
}

export function parseUuid(value: string, field = "id"): string {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) fail(400, "INVALID_QUERY", `${field} must be a UUID.`, { [field]: ["Invalid UUID."] });
  return parsed.data;
}

export function pagination(
  params: URLSearchParams,
  defaultLimit = 5,
  maximum = 20,
  additionalAllowed: string[] = [],
): { limit: number; offset: number } {
  const allowed = new Set(["limit", "offset", ...additionalAllowed]);
  for (const key of params.keys()) {
    if (!allowed.has(key)) {
      fail(400, "INVALID_QUERY", `Unknown query parameter: ${key}.`, { [key]: ["Unknown query parameter."] });
    }
  }
  const limitText = params.get("limit");
  const offsetText = params.get("offset");
  const limit = limitText === null ? defaultLimit : /^\d+$/.test(limitText) ? Number(limitText) : NaN;
  const offset = offsetText === null ? 0 : /^\d+$/.test(offsetText) ? Number(offsetText) : NaN;
  if (!Number.isSafeInteger(limit) || limit < 1) fail(400, "INVALID_QUERY", "limit must be a positive integer.", { limit: ["Expected a positive integer."] });
  if (limit > maximum) fail(400, "INVALID_QUERY", `limit must not exceed ${maximum}.`, { limit: [`Maximum is ${maximum}.`] });
  if (!Number.isSafeInteger(offset) || offset < 0) fail(400, "INVALID_QUERY", "offset must be a non-negative integer.", { offset: ["Expected a non-negative integer."] });
  return { limit, offset };
}

export function validUtcDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
