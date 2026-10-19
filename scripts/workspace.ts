import { eq, or } from "drizzle-orm";
import { getDb, schema } from "../src/db";

export async function resolveWorkspace(identifier: string) {
  const normalized = /^\d+$/.test(identifier)
    ? `workspace-${identifier.padStart(2, "0")}`
    : identifier;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
  const [workspace] = await getDb().select().from(schema.workspaces)
    .where(isUuid
      ? or(eq(schema.workspaces.id, identifier), eq(schema.workspaces.name, normalized))
      : eq(schema.workspaces.name, normalized))
    .limit(1);
  if (!workspace) throw new Error(`No workspace matches "${identifier}".`);
  return workspace;
}

export function workspaceArgument(): string {
  const index = process.argv.indexOf("--workspace");
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error("Provide --workspace <workspace name, number, or UUID>.");
  return value;
}
