import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { api } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { fail } from "@/lib/api";
import { pagination, parseUuid, validUtcDate } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return api(request, async () => {
    const { workspace } = await authenticate(request);
    const params = new URL(request.url).searchParams;
    const { limit, offset } = pagination(params, 5, 20, ["date", "serviceId", "available"]);
    const date = params.get("date");
    const serviceId = params.get("serviceId");
    const available = params.get("available");
    if (date !== null && !validUtcDate(date)) fail(400, "INVALID_QUERY", "date must be a real UTC calendar date (YYYY-MM-DD).", { date: ["Invalid UTC calendar date."] });
    if (serviceId !== null) parseUuid(serviceId, "serviceId");
    if (available !== null && available !== "true" && available !== "false") {
      fail(400, "INVALID_QUERY", "available must be true or false.", { available: ["Expected true or false."] });
    }
    const conditions = [
      eq(schema.slots.workspaceId, workspace.id),
      eq(schema.services.publicationStatus, "published"),
    ];
    if (serviceId) conditions.push(eq(schema.slots.serviceId, serviceId));
    if (date) {
      const start = new Date(`${date}T00:00:00.000Z`);
      const end = new Date(start.getTime() + 86_400_000);
      conditions.push(gte(schema.slots.startsAt, start), lt(schema.slots.startsAt, end));
    }
    const isAvailable = sql<boolean>`(${schema.slots.status} = 'open' AND NOT EXISTS (
      SELECT 1 FROM bookings b WHERE b.workspace_id = ${schema.slots.workspaceId}
      AND b.slot_id = ${schema.slots.id} AND b.status = 'active'
    ))`;
    if (available === "true") conditions.push(isAvailable);
    if (available === "false") conditions.push(sql`NOT ${isAvailable}`);

    const rows = await getDb().select({
      id: schema.slots.id,
      serviceId: schema.slots.serviceId,
      advisorName: schema.users.displayName,
      startsAt: schema.slots.startsAt,
      endsAt: schema.slots.endsAt,
      room: schema.slots.room,
      status: schema.slots.status,
      available: isAvailable,
    }).from(schema.slots)
      .innerJoin(schema.services, eq(schema.slots.serviceId, schema.services.id))
      .innerJoin(schema.users, eq(schema.slots.advisorId, schema.users.id))
      .where(and(...conditions))
      .orderBy(asc(schema.slots.startsAt), asc(schema.slots.id))
      .limit(limit + 1)
      .offset(offset);
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map((row) => ({ ...row, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() }));
    return {
      data,
      pagination: {
        limit, offset, nextOffset: hasMore ? offset + limit : null, hasMore,
      },
    };
  });
}
