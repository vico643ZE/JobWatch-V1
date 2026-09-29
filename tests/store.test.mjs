import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  getProfile,
  storeJob,
  listJobs,
  updateApplication,
  reconcileBoard,
  saveProfile,
} from "../lib/store.mjs";
import { normalizedJob } from "../lib/normalize.mjs";
import { runCollection } from "../lib/pipeline.mjs";
import { sendPending } from "../lib/notifications.mjs";
const schema = await readFile(
  new URL("../supabase/migrations/001_jobwatch_v2.sql", import.meta.url),
  "utf8",
);
async function database() {
  const pg = new PGlite();
  await pg.exec(schema);
  const db = {
    query: (...args) => pg.query(...args),
    transaction: (fn) => pg.transaction(fn),
  };
  await getProfile(db);
  return { pg, db };
}
const job = (changes = {}) =>
  normalizedJob({
    company: "Acme",
    title: "Contrôleur de gestion IT",
    location: "Paris",
    country: "fr",
    contract_type: "CDI",
    seniority: "3 ans",
    description:
      "CAPEX OPEX budget forecast reporting KPI business case ROI portfolio finance transformation Excel Anaplan IT",
    source: "SmartRecruiters",
    source_company_id: "Acme",
    external_id: "1",
    url: "https://jobs.example/1",
    ...changes,
  });
