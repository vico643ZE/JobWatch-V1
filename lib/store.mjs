import { randomUUID } from "node:crypto";
import { query, transaction } from "./db.mjs";
import { DEFAULT_PROFILE, STATUSES } from "./profile.mjs";
import { scoreJob } from "./matching.mjs";
export const productionDb = { query, transaction };
export async function getProfile(db = productionDb) {
  await db.query(
    "INSERT INTO jw_settings(id,profile) VALUES(1,$1) ON CONFLICT DO NOTHING",
    [JSON.stringify(DEFAULT_PROFILE)],
  );
  return (await db.query("SELECT profile FROM jw_settings WHERE id=1")).rows[0]
    .profile;
}
export async function saveProfile(profile, db = productionDb) {
  await db.transaction(async (c) => {
    await c.query("SELECT id FROM jw_settings WHERE id=1 FOR UPDATE");
    await c.query(
      "UPDATE jw_settings SET profile=$1,updated_at=now() WHERE id=1",
      [JSON.stringify(profile)],
    );
    const jobs = await c.query("SELECT id,data FROM jw_jobs");
    for (const job of jobs.rows)
      await c.query("UPDATE jw_jobs SET data=$2,updated_at=now() WHERE id=$1", [
        job.id,
        JSON.stringify({ ...job.data, ...scoreJob(job.data, profile) }),
      ]);
  });
}
export async function storeJob(
  job,
  {
    status = "Nouvelles offres",
    note = "",
    notify = false,
    profile = DEFAULT_PROFILE,
  } = {},
  db = productionDb,
) {
  return db.transaction(async (c) => {
    // Serialize dedup decisions across web imports and the scheduled collector.
    await c.query("SELECT id FROM jw_settings WHERE id=1 FOR UPDATE");
    const ext = job.external_id || job.fingerprint,
      source = job.source || "Manuel",
      board = job.source_company_id || "";
    const existing = await c.query(
      `SELECT j.* FROM jw_jobs j LEFT JOIN jw_job_sources s ON s.job_id=j.id
      WHERE (s.source=$1 AND s.board=$2 AND s.external_id=$3) OR ($4::text IS NOT NULL AND (j.canonical_url=$4 OR s.canonical_url=$4)) OR j.fingerprint=$5
      ORDER BY CASE WHEN s.source=$1 AND s.board=$2 AND s.external_id=$3 THEN 0 WHEN j.canonical_url=$4 OR s.canonical_url=$4 THEN 1 ELSE 2 END LIMIT 1`,
      [source, board, ext, job.url, job.fingerprint],
    );
    const old = existing.rows[0],
      id = old?.id || randomUUID(),
      data = { ...job, ...scoreJob(job, profile) };
    if (old) {
      // An import must never overwrite a richer collected description or a user's application.
      const merged =
        source === "Import V1" || source === "Manuel"
          ? { ...data, ...old.data }
          : { ...old.data, ...data };
      await c.query(
        "UPDATE jw_jobs SET data=$2,status_active=CASE WHEN $3 THEN status_active ELSE true END,last_seen_at=CASE WHEN $3 THEN last_seen_at ELSE now() END,updated_at=now() WHERE id=$1",
        [
          id,
          JSON.stringify(merged),
          source === "Import V1" || source === "Manuel",
        ],
      );
    } else {
      await c.query(
        "INSERT INTO jw_jobs(id,fingerprint,canonical_url,data) VALUES($1,$2,$3,$4)",
        [id, job.fingerprint, job.url, JSON.stringify(data)],
      );
      await c.query(
        "INSERT INTO jw_applications(job_id,status,note) VALUES($1,$2,$3)",
        [id, status, note],
      );
      await c.query("INSERT INTO jw_events(job_id,status) VALUES($1,$2)", [
        id,
        status,
      ]);
      if (notify)
        await c.query(
          "INSERT INTO jw_notifications(job_id) VALUES($1) ON CONFLICT DO NOTHING",
          [id],
        );
    }
    await c.query(
      `INSERT INTO jw_job_sources(source,board,external_id,job_id,canonical_url) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(source,board,external_id) DO UPDATE SET active=true,last_seen_at=now(),canonical_url=excluded.canonical_url`,
      [source, board, ext, id, job.url],
    );
    return { id, created: !old, score: data.match_score };
  });
}
export async function reconcileBoard(board, seen, db = productionDb) {
  await db.transaction(async (c) => {
    await c.query(
      "UPDATE jw_job_sources SET active=(external_id=ANY($2::text[])),last_seen_at=CASE WHEN external_id=ANY($2::text[]) THEN now() ELSE last_seen_at END WHERE source='SmartRecruiters' AND board=$1",
      [board, seen],
    );
    await c.query(
      "UPDATE jw_jobs j SET status_active=EXISTS(SELECT 1 FROM jw_job_sources s WHERE s.job_id=j.id AND s.active AND s.source NOT IN ('Manuel','Import V1')),last_seen_at=coalesce((SELECT max(s.last_seen_at) FROM jw_job_sources s WHERE s.job_id=j.id),j.last_seen_at) WHERE j.id IN(SELECT job_id FROM jw_job_sources WHERE source='SmartRecruiters' AND board=$1)",
      [board],
    );
    await c.query(
      "INSERT INTO jw_boards(board,last_success_at) VALUES($1,now()) ON CONFLICT(board) DO UPDATE SET last_success_at=now()",
      [board],
    );
  });
}
export async function listJobs(db = productionDb) {
  const rows = (
    await db.query(`SELECT j.*,a.status,a.note,a.applied_at,a.follow_up_at,
    coalesce((SELECT jsonb_agg(jsonb_build_object('status',e.status,'date',e.created_at) ORDER BY e.created_at DESC) FROM jw_events e WHERE e.job_id=j.id),'[]') AS history,
    coalesce((SELECT jsonb_agg(jsonb_build_object('source',s.source,'board',s.board,'url',s.canonical_url,'active',s.active)) FROM jw_job_sources s WHERE s.job_id=j.id),'[]') AS sources,
    EXISTS(SELECT 1 FROM jw_notifications n WHERE n.job_id=j.id AND n.state='sent') AS alert_sent
    FROM jw_jobs j JOIN jw_applications a ON a.job_id=j.id ORDER BY j.first_seen_at DESC`)
  ).rows;
  return rows.map(({ data, canonical_url, fingerprint, ...row }) => ({
    ...data,
    ...row,
    fingerprint,
    url: data.url || canonical_url,
  }));
}
export async function updateApplication(id, input, db = productionDb) {
  if (
    !STATUSES.includes(input.status) ||
    typeof input.note !== "string" ||
    input.note.length > 10000
  )
    throw new Error("Statut ou note invalide.");
  for (const key of ["applied_at", "follow_up_at"])
    if (
      input[key] &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(input[key]) ||
        Number.isNaN(Date.parse(input[key])) ||
        new Date(input[key]).toISOString().slice(0, 10) !== input[key])
    )
      throw new Error("Date invalide.");
  return db.transaction(async (c) => {
    const old = (
      await c.query(
        "SELECT * FROM jw_applications WHERE job_id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (!old) throw new Error("Candidature introuvable.");
    await c.query(
      "UPDATE jw_applications SET status=$2,note=$3,applied_at=$4,follow_up_at=$5,updated_at=now() WHERE job_id=$1",
      [
        id,
        input.status,
        input.note,
        input.applied_at || null,
        input.follow_up_at || null,
      ],
    );
    if (old.status !== input.status)
      await c.query("INSERT INTO jw_events(job_id,status) VALUES($1,$2)", [
        id,
        input.status,
      ]);
  });
}
