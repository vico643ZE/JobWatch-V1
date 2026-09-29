import pg from "pg";
// PostgreSQL DATE is a calendar day, not a timestamp in the server timezone.
pg.types.setTypeParser(1082, (value) => value);
let pool;
export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL manquante");
  if (!pool) {
    const u = new URL(process.env.DATABASE_URL);
    // Prevent connection-string options from silently disabling certificate checks.
    for (const k of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
      u.searchParams.delete(k);
    pool = new pg.Pool({
      connectionString: u.toString(),
      max: 5,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      statement_timeout: 30000,
      ssl:
        process.env.DATABASE_SSL === "disable"
          ? false
          : {
              rejectUnauthorized: true,
              ...(process.env.DATABASE_CA
                ? { ca: process.env.DATABASE_CA.replace(/\\n/g, "\n") }
                : {}),
            },
    });
    pool.on("error", () =>
      console.error(
        JSON.stringify({ event: "database_idle_connection_error" }),
      ),
    );
  }
  return pool;
}
export const query = (text, params) => getPool().query(text, params);
export async function transaction(fn, db = getPool()) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
