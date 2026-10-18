import { and, eq } from "drizzle-orm";
import { api, fail } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { parseUuid } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(request, async () => {
    const { workspace } = await authenticate(request);
    const id = parseUuid((await context.params).id);
    const [service] = await getDb().select({
      id: schema.services.id,
      name: schema.services.name,
      description: schema.services.description,
      eligibility: schema.services.eligibility,
      bookingInstructions: schema.services.bookingInstructions,
    }).from(schema.services).where(and(
      eq(schema.services.workspaceId, workspace.id),
      eq(schema.services.id, id),
      eq(schema.services.publicationStatus, "published"),
    )).limit(1);
    if (!service) fail(404, "SERVICE_NOT_FOUND", "The service was not found.");
    return service;
  });
}