test("migrations rejouables et toutes tables privées", async () => {
  const { pg, db } = await database();
  try {
    await pg.exec(schema);
    const tables = await db.query(
      "SELECT relname,relrowsecurity FROM pg_class WHERE relname LIKE 'jw_%' AND relkind='r'",
    );
    assert.equal(tables.rows.length, 10);
    assert.ok(tables.rows.every((t) => t.relrowsecurity));
  } finally {
    await pg.close();
  }
});
test("dédup par identifiant, URL, empreinte et conservation candidature", async () => {
  const { pg, db } = await database();
  try {
    const first = await storeJob(job(), {}, db);
    assert.ok(first.created);
    assert.equal(
      (await storeJob(job({ title: "Contrôleur IT actualisé" }), {}, db))
        .created,
      false,
    );
    await updateApplication(
      first.id,
      {
        status: "Envoyée",
        note: "Relancer vendredi",
        applied_at: "2026-09-28",
      },
      db,
    );
    assert.equal(
      (
        await storeJob(
          job({
            source: "Autre",
            source_company_id: "Autre",
            external_id: "2",
          }),
          {},
          db,
        )
      ).created,
      false,
    );
    assert.equal(
      (
        await storeJob(
          job({
            source: "Autre",
            source_company_id: "Autre",
            external_id: "3",
            url: "https://jobs.example/other",
          }),
          {},
          db,
        )
      ).created,
      false,
    );
    const jobs = await listJobs(db);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].status, "Envoyée");
    assert.equal(jobs[0].note, "Relancer vendredi");
    assert.equal(jobs[0].sources.length, 3);
    assert.equal(jobs[0].history.length, 2);
  } finally {
    await pg.close();
  }
});
test("clôture seulement lorsque toutes les sources ont retiré une offre", async () => {
  const { pg, db } = await database();
  try {
    await storeJob(job(), {}, db);
    await storeJob(
      job({ source_company_id: "Other", external_id: "99" }),
      {},
      db,
    );
    await reconcileBoard("Acme", [], db);
    assert.equal((await listJobs(db))[0].status_active, true);
    await reconcileBoard("Other", [], db);
    assert.equal((await listJobs(db))[0].status_active, false);
    await reconcileBoard("Acme", ["1"], db);
    assert.equal((await listJobs(db))[0].status_active, true);
  } finally {
    await pg.close();
  }
});
test("batch idempotent et source en panne ne clôture aucune offre", async () => {
  const { pg, db } = await database();
  try {
    const profile = await getProfile(db);
    await saveProfile({ ...profile, boards: ["Acme"] }, db);
    const collector = async () => ({
      jobs: [job()],
      seen: ["1"],
      scanned: 1,
      details: 1,
      complete: true,
      errors: [],
    });
    const notify = async () => ({ sent: 0 });
    assert.equal(
      (await runCollection("test", { db, collector, notify })).created,
      1,
    );
    assert.equal(
      (await runCollection("test", { db, collector, notify })).created,
      0,
    );
    const failed = await runCollection("test", {
      db,
      collector: async () => {
        throw new Error("Source HTTP 503");
      },
      notify,
    });
    assert.equal(failed.status, "failed");
    assert.equal((await listJobs(db))[0].status_active, true);
    assert.equal((await db.query("SELECT * FROM jw_locks")).rows.length, 0);
  } finally {
    await pg.close();
  }
});
test("verrou exclut une collecte concurrente", async () => {
  const { pg, db } = await database();
  try {
    await db.query(
      "INSERT INTO jw_locks VALUES('collection','00000000-0000-4000-8000-000000000001',now()+interval '1 minute')",
    );
    await assert.rejects(
      () => runCollection("test", { db }),
      (e) => e.status === 409,
    );
  } finally {
    await pg.close();
  }
});
test("notification envoyée une fois et envoi incertain ancien sans nouvel email", async () => {
  const { pg, db } = await database();
  try {
    const profile = { ...(await getProfile(db)), alertsEnabled: true };
    const saved = await storeJob(job(), { notify: true }, db);
    let sent = 0;
    const provider = {
      send: async () => {
        sent++;
        return { id: "test" };
      },
    };
    await sendPending(profile, { db, provider, configured: true });
    await sendPending(profile, { db, provider, configured: true });
    assert.equal(sent, 1);
    assert.equal((await listJobs(db))[0].alert_sent, true);
    await db.query(
      "UPDATE jw_notifications SET state='pending',first_attempt_at=now()-interval '25 hours' WHERE job_id=$1",
      [saved.id],
    );
    await sendPending(profile, { db, provider, configured: true });
    assert.equal(sent, 1);
    assert.equal(
      (await db.query("SELECT state FROM jw_notifications")).rows[0].state,
      "failed",
    );
  } finally {
    await pg.close();
  }
});
test("changement profil recalcule sans altérer notes et historique", async () => {
  const { pg, db } = await database();
  try {
    const saved = await storeJob(job(), {}, db);
    await updateApplication(
      saved.id,
      { status: "Entretien RH", note: "Lundi" },
      db,
    );
    const old = (await listJobs(db))[0];
    const profile = await getProfile(db);
    await saveProfile({ ...profile, tools: [] }, db);
    const now = (await listJobs(db))[0];
    assert.ok(now.match_score < old.match_score);
    assert.equal(now.note, "Lundi");
    assert.equal(now.status, "Entretien RH");
  } finally {
    await pg.close();
  }
});
test("un import manuel ne garde pas artificiellement active une annonce retirée", async () => {
  const { pg, db } = await database();
  try {
    await storeJob(job(), {}, db);
    await storeJob(
      job({ source: "Import V1", source_company_id: "", external_id: "v1" }),
      {},
      db,
    );
    await reconcileBoard("Acme", [], db);
    assert.equal((await listJobs(db))[0].status_active, false);
  } finally {
    await pg.close();
  }
});
test("premier batch sans alerte, nouvelles offres suivantes notifiables, pas de doublon", async () => {
  const { pg, db } = await database();
  const old = [
    process.env.RESEND_API_KEY,
    process.env.ALERT_EMAIL_FROM,
    process.env.ALERT_EMAIL_TO,
  ];
  process.env.RESEND_API_KEY = "unit-test-only";
  process.env.ALERT_EMAIL_FROM = "sender@example.test";
  process.env.ALERT_EMAIL_TO = "receiver@example.test";
  try {
    const profile = {
      ...(await getProfile(db)),
      boards: ["Acme"],
      alertsEnabled: true,
    };
    await saveProfile(profile, db);
    let collection = [job()];
    const collector = async () => ({
      jobs: collection,
      seen: collection.map((j) => j.external_id),
      scanned: collection.length,
      details: collection.length,
      complete: true,
      errors: [],
    });
    const notify = async () => ({ sent: 0 });
    await runCollection("test", { db, collector, notify });
    assert.equal(
      (await db.query("SELECT * FROM jw_notifications")).rows.length,
      0,
    );
    collection.push(
      job({
        external_id: "2",
        company: "Second enterprise",
        url: "https://jobs.example/2",
      }),
    );
    await runCollection("test", { db, collector, notify });
    await runCollection("test", { db, collector, notify });
    assert.equal(
      (await db.query("SELECT * FROM jw_notifications")).rows.length,
      1,
    );
  } finally {
    [
      process.env.RESEND_API_KEY,
      process.env.ALERT_EMAIL_FROM,
      process.env.ALERT_EMAIL_TO,
    ] = old;
    await pg.close();
  }
});
test("reprise email réutilise exactement le contenu même après modification du score", async () => {
  const { pg, db } = await database();
  try {
    const profile = { ...(await getProfile(db)), alertsEnabled: true };
    const saved = await storeJob(job(), { notify: true }, db);
    let first = true;
    const payloads = [];
    const provider = {
      prepare: (j) => ({ subject: String(j.match_score) }),
      send: async (j, payload) => {
        payloads.push(payload);
        if (first) {
          first = false;
          throw new Error("Network");
        }
        return { id: "ok" };
      },
    };
    await sendPending(profile, { db, provider, configured: true });
    await db.query(
      "UPDATE jw_jobs SET data=jsonb_set(data,'{match_score}','99') WHERE id=$1",
      [saved.id],
    );
    await sendPending(profile, { db, provider, configured: true });
    assert.deepEqual(payloads, [{ subject: "100" }, { subject: "100" }]);
  } finally {
    await pg.close();
  }
});
test("réimporter une offre retirée ne la réactive pas", async () => {
  const { pg, db } = await database();
  try {
    await storeJob(job(), {}, db);
    await reconcileBoard("Acme", [], db);
    await storeJob(
      job({
        source: "Import V1",
        source_company_id: "",
        external_id: "legacy",
      }),
      {},
      db,
    );
    assert.equal((await listJobs(db))[0].status_active, false);
  } finally {
    await pg.close();
  }
});
