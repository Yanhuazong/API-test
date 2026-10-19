import { randomUUID } from "node:crypto";
import { after, before } from "node:test";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { schema } from "../src/db";
import { hashSecret } from "../src/lib/auth";
import { randomSecret, seedWorkspace, testDateFromNow } from "../src/lib/seed";

const connectionString = process.env.INTEGRATION_DATABASE_URL;
if (!connectionString) throw new Error("INTEGRATION_DATABASE_URL is required; tests never fall back to DATABASE_URL.");

export const pool = new Pool({ connectionString, max: 5 });
export const db = drizzle(pool, { schema });
export const apiBase = process.env.LAB_TEST_BASE_URL ?? "http://127.0.0.1:3101";

export interface TestWorkspace {
  id: string;
  key: string;
  tokens: { studentA: string; studentB: string; advisor: string };
  manifest: Awaited<ReturnType<typeof seedWorkspace>>;
}

export let lab: TestWorkspace;
export let otherLab: TestWorkspace;
export let rateLab: TestWorkspace;

async function createWorkspace(name: string): Promise<TestWorkspace> {
  const id = randomUUID();
  const key = randomSecret();
  const tokens = { studentA: randomSecret(), studentB: randomSecret(), advisor: randomSecret() };
  await db.insert(schema.workspaces).values({ id, name, keyHash: hashSecret(key) });
  const manifest = await db.transaction(async (tx) => seedWorkspace(tx, id, testDateFromNow(), false, {
    studentA: hashSecret(tokens.studentA),
    studentB: hashSecret(tokens.studentB),
    advisor: hashSecret(tokens.advisor),
  }));
  return { id, key, tokens, manifest };
}

export function headers(workspace: TestWorkspace, identity?: keyof TestWorkspace["tokens"], extra?: HeadersInit): Headers {
  const result = new Headers(extra);
  if (!result.has("X-API-Key")) result.set("X-API-Key", workspace.key);
  if (identity) result.set("Authorization", `Bearer ${workspace.tokens[identity]}`);
  return result;
}

export function callApi(
  workspace: TestWorkspace,
  path: string,
  identity?: keyof TestWorkspace["tokens"],
  init: RequestInit = {},
): Promise<Response> {
  const requestHeaders = headers(workspace, identity, init.headers);
  return fetch(`${apiBase}${path}`, { ...init, headers: requestHeaders });
}

export async function resetWorkspace(workspace: TestWorkspace = lab): Promise<void> {
  const response = await callApi(workspace, "/api/reset", "studentA", { method: "POST" });
  if (!response.ok) throw new Error(`Test workspace reset failed with HTTP ${response.status}.`);
}

export function installFixtureHooks() {
  before(async () => {
    lab = await createWorkspace(`test-${randomUUID()}`);
    otherLab = await createWorkspace(`test-other-${randomUUID()}`);
    rateLab = await createWorkspace(`test-rate-${randomUUID()}`);
  });
  after(async () => {
    if (lab) await db.delete(schema.workspaces).where(eq(schema.workspaces.id, lab.id));
    if (otherLab) await db.delete(schema.workspaces).where(eq(schema.workspaces.id, otherLab.id));
    if (rateLab) await db.delete(schema.workspaces).where(eq(schema.workspaces.id, rateLab.id));
    await pool.end();
  });
}
