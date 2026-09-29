import { randomUUID } from "node:crypto";
import {
  productionDb,
  getProfile,
  storeJob,
  reconcileBoard,
} from "./store.mjs";
import { collectBoard } from "./collectors/smartrecruiters.mjs";
import { scoreJob, filterReason } from "./matching.mjs";
import { sendPending, emailConfigured } from "./notifications.mjs";
export async function runCollection(
  trigger = "manual",
  { db = productionDb, collector = collectBoard, notify = sendPending } = {},
) {
  const id = randomUUID();
  const lock = await db.query(
    `INSERT INTO jw_locks(name,owner,expires_at) VALUES('collection',$1,now()+interval '15 minutes')
    ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE jw_locks.expires_at<now() RETURNING owner`,
    [id],
  );
  if (!lock.rows.length) {
    const error = new Error("Une collecte est déjà en cours.");
    error.status = 409;
    throw error;
  }
  const summary = {
    scanned: 0,
    retained: 0,
    created: 0,
    updated: 0,
    filtered: 0,
    boards: [],
    errors: [],
  };
  try {
    await db.query(
      "UPDATE jw_runs SET status='failed',finished_at=now(),summary=jsonb_build_object('errors',jsonb_build_array('Exécution interrompue ; relance possible')) WHERE status='running' AND started_at<now()-interval '15 minutes'",
    );
    await db.query("INSERT INTO jw_runs(id,trigger) VALUES($1,$2)", [
      id,
      trigger,
    ]);
    const profile = await getProfile(db),
      deadline = Date.now() + 8 * 60000;
    for (const board of profile.boards) {
      try {
        const baseline = Boolean(
          (
            await db.query(
              "SELECT last_success_at FROM jw_boards WHERE board=$1",
              [board],
            )
          ).rows[0]?.last_success_at,
        );
        const result = await collector(board, profile, { deadline });
        summary.scanned += result.scanned;
        for (const job of result.jobs) {
          const match = scoreJob(job, profile);
          if (
            filterReason(job, profile) ||
            match.match_score < profile.minScore
          ) {
            summary.filtered++;
            continue;
          }
          const saved = await storeJob(
            job,
            {
              profile,
              notify:
                baseline &&
                result.complete &&
                profile.alertsEnabled &&
                emailConfigured() &&
                match.match_score >= profile.alertThreshold,
            },
            db,
          );
          summary.retained++;
          summary[saved.created ? "created" : "updated"]++;
        }
        if (result.complete) await reconcileBoard(board, result.seen, db);
        summary.boards.push({
          board,
          scanned: result.scanned,
          details: result.details,
          complete: result.complete,
          initial: !baseline,
        });
        summary.errors.push(...result.errors.map((e) => `${board} : ${e}`));
      } catch (e) {
        summary.errors.push(`${board} : ${e.message}`);
      }
    }
    summary.notifications = await notify(profile, { db });
    const status = summary.errors.length
      ? summary.boards.length
        ? "partial"
        : "failed"
      : "success";
    await db.query(
      "UPDATE jw_runs SET status=$2,finished_at=now(),summary=$3 WHERE id=$1",
      [id, status, JSON.stringify(summary)],
    );
    console.log(
      JSON.stringify({
        event: "collection_finished",
        id,
        status,
        scanned: summary.scanned,
        created: summary.created,
        errors: summary.errors.length,
      }),
    );
    return { id, status, ...summary };
  } catch (error) {
    await db
      .query(
        "UPDATE jw_runs SET status='failed',finished_at=now(),summary=$2 WHERE id=$1",
        [
          id,
          JSON.stringify({
            errors: [
              "Erreur de collecte ; vérifier la connexion à la base et les journaux.",
            ],
          }),
        ],
      )
      .catch(() => {});
    throw error;
  } finally {
    await db.query(
      "DELETE FROM jw_locks WHERE name='collection' AND owner=$1",
      [id],
    );
  }
}
