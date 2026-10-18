import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ApiError, fail, rateLimitHeaders } from "@/lib/api";

export type LabUser = typeof schema.users.$inferSelect;
export type LabWorkspace = typeof schema.workspaces.$inferSelect;

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

const WINDOW_SECONDS = 60;

function rateLimit(): number {
  const configured = Number(process.env.RATE_LIMIT_PER_MINUTE);
  return Number.isInteger(configured) && configured > 0 ? configured : 10;
}

async function enforceRateLimit(request: Request, workspaceId: string): Promise<void> {
  if (new URL(request.url).pathname === "/api/reset") return;
  const limit = rateLimit();
  const result = await getDb().execute(sql`
    INSERT INTO rate_limits (workspace_id, window_start, request_count)
    VALUES (${workspaceId}, date_trunc('minute', now()), 1)
    ON CONFLICT (workspace_id, window_start)
    DO UPDATE SET request_count = rate_limits.request_count + 1
    RETURNING request_count,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (date_trunc('minute', now()) + interval '1 minute' - now()))))::int AS seconds_left`);
  const row = result.rows[0] as { request_count: number; seconds_left: number };
  const secondsLeft = Math.min(WINDOW_SECONDS, row.seconds_left);
  rateLimitHeaders.set(request, {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(Math.max(0, limit - row.request_count)),
    "X-RateLimit-Reset": String(secondsLeft),
  });
  if (row.request_count > limit) {
    throw new ApiError(429, "RATE_LIMITED",
      `Too many requests. Limit is ${limit} per minute; try again in ${secondsLeft} seconds.`,
      undefined, { "Retry-After": String(secondsLeft) });
  }
  if (row.request_count === 1) {
    await getDb().execute(sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 hour'`);
  }
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
  const key = request.headers.get("x-api-key");
  if (!key) fail(401, "API_KEY_REQUIRED", "Provide the assigned X-API-Key.");

  const db = getDb();
  const [workspace] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.keyHash, hashSecret(key))).limit(1);
  if (!workspace) fail(401, "INVALID_API_KEY", "The workspace key is invalid.");
  await enforceRateLimit(request, workspace.id);

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
