import { createMcpHandler } from "@modelcontextprotocol/server";
import { createAdvisingServer } from "@/lib/agent/mcpServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function apiBaseUrl(request: Request): string {
  return process.env.AGENT_API_BASE_URL || new URL(request.url).origin;
}

// Browser callers must be same-origin or a local tool such as the MCP Inspector.
// Requests without an Origin header (server-side clients, the Inspector proxy) pass.
function originAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const { hostname, host } = new URL(origin);
    return host === new URL(request.url).host || hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

const handler = createMcpHandler(({ requestInfo }) => createAdvisingServer(
  apiBaseUrl(requestInfo ?? new Request("http://localhost")),
  {
    apiKey: requestInfo?.headers.get("x-api-key") ?? null,
    authorization: requestInfo?.headers.get("authorization") ?? null,
  },
));

async function serve(request: Request): Promise<Response> {
  if (!originAllowed(request)) {
    return Response.json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "This origin may not call the MCP endpoint." } }, { status: 403 });
  }
  return handler.fetch(request);
}

export const POST = serve;
export const GET = serve;
export const DELETE = serve;
