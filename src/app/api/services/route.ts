import { eq, and, asc } from "drizzle-orm";
import { api } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getDb, schema } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return api(request, async () => {
    const { workspace } = await authenticate(request);
    return getDb().select({
      id: schema.services.id,
      name: schema.services.name,
      description: schema.services.description,
      eligibility: schema.services.eligibility,
      bookingInstructions: schema.services.bookingInstructions,
    }).from(schema.services)
      .where(and(eq(schema.services.workspaceId, workspace.id), eq(schema.services.publicationStatus, "published")))
      .orderBy(asc(schema.services.name), asc(schema.services.id));
  });
}
