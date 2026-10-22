import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { ToolName, ToolOutcome } from "@/lib/agent/catalog";
import type { Discovery, Person, RestClient, ToolExecutor } from "@/lib/agent/engine";

export interface LabCredentials {
  apiKey: string;
  tokens: Record<Person, string>;
}

/** The MCP revision this lab targets: stateless, no initialize handshake, no Mcp-Session-Id. */
export const MCP_PROTOCOL_VERSION = "2026-07-28";

export function secretsOf(credentials: LabCredentials): string[] {
  return [credentials.apiKey, ...Object.values(credentials.tokens)];
}

/**
 * The host's MCP client. The workspace key and the identity token travel as
 * HTTP headers to /api/mcp, which forwards them to the public API. They are
 * never part of a tool's arguments or result, so the model never sees them.
 */
export function mcpExecutor(baseUrl: string, credentials: LabCredentials, identity: Person): ToolExecutor & { close(): Promise<void> } {
  let connected: Promise<Client> | null = null;
  const connect = () => {
    connected ??= (async () => {
      const transport = new StreamableHTTPClientTransport(new URL("/api/mcp", baseUrl), {
        requestInit: { headers: { "X-API-Key": credentials.apiKey, Authorization: `Bearer ${credentials.tokens[identity]}` } },
      });
      const client = new Client(
        { name: "agent-lab-console", version: "1.0.0" },
        { versionNegotiation: { mode: { pin: MCP_PROTOCOL_VERSION } } },
      );
      await client.connect(transport);
      return client;
    })();
    return connected;
  };
  return {
    async discover(): Promise<Discovery> {
      const client = await connect();
      const [tools, resources, prompts] = await Promise.all([client.listTools(), client.listResources(), client.listPrompts()]);
      return {
        tools: tools.tools.map((tool) => ({
          name: tool.name, title: tool.title, description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations,
        })),
        resources: resources.resources.map((resource) => resource.uri),
        prompts: prompts.prompts.map((prompt) => prompt.name),
      };
    },
    async call(name: ToolName, args: Record<string, unknown>): Promise<ToolOutcome> {
      const client = await connect();
      const result = await client.callTool({ name, arguments: args });
      if (result.structuredContent && typeof result.structuredContent === "object") {
        return result.structuredContent as unknown as ToolOutcome;
      }
      const text = Array.isArray(result.content)
        ? result.content.map((block) => (block.type === "text" ? block.text : "")).join(" ")
        : "The tool returned no result.";
      return { tool: name, request: { method: "", path: "" }, httpStatus: 0, ok: false, errorCode: "INVALID_ARGUMENTS", errorMessage: text, recordIds: [] };
    },
    async close() {
      if (connected) await (await connected).close();
      connected = null;
    },
  };
}

/** REST calls the console makes itself (setup, lookups, evidence), exactly like the booking website. */
export function restClient(baseUrl: string, credentials: LabCredentials, fetchImpl: typeof fetch = fetch): RestClient {
  return async (identity, method, path, body) => {
    const headers: Record<string, string> = { "X-API-Key": credentials.apiKey, Authorization: `Bearer ${credentials.tokens[identity]}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetchImpl(new URL(path, baseUrl), {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store",
    });
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    const remaining = response.headers.get("x-ratelimit-remaining");
    const retryAfter = response.headers.get("retry-after");
    const errorCode = (parsed as { error?: { code?: string } } | null)?.error?.code;
    return {
      method, path, status: response.status, body: parsed,
      ...(errorCode ? { errorCode } : {}),
      requestId: response.headers.get("x-request-id") ?? undefined,
      ...(remaining !== null ? { remaining: Number(remaining) } : {}),
      ...(retryAfter !== null ? { retryAfter: Number(retryAfter) } : {}),
    };
  };
}
