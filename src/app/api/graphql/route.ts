import { NextResponse } from "next/server";
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { buildSchema, graphql, type GraphQLError } from "graphql";
import { randomUUID } from "node:crypto";
import { getDb, schema } from "@/db";
import { ApiError, rateLimitHeaders } from "@/lib/api";
import { authenticate, type LabUser, type LabWorkspace } from "@/lib/auth";
import { createBooking } from "@/lib/bookings";
import { validUtcDate } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUERY_LENGTH = 4000;
const MAX_LIMIT = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const typeDefs = /* GraphQL */ `
  type Query {
    "The signed-in person."
    me: User!
    "Published services."
    services: [Service!]!
    service(id: ID!): Service
    "Slots for published services, soonest first."
    slots(serviceId: ID, date: String, available: Boolean, limit: Int = 5, offset: Int = 0): [Slot!]!
    "A student sees their own bookings; an advisor sees bookings for their slots."
    myBookings(status: BookingStatus, limit: Int = 5, offset: Int = 0): [Booking!]!
  }

  type Mutation {
    "Students only. Books an open slot."
    bookSlot(slotId: ID!): Booking!
  }

  enum BookingStatus { active canceled }

  type User { id: ID! displayName: String! email: String! role: String! }

  type Service {
    id: ID!
    name: String!
    description: String!
    eligibility: String!
    bookingInstructions: String!
  }

  type Slot {
    id: ID!
    startsAt: String!
    endsAt: String!
    room: String
    status: String!
    available: Boolean!
    advisorName: String!
    service: Service!
  }

  type Booking {
    id: ID!
    status: BookingStatus!
    createdAt: String!
    canceledAt: String
    slot: Slot!
  }
`;

interface Context { workspace: LabWorkspace; user: LabUser }

const iso = (value: Date | null) => value?.toISOString() ?? null;

function pageArgs(limit: number, offset: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new ApiError(400, "INVALID_ARGUMENT", `limit must be between 1 and ${MAX_LIMIT}.`);
  }
  if (!Number.isInteger(offset) || offset < 0) throw new ApiError(400, "INVALID_ARGUMENT", "offset must be 0 or more.");
  return { limit, offset };
}

function uuid(value: string, name: string) {
  if (!UUID.test(value)) throw new ApiError(400, "INVALID_ARGUMENT", `${name} must be a UUID.`);
  return value;
}

const serviceColumns = {
  id: schema.services.id,
  name: schema.services.name,
  description: schema.services.description,
  eligibility: schema.services.eligibility,
  bookingInstructions: schema.services.bookingInstructions,
};

const isAvailable = sql<boolean>`(${schema.slots.status} = 'open' AND NOT EXISTS (
  SELECT 1 FROM bookings b WHERE b.workspace_id = ${schema.slots.workspaceId}
  AND b.slot_id = ${schema.slots.id} AND b.status = 'active'
))`;

const slotColumns = {
  id: schema.slots.id,
  serviceId: schema.slots.serviceId,
  advisorName: schema.users.displayName,
  startsAt: schema.slots.startsAt,
  endsAt: schema.slots.endsAt,
  room: schema.slots.room,
  status: schema.slots.status,
  available: isAvailable,
};

type SlotRow = {
  id: string; serviceId: string; advisorName: string; startsAt: Date; endsAt: Date;
  room: string | null; status: string; available: boolean;
};

function slotObject(row: SlotRow, ctx: Context) {
  return {
    ...row,
    startsAt: iso(row.startsAt),
    endsAt: iso(row.endsAt),
    service: async () => {
      const [service] = await getDb().select(serviceColumns).from(schema.services)
        .where(and(eq(schema.services.workspaceId, ctx.workspace.id), eq(schema.services.id, row.serviceId)))
        .limit(1);
      return service;
    },
  };
}

function bookingObject(
  row: { id: string; slotId: string; status: string; createdAt: Date; canceledAt: Date | null },
  ctx: Context,
) {
  return {
    id: row.id,
    status: row.status,
    createdAt: iso(row.createdAt),
    canceledAt: iso(row.canceledAt),
    slot: async () => {
      const [slot] = await getDb().select(slotColumns).from(schema.slots)
        .innerJoin(schema.users, eq(schema.slots.advisorId, schema.users.id))
        .where(and(eq(schema.slots.workspaceId, ctx.workspace.id), eq(schema.slots.id, row.slotId)))
        .limit(1);
      return slot ? slotObject(slot, ctx) : null;
    },
  };
}

const publishedServices = (workspaceId: string) =>
  and(eq(schema.services.workspaceId, workspaceId), eq(schema.services.publicationStatus, "published"));

