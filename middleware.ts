import { NextRequest, NextResponse } from "next/server";

function allowedMethods(path: string): string[] | undefined {
  if (path === "/api/health" || path === "/api/services" || path === "/api/slots" || path === "/api/me" || path === "/api/bookings") {
    return path === "/api/bookings" ? ["GET", "POST"] : ["GET"];
  }
  if (path === "/api/lab/reset") return ["POST"];
  if (/^\/api\/services\/[^/]+$/.test(path)) return ["GET"];
  if (/^\/api\/slots\/[^/]+$/.test(path)) return ["GET", "PATCH"];
  if (/^\/api\/bookings\/[^/]+$/.test(path)) return ["GET", "PATCH"];
  return undefined;
}

export function middleware(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const allowed = allowedMethods(request.nextUrl.pathname);
  if (allowed && !allowed.includes(request.method)) {
    return NextResponse.json(
      { error: { code: "METHOD_NOT_ALLOWED", message: "This HTTP method is not supported for this endpoint." }, requestId },
      { status: 405, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } },
    );
  }
  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export const config = { matcher: "/api/:path*" };
