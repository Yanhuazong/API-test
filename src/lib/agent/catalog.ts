import { z } from "zod";

// One definition per MCP tool. The MCP server registers these, the agent console
// builds its policy panel from the names, and tests check the published schemas.

export const TOOL_NAMES = [
  "list_services",
  "search_available_slots",
  "get_my_bookings",
  "get_booking",
  "create_booking",
  "cancel_booking",
  "close_slot",
  "reset_workspace",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export function isToolName(value: string): value is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(value);
}

const uuid = z.string().uuid();
const utcDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

export interface ToolHints {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface ToolDefinition {
  name: ToolName;
  title: string;
  description: string;
  inputSchema: z.ZodObject;
  annotations: ToolHints;
  /** The public API request this tool sends. Arguments are already validated. */
  request: (args: Record<string, unknown>) => { method: "GET" | "POST" | "PATCH"; path: string; body?: unknown };
}

const read: ToolHints = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export const TOOLS: readonly ToolDefinition[] = [
  {
    name: "list_services",
    title: "List advising services",
    description: "List the published advising services in this workspace (id, name, description, eligibility). Read-only.",
    inputSchema: z.object({}).strict(),
    annotations: read,
    request: () => ({ method: "GET", path: "/api/services" }),
  },
  {
    name: "search_available_slots",
    title: "Search available appointment times",
    description:
      "Search open, unbooked appointment slots. `date` is a UTC calendar date (YYYY-MM-DD): it matches slots whose " +
      "startsAt falls on that date in UTC, which is not always the student's local date. Every startsAt and endsAt " +
      "in the result is UTC (ISO 8601 ending in Z); convert to the student's time zone before showing a time. " +
      "Read-only.",
    inputSchema: z.object({
      date: utcDate.optional().describe("UTC calendar date, YYYY-MM-DD. Not the local date."),
      serviceId: uuid.optional().describe("Only slots for this service id (from list_services)."),
      limit: z.number().int().min(1).max(20).optional().describe("Maximum rows, 1-20. Default 10."),
    }).strict(),
    annotations: read,
    request: (args) => {
      const params = new URLSearchParams({ available: "true" });
      if (typeof args.date === "string") params.set("date", args.date);
      if (typeof args.serviceId === "string") params.set("serviceId", args.serviceId);
      params.set("limit", String(typeof args.limit === "number" ? args.limit : 10));
      return { method: "GET", path: `/api/slots?${params}` };
    },
  },
  {
    name: "get_my_bookings",
    title: "List my bookings",
    description:
      "List bookings for the signed-in identity: a student's own bookings, or an advisor's assigned bookings. " +
      "Identity comes from the server-held token; there is no student argument. Read-only.",
    inputSchema: z.object({
      status: z.enum(["active", "canceled"]).optional().describe("Only bookings with this status."),
    }).strict(),
    annotations: read,
    request: (args) => {
      const params = new URLSearchParams({ limit: "20" });
      if (typeof args.status === "string") params.set("status", args.status);
      return { method: "GET", path: `/api/bookings?${params}` };
    },
  },
  {
    name: "get_booking",
    title: "Get one booking",
    description: "Get one booking by id. The API decides whether the signed-in identity may see it. Read-only.",
    inputSchema: z.object({ bookingId: uuid.describe("Booking id.") }).strict(),
    annotations: read,
    request: (args) => ({ method: "GET", path: `/api/bookings/${args.bookingId}` }),
  },
  {
    name: "create_booking",
    title: "Book an appointment",
    description:
      "Book one slot for the signed-in student. The student is taken from the server-held token; you cannot book " +
      "for someone else. Changes data.",
    inputSchema: z.object({ slotId: uuid.describe("Slot id from search_available_slots.") }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    request: (args) => ({ method: "POST", path: "/api/bookings", body: { slotId: args.slotId } }),
  },
  {
    name: "cancel_booking",
    title: "Cancel a booking",
    description:
      "Cancel a booking by id. Idempotent: repeating the call returns the original canceledAt and changes nothing. " +
      "The API decides whether the signed-in identity may cancel it. Changes data.",
    inputSchema: z.object({ bookingId: uuid.describe("Booking id.") }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    request: (args) => ({ method: "PATCH", path: `/api/bookings/${args.bookingId}`, body: { status: "canceled" } }),
  },
  {
    name: "close_slot",
    title: "Close a slot (advisor)",
    description: "Advisor action: close an appointment slot so it cannot be booked. Only the assigned advisor may do this. Changes data.",
    inputSchema: z.object({ slotId: uuid.describe("Slot id.") }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    request: (args) => ({ method: "PATCH", path: `/api/slots/${args.slotId}`, body: { status: "closed" } }),
  },
  {
    name: "reset_workspace",
    title: "Reset the whole workspace",
    description:
      "Destructive: restore the entire workspace to its starting data, deleting every booking made by everyone in it.",
    inputSchema: z.object({}).strict(),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    request: () => ({ method: "POST", path: "/api/reset" }),
  },
];

export function toolDefinition(name: ToolName): ToolDefinition {
  const tool = TOOLS.find((item) => item.name === name);
  if (!tool) throw new Error(`Unknown tool ${name}`);
  return tool;
}

export const BOOKING_POLICY_TEXT = `Campus advising booking and cancellation policy (fictional practice workspace)

1. A student books for themselves only. The student is taken from the sign-in token, never from a request field.
2. A slot can hold one active booking. A closed slot, a slot that has started, or a slot someone else holds cannot be booked.
3. Students cancel their own bookings; the assigned advisor may cancel bookings on their slots. Nobody else may.
4. Cancelling twice is safe: the second request returns the original cancellation time and changes nothing.
5. Times are stored and filtered in UTC. Tell students the Eastern time (America/Indiana/Indianapolis) and the UTC time.
6. Confirm with the student before any booking, cancellation, or slot change.`;

/** The compact, credential-free result every tool returns to its caller. */
export interface ToolOutcome {
  tool: ToolName;
  request: { method: string; path: string };
  httpStatus: number;
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
  requestId?: string;
  rateLimitRemaining?: number;
  retryAfterSeconds?: number;
  recordIds: string[];
  data?: unknown;
}
