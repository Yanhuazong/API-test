import { and, asc, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { api, fail } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { lockWorkspace } from "@/lib/seed";
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
    const db = getDb();
    const booking = await db.transaction(async (tx) => {
      if (!await lockWorkspace(tx, workspace.id)) fail(404, "WORKSPACE_NOT_FOUND", "The workspace was not found.");
      const [slot] = await tx.select({
        id: schema.slots.id,
        status: schema.slots.status,
        startsAt: schema.slots.startsAt,
      }).from(schema.slots)
        .innerJoin(schema.services, and(
          eq(schema.slots.serviceId, schema.services.id),
          eq(schema.slots.workspaceId, schema.services.workspaceId),
        ))
        .where(and(
          eq(schema.slots.workspaceId, workspace.id),
          eq(schema.slots.id, body.slotId),
          eq(schema.services.publicationStatus, "published"),
        )).limit(1);
      if (!slot) fail(404, "SLOT_NOT_FOUND", "The slot was not found.");
      if (slot.status !== "open" || slot.startsAt <= new Date()) {
        fail(409, "SLOT_NOT_BOOKABLE", "The slot is closed or has already started.");
      }
      const [active] = await tx.select({ id: schema.bookings.id }).from(schema.bookings).where(and(
        eq(schema.bookings.workspaceId, workspace.id),
        eq(schema.bookings.slotId, body.slotId),
        eq(schema.bookings.status, "active"),
      )).limit(1);
      if (active) fail(409, "SLOT_UNAVAILABLE", "The slot already has an active booking.");
      const [created] = await tx.insert(schema.bookings).values({
        id: bookingId,
        workspaceId: workspace.id,
        studentId: user.id,
        slotId: body.slotId,
        status: "active",
      }).returning({
        id: schema.bookings.id,
        studentId: schema.bookings.studentId,
        slotId: schema.bookings.slotId,
        status: schema.bookings.status,
        createdAt: schema.bookings.createdAt,
      });
      return { ...created, createdAt: created.createdAt.toISOString() };
    });
    return booking;
  }, 201);
  if (response.status === 201) response.headers.set("Location", `/api/bookings/${bookingId}`);
  return response;
}
