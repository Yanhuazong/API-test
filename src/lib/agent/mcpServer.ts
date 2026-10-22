import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { BOOKING_POLICY_TEXT, TOOLS } from "@/lib/agent/catalog";
import { executeTool, type ForwardedCredentials } from "@/lib/agent/execute";

export const POLICY_RESOURCE_URI = "advising://policy/booking";
export const BOOKING_PROMPT_NAME = "book_advising_appointment";

/**
 * One server instance per HTTP request (the 2026-07-28 revision is stateless).
 * The caller's X-API-Key and Authorization headers are forwarded to the public
 * API as-is; they are never placed in a tool result.
 */
export function createAdvisingServer(baseUrl: string, credentials: ForwardedCredentials, fetchImpl?: typeof fetch): McpServer {
  const server = new McpServer(
    { name: "campus-advising", version: "1.0.0" },
    {
      instructions:
        "Tools for a fictional campus advising API. Every call is sent to the public HTTP API with the caller's " +
        "workspace key and identity token, so the API enforces who may do what. Slot times are UTC.",
    },
  );

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.inputSchema, annotations: { title: tool.title, ...tool.annotations } },
      async (args: Record<string, unknown>) => {
        const outcome = await executeTool(baseUrl, credentials, tool.name, args ?? {}, fetchImpl);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(outcome) }],
          structuredContent: outcome as unknown as Record<string, unknown>,
          isError: !outcome.ok,
        };
      },
    );
  }

  server.registerResource(
    "booking_policy",
    POLICY_RESOURCE_URI,
    { title: "Booking and cancellation policy", description: "Short plain-text policy for booking and cancelling.", mimeType: "text/plain" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/plain", text: BOOKING_POLICY_TEXT }] }),
  );

  server.registerPrompt(
    BOOKING_PROMPT_NAME,
    {
      title: "Book an advising appointment",
      description: "Start a conversation that books an advising appointment.",
      argsSchema: z.object({
        service: z.string().optional().describe("Service name, for example Course Planning Chat."),
        when: z.string().optional().describe("Preferred day and time, in the student's words."),
      }),
    },
    ({ service, when }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Book an advising appointment${service ? ` for ${service}` : ""}${when ? ` ${when}` : ""}. ` +
            "Show me the matching times in Eastern time with UTC in parentheses, and ask me before booking.",
        },
      }],
    }),
  );

  return server;
}
