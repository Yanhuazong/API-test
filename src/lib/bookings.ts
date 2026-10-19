import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb, schema } from "@/db";
import { fail } from "@/lib/api";
import { lockWorkspace } from "@/lib/seed";

export async function createBooking(
  workspaceId: string,
  studentId: string,
  slotId: string,
  bookingId: string = randomUUID(),
) {
  return getDb().transaction(async (tx) => {
    if (!await lockWorkspace(tx, workspaceId)) fail(404, "WORKSPACE_NOT_FOUND", "The workspace was not found.");
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
        eq(schema.slots.workspaceId, workspaceId),
        eq(schema.slots.id, slotId),
        eq(schema.services.publicationStatus, "published"),
      )).limit(1);
    if (!slot) fail(404, "SLOT_NOT_FOUND", "The slot was not found.");
    if (slot.status !== "open" || slot.startsAt <= new Date()) {
      fail(409, "SLOT_NOT_BOOKABLE", "The slot is closed or has already started.");
    }
    const [active] = await tx.select({ id: schema.bookings.id }).from(schema.bookings).where(and(
      eq(schema.bookings.workspaceId, workspaceId),
      eq(schema.bookings.slotId, slotId),
      eq(schema.bookings.status, "active"),
    )).limit(1);
    if (active) fail(409, "SLOT_UNAVAILABLE", "The slot already has an active booking.");
    const [created] = await tx.insert(schema.bookings).values({
      id: bookingId,
      workspaceId,
      studentId,
      slotId,
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
}
