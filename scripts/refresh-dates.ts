import "dotenv/config";
import { getDb, getPool } from "../src/db";
import { lockWorkspace, seedWorkspace, testDateFromNow } from "../src/lib/seed";
import { resolveWorkspace, workspaceArgument } from "./workspace";

async function main() {
  try {
    const workspace = await resolveWorkspace(workspaceArgument());
    const testDate = testDateFromNow();
    const result = await getDb().transaction(async (tx) => {
      if (!await lockWorkspace(tx, workspace.id)) throw new Error("Workspace not found.");
      return seedWorkspace(tx, workspace.id, testDate, true);
    });
    console.info(`Refreshed future schedule for ${workspace.name}: ${JSON.stringify(result)}`);
  } finally {
    await getPool().end();
  }
}

main().catch((error: unknown) => {
  console.error("Schedule refresh failed.");
  if (error instanceof Error) console.error(error.message);
  process.exitCode = 1;
});
