import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { fail } from "@/lib/api";

export type LabUser = typeof schema.users.$inferSelect;
export type LabWorkspace = typeof schema.workspaces.$inferSelect;

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function authenticate(
  request: Request,
  requireUser: true,
): Promise<{ workspace: LabWorkspace; user: LabUser }>;
export function authenticate(
  request: Request,
  requireUser?: false,
): Promise<{ workspace: LabWorkspace; user: LabUser | null }>;
export async function authenticate(
  request: Request,
  requireUser = false,
): Promise<{ workspace: LabWorkspace; user: LabUser | null }> {
  const key = request.headers.get("x-lab-key");
  if (!key) fail(401, "LAB_KEY_REQUIRED", "Provide the assigned X-Lab-Key.");

  const db = getDb();
  const [workspace] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.keyHash, hashSecret(key))).limit(1);
  if (!workspace) fail(401, "INVALID_LAB_KEY", "The workspace key is invalid.");

  const authorization = request.headers.get("authorization");
  if (!authorization) {
    if (requireUser) fail(401, "USER_TOKEN_REQUIRED", "This endpoint requires a user token.");
    return { workspace, user: null };
  }
  const match = /^Bearer ([A-Za-z0-9_-]{30,})$/.exec(authorization);
  if (!match) fail(401, "INVALID_USER_TOKEN", "The user token is invalid.");
  const [user] = await db.select().from(schema.users)
    .where(eq(schema.users.tokenHash, hashSecret(match[1]))).limit(1);
  if (!user || user.workspaceId !== workspace.id) {
    fail(401, "INVALID_USER_TOKEN", "The user token is invalid for this workspace.");
  }
  return { workspace, user };
}
