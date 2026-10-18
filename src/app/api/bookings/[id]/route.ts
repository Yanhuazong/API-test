import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { api, fail } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { lockWorkspace } from "@/lib/seed";
import { parseUuid, readJson, validate } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(request, async () => {
    const { workspace, user } = await authenticate(request, true);
    const id = parseUuid((await context.params).id);
    const [booking] = await getDb().select({
      id: schema.bookings.id,
      studentId: schema.bookings.studentId,
      slotId: schema.bookings.slotId,
      status: schema.bookings.status,
      createdAt: schema.bookings.createdAt,
      canceledAt: schema.bookings.canceledAt,
      privateNote: schema.bookings.privateNote,
      advisorId: schema.slots.advisorId,
      startsAt: schema.slots.startsAt,
      endsAt: schema.slots.endsAt,
      room: schema.slots.room,
      serviceName: schema.services.name,
    }).from(schema.bookings)
      .innerJoin(schema.slots, and(
        eq(schema.bookings.workspaceId, schema.slots.workspaceId),
        eq(schema.bookings.slotId, schema.slots.id),
      ))
      .innerJoin(schema.services, eq(schema.slots.serviceId, schema.services.id))
      .where(and(eq(schema.bookings.workspaceId, workspace.id), eq(schema.bookings.id, id))).limit(1);
    if (!booking) fail(404, "BOOKING_NOT_FOUND", "The booking was not found.");
    const isOwner = user.role === "student" && booking.studentId === user.id;
    const isAdvisor = user.role === "advisor" && booking.advisorId === user.id;
    if (!isOwner && !isAdvisor) fail(403, "BOOKING_FORBIDDEN", "You do not have permission to access this booking.");
    const publicBooking = {
      id: booking.id,
      studentId: booking.studentId,
      slotId: booking.slotId,
      status: booking.status,
      createdAt: booking.createdAt,
      canceledAt: booking.canceledAt,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      room: booking.room,
      serviceName: booking.serviceName,
    };
    return {
      ...publicBooking,
      createdAt: booking.createdAt.toISOString(),
      canceledAt: booking.canceledAt?.toISOString() ?? null,
      startsAt: booking.startsAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
      ...(isAdvisor ? { privateNote: booking.privateNote } : {}),
    };
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(request, async () => {
    const { workspace, user } = await authenticate(request, true);
    const id = parseUuid((await context.params).id);
    const body = validate(z.object({ status: z.literal("canceled") }).strict(), await readJson(request));
    return getDb().transaction(async (tx) => {
      if (!await lockWorkspace(tx, workspace.id)) fail(404, "WORKSPACE_NOT_FOUND", "The workspace was not found.");
      const [booking] = await tx.select({
        booking: schema.bookings,
        advisorId: schema.slots.advisorId,
      }).from(schema.bookings).innerJoin(schema.slots, and(
        eq(schema.bookings.workspaceId, schema.slots.workspaceId),
        eq(schema.bookings.slotId, schema.slots.id),
      )).where(and(
        eq(schema.bookings.workspaceId, workspace.id),
        eq(schema.bookings.id, id),
      )).limit(1);
      if (!booking) fail(404, "BOOKING_NOT_FOUND", "The booking was not found.");
      const isOwner = user.role === "student" && booking.booking.studentId === user.id;
      const isAdvisor = user.role === "advisor" && booking.advisorId === user.id;
      if (!isOwner && !isAdvisor) fail(403, "BOOKING_FORBIDDEN", "You do not have permission to cancel this booking.");
      const canceledAt = booking.booking.canceledAt ?? new Date();
      const [updated] = booking.booking.status === "canceled"
        ? [booking.booking]
        : await tx.update(schema.bookings).set({ status: body.status, canceledAt })
          .where(and(eq(schema.bookings.workspaceId, workspace.id), eq(schema.bookings.id, id)))
          .returning();
      return {
        id: updated.id,
        studentId: updated.studentId,
        slotId: updated.slotId,
        status: updated.status,
        createdAt: updated.createdAt.toISOString(),
        canceledAt: updated.canceledAt?.toISOString() ?? null,
      };
    });
  });
}
