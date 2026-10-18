import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { getDb, getPool, schema } from "../src/db";
import { hashSecret } from "../src/lib/auth";
import { idsForWorkspace, randomSecret, seedWorkspace, stableId, testDateFromNow } from "../src/lib/seed";

interface Handout {
  workspaceId: string;
  name: string;
  labKey: string;
  tokens: { studentA: string; studentB: string; advisor: string };
  manifest: Awaited<ReturnType<typeof seedWorkspace>>;
}

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

async function loadHandout(path: string): Promise<Handout | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Handout;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function main() {
  const count = Number(option("--count", "6"));
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error("--count must be between 1 and 100.");
  const db = getDb();
  try {
    for (let index = 1; index <= count; index += 1) {
      const name = `workspace-${String(index).padStart(2, "0")}`;
      const workspaceId = stableId("api-investigation-lab-classrooms", name);
      const dir = join("lab-output", name);
      const handoutPath = join(dir, "handout.json");
      let handout = await loadHandout(handoutPath);
      const [existing] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
      if (existing && !handout) {
        throw new Error(`Workspace ${name} already exists but its ignored handout is missing. Restore the handout backup; credentials cannot be recovered from hashes.`);
      }
      if (existing && handout) {
        console.info(`${name}: already provisioned; retained existing records and credentials (${handoutPath}).`);
        continue;
      }
      if (!handout) {
        const labKey = randomSecret();
        const tokens = { studentA: randomSecret(), studentB: randomSecret(), advisor: randomSecret() };
        handout = {
          workspaceId, name, labKey, tokens,
          manifest: {
            workspaceId,
            ...(() => {
              const ids = idsForWorkspace(workspaceId);
              return {
                publishedServiceId: ids.publishedServiceId,
                draftServiceId: ids.draftServiceId,
                availableSlotId: ids.availableSlotId,
                closedSlotId: ids.closedSlotId,
                occupiedSlotId: ids.occupiedSlotId,
                draftSlotId: ids.draftSlotId,
                studentABookingId: ids.studentABookingId,
                canceledBookingId: ids.canceledBookingId,
                testDate: testDateFromNow(),
                studentAUserId: ids.studentAUserId,
                studentBUserId: ids.studentBUserId,
              };
            })(),
          },
        };
      }
      const todayUtc = new Date().toISOString().slice(0, 10);
      if (handout.manifest.testDate <= todayUtc) {
        handout.manifest.testDate = testDateFromNow();
      }
      await mkdir(dir, { recursive: true });
      await writeFile(handoutPath, `${JSON.stringify(handout, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await db.transaction(async (tx) => {
        await tx.insert(schema.workspaces).values({
          id: workspaceId,
          name,
          keyHash: hashSecret(handout!.labKey),
        });
        handout!.manifest = await seedWorkspace(tx, workspaceId, handout!.manifest.testDate, false, {
          studentA: hashSecret(handout!.tokens.studentA),
          studentB: hashSecret(handout!.tokens.studentB),
          advisor: hashSecret(handout!.tokens.advisor),
        });
      });
      await writeFile(handoutPath, `${JSON.stringify(handout, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      console.info(`${name}: provisioned. Distribute only this workspace's private handout: ${handoutPath}`);
    }
  } finally {
    await getPool().end();
  }
}

main().catch((error: unknown) => {
  console.error("Provisioning failed.");
  if (error instanceof Error) console.error(error.message);
  process.exitCode = 1;
});
