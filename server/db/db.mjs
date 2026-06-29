import dotenv from "dotenv";
import { Pool } from "@neondatabase/serverless";

dotenv.config({ quiet: true });

let pool = null;

export function missingDatabaseUrlError() {
  const error = new Error("Missing DATABASE_URL");
  error.status = 500;
  error.payload = { error: "Missing DATABASE_URL" };
  return error;
}

export function requireDatabaseUrl() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw missingDatabaseUrlError();
  return connectionString;
}

export function getPool() {
  if (!pool) {
    const configuredPoolMax = Number(process.env.DATABASE_POOL_MAX);
    const max = Number.isInteger(configuredPoolMax) && configuredPoolMax > 0
      ? configuredPoolMax
      : 1;
    pool = new Pool({
      connectionString: requireDatabaseUrl(),
      max,
    });
  }
  return pool;
}

export async function query(text, params = []) {
  return getPool().query(text, params);
}

export async function transaction(callback) {
  const client = await getPool().connect();
  const tx = {
    query: (text, params = []) => client.query(text, params),
  };

  try {
    await client.query("BEGIN");
    const result = await callback(tx);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original error.
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (!pool) return;
  const activePool = pool;
  pool = null;
  await activePool.end();
}
