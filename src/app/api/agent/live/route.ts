import { createHash, timingSafeEqual } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { TOOL_NAMES } from "@/lib/agent/catalog";
import { NAIVE_ADDENDUM, SYSTEM_PROMPT } from "@/lib/agent/live";
import { liveModeStatus } from "@/lib/agent/liveStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function passcodeMatches(given: string | null): boolean {
  const expected = process.env.INSTRUCTOR_PASSCODE;
  if (!expected || !given) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

const bodySchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.unknown() })).min(1).max(80),
  tools: z.array(z.object({
    name: z.enum(TOOL_NAMES),
    description: z.string().max(2000),
    input_schema: z.record(z.string(), z.unknown()),
  })).max(TOOL_NAMES.length),
  naive: z.boolean(),
}).strict();

function error(status: number, code: string, message: string, headers?: HeadersInit): Response {
  return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export async function POST(request: Request): Promise<Response> {
  const status = liveModeStatus();
  if (!status.enabled) return error(503, "LIVE_MODE_DISABLED", "Live mode needs LLM_API_KEY and INSTRUCTOR_PASSCODE on the server.");
  if (!passcodeMatches(request.headers.get("x-instructor-passcode"))) return error(401, "PASSCODE_REQUIRED", "The instructor passcode is missing or wrong.");
  let parsed: z.infer<typeof bodySchema>;
  try {
    const result = bodySchema.safeParse(await request.json());
    if (!result.success) return error(400, "VALIDATION_ERROR", "The live request does not match the expected shape.");
    parsed = result.data;
  } catch {
    return error(400, "MALFORMED_JSON", "The request body is not valid JSON.");
  }

  const client = new Anthropic({ apiKey: process.env.LLM_API_KEY });
  try {
    const response = await client.messages.create({
      model: status.model,
      max_tokens: 16000,
      system: parsed.naive ? SYSTEM_PROMPT + NAIVE_ADDENDUM : SYSTEM_PROMPT,
      tools: parsed.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: { ...tool.input_schema, type: "object" } as Anthropic.Tool.InputSchema,
      })),
      tool_choice: { type: "auto", disable_parallel_tool_use: true },
      messages: parsed.messages as Anthropic.MessageParam[],
    });
    return Response.json({ content: response.content, stop_reason: response.stop_reason }, { headers: { "Cache-Control": "no-store" } });
  } catch (problem) {
    if (problem instanceof Anthropic.RateLimitError) {
      const retryAfter = problem.headers?.get?.("retry-after") ?? "60";
      return error(429, "LLM_RATE_LIMITED", `The model provider rate-limited this request. Wait ${retryAfter} seconds.`, { "Retry-After": retryAfter });
    }
    if (problem instanceof Anthropic.AuthenticationError) return error(502, "LLM_AUTH_FAILED", "The server's LLM_API_KEY was rejected.");
    if (problem instanceof Anthropic.BadRequestError) return error(502, "LLM_BAD_REQUEST", `The model rejected the request: ${problem.message}`);
    if (problem instanceof Anthropic.APIError) return error(502, "LLM_ERROR", `The model provider returned HTTP ${problem.status}.`);
    return error(502, "LLM_UNREACHABLE", "The model provider could not be reached.");
  }
}
