import { and, eq, sql } from "drizzle-orm";
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
    const { workspace } = await authenticate(request);
    const id = parseUuid((await context.params).id);
    const isAvailable = sql<boolean>`(${schema.slots.status} = 'open' AND NOT EXISTS (
      SELECT 1 FROM bookings b WHERE b.workspace_id = ${schema.slots.workspaceId}
      AND b.slot_id = ${schema.slots.id} AND b.status = 'active'
    ))`;
    const [slot] = await getDb().select({
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
      .where(and(
        eq(schema.slots.workspaceId, workspace.id),
        eq(schema.slots.id, id),
        eq(schema.services.publicationStatus, "published"),
      )).limit(1);
    if (!slot) fail(404, "SLOT_NOT_FOUND", "The slot was not found.");
    return { ...slot, startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString() };
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(request, async () => {
    const { workspace, user } = await authenticate(request, true);
    const id = parseUuid((await context.params).id);
    const body = validate(z.object({
      status: z.enum(["open", "closed"]).optional(),
      room: z.string().max(200).nullable().optional(),
    }).strict().refine((value) => Object.keys(value).length > 0, "Provide status and/or room."), await readJson(request));
    if (user.role !== "advisor") fail(403, "ADVISOR_ONLY", "Only advisors can update slots.");
    return getDb().transaction(async (tx) => {
      if (!await lockWorkspace(tx, workspace.id)) fail(404, "WORKSPACE_NOT_FOUND", "The workspace was not found.");
      const [slot] = await tx.select({
        id: schema.slots.id,
        advisorId: schema.slots.advisorId,
        status: schema.slots.status,
      }).from(schema.slots)
        .where(and(eq(schema.slots.workspaceId, workspace.id), eq(schema.slots.id, id)))
        .limit(1);
      if (!slot) fail(404, "SLOT_NOT_FOUND", "The slot was not found.");
      if (slot.advisorId !== user.id) fail(403, "SLOT_FORBIDDEN", "You are not assigned to this slot.");
      if (body.status === "closed") {
        const [activeBooking] = await tx.select({ id: schema.bookings.id }).from(schema.bookings).where(and(
          eq(schema.bookings.workspaceId, workspace.id),
          eq(schema.bookings.slotId, id),
          eq(schema.bookings.status, "active"),
        )).limit(1);
        if (activeBooking) fail(409, "SLOT_HAS_ACTIVE_BOOKING", "Cancel the active booking before closing this slot.");
      }
      const [updated] = await tx.update(schema.slots).set(body)
        .where(and(eq(schema.slots.workspaceId, workspace.id), eq(schema.slots.id, id)))
        .returning({
          id: schema.slots.id,
          status: schema.slots.status,
          room: schema.slots.room,
          startsAt: schema.slots.startsAt,
          endsAt: schema.slots.endsAt,
        });
      return { ...updated, startsAt: updated.startsAt.toISOString(), endsAt: updated.endsAt.toISOString() };
    });
  });
}
