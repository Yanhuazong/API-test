import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as typeof globalThis & {
  labPool?: Pool;
  labDb?: NodePgDatabase<typeof schema>;
};

export function getPool(connectionString = process.env.DATABASE_URL): Pool {
  if (!connectionString) throw new Error("DATABASE_URL is required for database operations.");
  if (connectionString === process.env.DATABASE_URL && globalForDb.labPool) return globalForDb.labPool;
  const pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
  if (connectionString === process.env.DATABASE_URL) globalForDb.labPool = pool;
  return pool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (globalForDb.labDb) return globalForDb.labDb;
  const pool = getPool();
  const db = drizzle(pool, { schema });
  globalForDb.labDb = db;
  return db;
}

export { schema };
