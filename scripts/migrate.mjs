import { readFile } from "node:fs/promises";
import { getPool, closePool } from "../lib/db.mjs";
import { DEFAULT_PROFILE } from "../lib/profile.mjs";
try {
  const sql = await readFile(
    new URL("../supabase/migrations/001_jobwatch_v2.sql", import.meta.url),
    "utf8",
  );
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(7418202)");
    await client.query(sql);
    await client.query(
      "INSERT INTO jw_settings(id,profile) VALUES(1,$1) ON CONFLICT DO NOTHING",
      [JSON.stringify(DEFAULT_PROFILE)],
    );
    await client.query("COMMIT");
    console.log("Migration V2 appliquée. Table V1 conservée.");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
} catch (e) {
  console.error("Migration impossible :", e.code || e.name);
  process.exitCode = 1;
} finally {
  await closePool();
}
