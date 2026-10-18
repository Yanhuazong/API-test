import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb, getPool, schema } from "../src/db";
import { lockWorkspace, seedWorkspace } from "../src/lib/seed";
import { resolveWorkspace, workspaceArgument } from "./workspace";

async function main() {
  try {
    const workspace = await resolveWorkspace(workspaceArgument());
    const result = await getDb().transaction(async (tx) => {
      if (!await lockWorkspace(tx, workspace.id)) throw new Error("Workspace not found.");
      const [schedule] = await tx.select({ testDate: schema.seedSchedules.testDate })
        .from(schema.seedSchedules).where(eq(schema.seedSchedules.workspaceId, workspace.id)).limit(1);
      if (!schedule) throw new Error("Workspace seed schedule is missing.");
      return seedWorkspace(tx, workspace.id, schedule.testDate, true);
    });
    console.info(`Reset ${workspace.name}. Seed records and schedule restored: ${JSON.stringify(result)}`);
  } finally {
    await getPool().end();
  }
}

main().catch((error: unknown) => {
  console.error("Workspace reset failed.");
  if (error instanceof Error) console.error(error.message);
  process.exitCode = 1;
});
