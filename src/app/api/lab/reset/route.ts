import { eq } from "drizzle-orm";
import { api, fail } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { lockWorkspace, seedWorkspace } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return api(request, async () => {
    const { workspace } = await authenticate(request, true);
    return getDb().transaction(async (tx) => {
      if (!await lockWorkspace(tx, workspace.id)) fail(404, "WORKSPACE_NOT_FOUND", "The workspace was not found.");
      const [schedule] = await tx.select({ testDate: schema.seedSchedules.testDate })
        .from(schema.seedSchedules).where(eq(schema.seedSchedules.workspaceId, workspace.id)).limit(1);
      if (!schedule) fail(500, "SEED_SCHEDULE_MISSING", "The workspace seed schedule is missing.");
      return seedWorkspace(tx, workspace.id, schedule.testDate, true);
    });
  });
}