const rootValue = {
  me: (_: unknown, ctx: Context) => ({
    id: ctx.user.id, displayName: ctx.user.displayName, email: ctx.user.email, role: ctx.user.role,
  }),

  services: (_: unknown, ctx: Context) =>
    getDb().select(serviceColumns).from(schema.services)
      .where(publishedServices(ctx.workspace.id))
      .orderBy(asc(schema.services.name), asc(schema.services.id)),

  service: async ({ id }: { id: string }, ctx: Context) => {
    const [row] = await getDb().select(serviceColumns).from(schema.services)
      .where(and(publishedServices(ctx.workspace.id), eq(schema.services.id, uuid(id, "id")))).limit(1);
    return row ?? null;
  },

  slots: async (
    args: { serviceId?: string | null; date?: string | null; available?: boolean | null; limit: number; offset: number },
    ctx: Context,
  ) => {
    const { limit, offset } = pageArgs(args.limit, args.offset);
    const conditions = [eq(schema.slots.workspaceId, ctx.workspace.id), eq(schema.services.publicationStatus, "published")];
    if (args.serviceId) conditions.push(eq(schema.slots.serviceId, uuid(args.serviceId, "serviceId")));
    if (args.date) {
      if (!validUtcDate(args.date)) throw new ApiError(400, "INVALID_ARGUMENT", "date must be a real UTC date (YYYY-MM-DD).");
      const start = new Date(`${args.date}T00:00:00.000Z`);
      conditions.push(gte(schema.slots.startsAt, start), lt(schema.slots.startsAt, new Date(start.getTime() + 86_400_000)));
    }
    if (args.available === true) conditions.push(isAvailable);
    if (args.available === false) conditions.push(sql`NOT ${isAvailable}`);
    const rows = await getDb().select(slotColumns).from(schema.slots)
      .innerJoin(schema.services, eq(schema.slots.serviceId, schema.services.id))
      .innerJoin(schema.users, eq(schema.slots.advisorId, schema.users.id))
      .where(and(...conditions))
      .orderBy(asc(schema.slots.startsAt), asc(schema.slots.id))
      .limit(limit).offset(offset);
    return rows.map((row) => slotObject(row, ctx));
  },

  myBookings: async (
    args: { status?: "active" | "canceled" | null; limit: number; offset: number },
    ctx: Context,
  ) => {
    const { limit, offset } = pageArgs(args.limit, args.offset);
    const conditions = [eq(schema.bookings.workspaceId, ctx.workspace.id)];
    conditions.push(ctx.user.role === "student"
      ? eq(schema.bookings.studentId, ctx.user.id)
      : eq(schema.slots.advisorId, ctx.user.id));
    if (args.status) conditions.push(eq(schema.bookings.status, args.status));
    const rows = await getDb().select({
      id: schema.bookings.id,
      slotId: schema.bookings.slotId,
      status: schema.bookings.status,
      createdAt: schema.bookings.createdAt,
      canceledAt: schema.bookings.canceledAt,
    }).from(schema.bookings)
      .innerJoin(schema.slots, and(
        eq(schema.bookings.workspaceId, schema.slots.workspaceId),
        eq(schema.bookings.slotId, schema.slots.id),
      ))
      .where(and(...conditions))
      .orderBy(desc(schema.bookings.createdAt), asc(schema.bookings.id))
      .limit(limit).offset(offset);
    return rows.map((row) => bookingObject(row, ctx));
  },

  bookSlot: async ({ slotId }: { slotId: string }, ctx: Context) => {
    if (ctx.user.role !== "student") throw new ApiError(403, "STUDENT_ONLY", "Only students can create bookings.");
    const booking = await createBooking(ctx.workspace.id, ctx.user.id, uuid(slotId, "slotId"));
    return bookingObject({ ...booking, createdAt: new Date(booking.createdAt), canceledAt: null }, ctx);
  },
};

const graphqlSchema = buildSchema(typeDefs);

function formatError(error: GraphQLError) {
  const original = error.originalError;
  if (original instanceof ApiError) {
    return { message: original.message, path: error.path, extensions: { code: original.code } };
  }
  if (original) {
    console.error(JSON.stringify({ event: "graphql_error", errorType: original.name }));
    return { message: "An unexpected server error occurred.", path: error.path, extensions: { code: "INTERNAL_ERROR" } };
  }
  return { message: error.message, locations: error.locations, path: error.path, extensions: { code: "GRAPHQL_VALIDATION_FAILED" } };
}

function respond(request: Request, body: unknown, status: number, requestId: string, extra?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: { ...rateLimitHeaders.get(request), ...extra, "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

function problem(request: Request, requestId: string, status: number, code: string, message: string) {
  return respond(request, { errors: [{ message, extensions: { code } }] }, status, requestId);
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const { workspace, user } = await authenticate(request, true);

    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
      return problem(request, requestId, 415, "UNSUPPORTED_MEDIA_TYPE", "Send this request with Content-Type: application/json.");
    }
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return problem(request, requestId, 400, "MALFORMED_JSON", "The request body is not valid JSON.");
    }
    const { query, variables, operationName } = (payload ?? {}) as Record<string, unknown>;
    if (typeof query !== "string" || !query.trim()) {
      return problem(request, requestId, 400, "BAD_REQUEST", 'The JSON body must contain a "query" string.');
    }
    if (query.length > MAX_QUERY_LENGTH) {
      return problem(request, requestId, 400, "QUERY_TOO_LARGE", `The query is longer than ${MAX_QUERY_LENGTH} characters.`);
    }
    if (variables != null && (typeof variables !== "object" || Array.isArray(variables))) {
      return problem(request, requestId, 400, "BAD_REQUEST", '"variables" must be a JSON object.');
    }

    const result = await graphql({
      schema: graphqlSchema,
      source: query,
      rootValue,
      contextValue: { workspace, user } satisfies Context,
      variableValues: (variables as Record<string, unknown> | null | undefined) ?? undefined,
      operationName: typeof operationName === "string" ? operationName : undefined,
    });
    const body = {
      ...(result.data !== undefined ? { data: result.data } : {}),
      ...(result.errors ? { errors: result.errors.map(formatError) } : {}),
    };
    // Errors inside fields come back with HTTP 200 and partial data; queries that fail to parse or validate return 400.
    return respond(request, body, result.data === undefined ? 400 : 200, requestId);
  } catch (error) {
    if (error instanceof ApiError) {
      return respond(
        request,
        { errors: [{ message: error.message, extensions: { code: error.code } }] },
        error.status, requestId, error.headers,
      );
    }
    console.error(JSON.stringify({ event: "graphql_error", requestId, errorType: error instanceof Error ? error.name : "unknown" }));
    return problem(request, requestId, 500, "INTERNAL_ERROR", "An unexpected server error occurred.");
  }
}
