import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function fail(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string[]>,
): never {
  throw new ApiError(status, code, message, fields);
}

export async function api<T>(
  request: Request,
  handler: (requestId: string) => Promise<T>,
  status = 200,
  headers?: HeadersInit,
): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const data = await handler(requestId);
    const body = isPaginated(data) ? data : { data };
    return NextResponse.json(
      body,
      { status, headers: { ...Object.fromEntries(new Headers(headers)), "Cache-Control": "no-store", "X-Request-Id": requestId } },
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
            ...(error.fields ? { fields: error.fields } : {}),
          },
          requestId,
        },
        { status: error.status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } },
      );
    }
    console.error(JSON.stringify({ event: "api_error", requestId, errorType: error instanceof Error ? error.name : "unknown" }));
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "An unexpected server error occurred." }, requestId },
      { status: 500, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } },
    );
  }
}

function isPaginated(value: unknown): value is { data: unknown[]; pagination: object } {
  return typeof value === "object" && value !== null &&
    "data" in value && Array.isArray(value.data) &&
    "pagination" in value && typeof value.pagination === "object";
}

export function errorResponse(requestId: string, status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    { error: { code, message }, requestId },
    { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } },
  );
}
