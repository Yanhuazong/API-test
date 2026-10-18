import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { Pool } from "pg";

const connectionString = process.env.INTEGRATION_DATABASE_URL;
const mode = process.argv[2];
const port = 3101;
const baseUrl = `http://127.0.0.1:${port}`;

async function applyMigrations() {
  if (!connectionString) throw new Error("Set INTEGRATION_DATABASE_URL to a dedicated disposable PostgreSQL database.");
  if (process.env.DATABASE_URL && process.env.DATABASE_URL === connectionString) {
    throw new Error("INTEGRATION_DATABASE_URL must differ from DATABASE_URL; classroom data is not a test target.");
  }
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS lab_schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const names = (await readdir("./drizzle")).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
    for (const name of names) {
      const existing = await client.query("SELECT 1 FROM lab_schema_migrations WHERE name = $1", [name]);
      if (existing.rowCount) continue;
      await client.query("BEGIN");
      try {
        await client.query(await readFile(join("drizzle", name), "utf8"));
        await client.query("INSERT INTO lab_schema_migrations(name) VALUES ($1)", [name]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

async function waitForServer(child: ReturnType<typeof spawn>) {
  const end = Date.now() + 60_000;
  while (Date.now() < end) {
    if (child.exitCode !== null) throw new Error("The Next.js test server exited before becoming ready.");
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("Timed out waiting for the test HTTP server.");
}

async function main() {
  if (mode !== "integration" && mode !== "concurrency") throw new Error("Use integration or concurrency mode.");
  await applyMigrations();
  const env = {
    ...process.env,
    DATABASE_URL: connectionString,
    LAB_TEST_BASE_URL: baseUrl,
    NEXT_TELEMETRY_DISABLED: "1",
  };
  const nextBin = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const tsxBin = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const server = spawn(process.execPath, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    env, stdio: "inherit", windowsHide: true,
  });
  try {
    await waitForServer(server);
    const testFile = mode === "integration" ? "tests/integration.test.ts" : "tests/concurrency.test.ts";
    const code = await run(process.execPath, [tsxBin, "--test", testFile], env);
    if (code !== 0) process.exitCode = code;
  } finally {
    server.kill();
  }
}

main().catch((error: unknown) => {
  console.error("HTTP test run failed.");
  if (error instanceof Error) console.error(error.message);
  process.exitCode = 1;
});
