import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";

type Db = NodePgDatabase<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export function stableId(workspaceId: string, label: string): string {
  const bytes = createHash("sha256").update(`api-investigation-lab:${workspaceId}:${label}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function randomSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function testDateFromNow(now = new Date()): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 7));
  return date.toISOString().slice(0, 10);
}

export function idsForWorkspace(workspaceId: string) {
  const userIds = {
    studentAUserId: stableId(workspaceId, "student-a"),
    studentBUserId: stableId(workspaceId, "student-b"),
    advisorUserId: stableId(workspaceId, "advisor"),
  };
  const serviceIds = {
    publishedServiceId: stableId(workspaceId, "service-published-1"),
    secondPublishedServiceId: stableId(workspaceId, "service-published-2"),
    draftServiceId: stableId(workspaceId, "service-draft"),
  };
  const slotIds = Array.from({ length: 19 }, (_, index) => stableId(workspaceId, `slot-${index + 1}`));
  return {
    ...userIds,
    ...serviceIds,
    availableSlotId: slotIds[2],
    closedSlotId: slotIds[1],
    occupiedSlotId: slotIds[0],
    draftSlotId: slotIds[18],
    studentABookingId: stableId(workspaceId, "booking-student-a-active"),
    canceledBookingId: stableId(workspaceId, "booking-canceled-history"),
    slotIds,
  };
}

export interface SeedManifest {
  workspaceId: string;
  publishedServiceId: string;
  draftServiceId: string;
  availableSlotId: string;
  closedSlotId: string;
  occupiedSlotId: string;
  draftSlotId: string;
  studentABookingId: string;
  canceledBookingId: string;
  testDate: string;
  studentAUserId: string;
  studentBUserId: string;
}

export async function seedWorkspace(
  tx: Tx,
  workspaceId: string,
  testDate: string,
  reset = false,
  tokenHashes?: { studentA: string; studentB: string; advisor: string },
): Promise<SeedManifest> {
  const ids = idsForWorkspace(workspaceId);
  if (reset) {
    await tx.delete(schema.bookings).where(eq(schema.bookings.workspaceId, workspaceId));
    await tx.delete(schema.slots).where(eq(schema.slots.workspaceId, workspaceId));
    await tx.delete(schema.services).where(eq(schema.services.workspaceId, workspaceId));
  }
  await tx.insert(schema.seedSchedules).values({ workspaceId, testDate }).onConflictDoUpdate({
    target: schema.seedSchedules.workspaceId,
    set: { testDate, updatedAt: new Date() },
  });
  if (!reset) {
    if (!tokenHashes) throw new Error("User token hashes are required when provisioning a workspace.");
    await tx.insert(schema.users).values([
      { id: ids.studentAUserId, workspaceId, displayName: "Avery Example", email: "avery@example.com", role: "student", tokenHash: tokenHashes.studentA },
      { id: ids.studentBUserId, workspaceId, displayName: "Bailey Sample", email: "bailey@example.com", role: "student", tokenHash: tokenHashes.studentB },
      { id: ids.advisorUserId, workspaceId, displayName: "Casey Fiction", email: "casey@example.com", role: "advisor", tokenHash: tokenHashes.advisor },
    ]);
  }
  await tx.insert(schema.services).values([
    {
      id: ids.publishedServiceId, workspaceId, name: "Course Planning Chat",
      description: "A fictional appointment to discuss course choices.",
      eligibility: "Open to all students in the practice class.",
      bookingInstructions: "Choose one open future time.",
      publicationStatus: "published",
    },
    {
      id: ids.secondPublishedServiceId, workspaceId, name: "Study Skills Check-in",
      description: "A fictional conversation about study routines.",
      eligibility: "Open to all students in the practice class.",
      bookingInstructions: "Bring one question about studying.",
      publicationStatus: "published",
    },
    {
      id: ids.draftServiceId, workspaceId, name: "Unannounced Draft Service",
      description: "This draft must not appear in public responses.",
      eligibility: "Not published.",
      bookingInstructions: "Not bookable.",
      publicationStatus: "draft",
    },
  ]);

  const slotValues = [];
  for (let day = 0; day < 3; day += 1) {
    const date = new Date(`${testDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + day);
    const dayText = date.toISOString().slice(0, 10);
    for (let position = 0; position < 6; position += 1) {
      const index = day * 6 + position;
      const start = new Date(`${dayText}T${String(9 + position).padStart(2, "0")}:00:00.000Z`);
      const end = new Date(start.getTime() + 30 * 60_000);
      slotValues.push({
        id: ids.slotIds[index],
        workspaceId,
        serviceId: position % 2 === 0 ? ids.publishedServiceId : ids.secondPublishedServiceId,
        advisorId: ids.advisorUserId,
        startsAt: start,
        endsAt: end,
        room: index === 2 ? null : `Practice Room ${position + 1}`,
        status: index === 1 || index === 7 ? "closed" : "open",
        internalNote: index === 3 ? "Advisor-only sample note." : null,
      });
    }
  }
  const draftStart = new Date(`${testDate}T17:00:00.000Z`);
  slotValues.push({
    id: ids.draftSlotId, workspaceId, serviceId: ids.draftServiceId, advisorId: ids.advisorUserId,
    startsAt: draftStart, endsAt: new Date(draftStart.getTime() + 30 * 60_000),
    room: null, status: "open", internalNote: null,
  });
  await tx.insert(schema.slots).values(slotValues);
  await tx.insert(schema.bookings).values([
    {
      id: ids.studentABookingId, workspaceId, studentId: ids.studentAUserId, slotId: ids.occupiedSlotId,
      status: "active", privateNote: "Private sample note for the assigned advisor.",
    },
    {
      id: ids.canceledBookingId, workspaceId, studentId: ids.studentAUserId, slotId: ids.slotIds[3],
      status: "canceled", canceledAt: new Date(`${testDate}T08:00:00.000Z`),
      privateNote: "Historical canceled example.",
    },
  ]);

  return {
    workspaceId,
    publishedServiceId: ids.publishedServiceId,
    draftServiceId: ids.draftServiceId,
    availableSlotId: ids.availableSlotId,
    closedSlotId: ids.closedSlotId,
    occupiedSlotId: ids.occupiedSlotId,
    draftSlotId: ids.draftSlotId,
    studentABookingId: ids.studentABookingId,
    canceledBookingId: ids.canceledBookingId,
    testDate,
    studentAUserId: ids.studentAUserId,
    studentBUserId: ids.studentBUserId,
  };
}

export async function lockWorkspace(tx: Tx, workspaceId: string): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(
    // A workspace-row lock serializes booking, slot updates, and reset for this class.
    sql`SELECT id FROM workspaces WHERE id = ${workspaceId} FOR UPDATE`,
  );
  return rows.rows.length > 0;
}
