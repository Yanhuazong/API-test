import { and, asc, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { api, fail } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { createBooking } from "@/lib/bookings";
import { pagination, readJson, validate } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return api(request, async () => {
    const { workspace, user } = await authenticate(request, true);
    const params = new URL(request.url).searchParams;
    const { limit, offset } = pagination(params, 5, 20, ["status"]);
    const status = params.get("status");
    if (status !== null && status !== "active" && status !== "canceled") {
      fail(400, "INVALID_QUERY", "status must be active or canceled.", { status: ["Expected active or canceled."] });
    }
    const conditions = [eq(schema.bookings.workspaceId, workspace.id)];
    if (user.role === "student") conditions.push(eq(schema.bookings.studentId, user.id));
    else conditions.push(eq(schema.slots.advisorId, user.id));
    if (status) conditions.push(eq(schema.bookings.status, status));
    const rows = await getDb().select({
      id: schema.bookings.id,
      studentId: schema.bookings.studentId,
      slotId: schema.bookings.slotId,
      status: schema.bookings.status,
      createdAt: schema.bookings.createdAt,
      canceledAt: schema.bookings.canceledAt,
      slot: {
        startsAt: schema.slots.startsAt,
        endsAt: schema.slots.endsAt,
        room: schema.slots.room,
        serviceName: schema.services.name,
      },
    }).from(schema.bookings)
      .innerJoin(schema.slots, and(
        eq(schema.bookings.workspaceId, schema.slots.workspaceId),
        eq(schema.bookings.slotId, schema.slots.id),
      ))
      .innerJoin(schema.services, eq(schema.slots.serviceId, schema.services.id))
      .where(and(...conditions))
      .orderBy(desc(schema.bookings.createdAt), asc(schema.bookings.id))
      .limit(limit + 1)
      .offset(offset);
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      canceledAt: row.canceledAt?.toISOString() ?? null,
      slot: { ...row.slot, startsAt: row.slot.startsAt.toISOString(), endsAt: row.slot.endsAt.toISOString() },
    }));
    return {
      data,
      pagination: { limit, offset, nextOffset: hasMore ? offset + limit : null, hasMore },
    };
  });
}

export async function POST(request: Request) {
  const bookingId = randomUUID();
  const response = await api(request, async () => {
    const { workspace, user } = await authenticate(request, true);
    if (user.role !== "student") fail(403, "STUDENT_ONLY", "Only students can create bookings.");
    const body = validate(z.object({ slotId: z.string().uuid() }).strict(), await readJson(request));
    const booking = await createBooking(workspace.id, user.id, body.slotId, bookingId);
    return booking;
  }, 201);
  if (response.status === 201) response.headers.set("Location", `/api/bookings/${bookingId}`);
  return response;
}
