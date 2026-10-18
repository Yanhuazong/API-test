import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { getPool } from "../src/db";

async function main() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS lab_schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const migrations = (await readdir("./drizzle")).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
    for (const name of migrations) {
      const { rows } = await client.query<{ name: string }>(
        "SELECT name FROM lab_schema_migrations WHERE name = $1",
        [name],
      );
      if (rows.length) continue;
      const migration = await readFile(join("drizzle", name), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(migration);
        await client.query("INSERT INTO lab_schema_migrations(name) VALUES ($1)", [name]);
        await client.query("COMMIT");
        console.info(`Applied ${name}.`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    console.info("Database migrations are current.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Migration failed. Check DATABASE_URL and the migration output above.");
  if (error instanceof Error) console.error(error.message);
  process.exitCode = 1;
});
