// Opt-in live source verification against an ephemeral test database, never production.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { getProfile, listJobs } from "../lib/store.mjs";
import { runCollection } from "../lib/pipeline.mjs";
const pg = new PGlite();
try {
  await pg.exec(
    await readFile(
      new URL("../supabase/migrations/001_jobwatch_v2.sql", import.meta.url),
      "utf8",
    ),
  );
  const db = {
    query: (...args) => pg.query(...args),
    transaction: (fn) => pg.transaction(fn),
  };
  await getProfile(db);
  const first = await runCollection("live-test", { db });
  assert.equal(first.status, "success");
  assert.ok(first.scanned > 0);
  const second = await runCollection("live-test", { db });
  assert.equal(second.status, "success");
  const jobs = await listJobs(db);
  assert.equal(new Set(jobs.map((j) => j.fingerprint)).size, jobs.length);
  console.log(
    JSON.stringify(
      { first, second, saved: jobs.length, uniqueFingerprints: true },
      null,
      2,
    ),
  );
} finally {
  await pg.close();
}
