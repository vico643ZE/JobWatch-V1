import { fetchJson } from "./http.mjs";
import { productionDb } from "./store.mjs";
import { filterReason } from "./matching.mjs";
export function emailConfigured() {
  return Boolean(
    process.env.RESEND_API_KEY &&
      process.env.ALERT_EMAIL_FROM &&
      process.env.ALERT_EMAIL_TO,
  );
}
export class ResendNotificationProvider {
  prepare(job) {
    return {
      from: process.env.ALERT_EMAIL_FROM,
      to: [process.env.ALERT_EMAIL_TO],
      subject: `JobWatch · ${job.match_score}/100 · ${job.title}`,
      text: `${job.title}\n${job.company} · ${job.location}\nScore : ${job.match_score}/100\n\n${job.match_reasons.join("\n")}\n\nPoints à vérifier :\n${job.match_gaps.join("\n")}\n\nAnnonce : ${job.url || ""}\nJobWatch : ${process.env.APP_URL || ""}`,
    };
  }
  async send(job, payload = this.prepare(job)) {
    const result = await fetchJson("https://api.resend.com/emails", {
      method: "POST",
      retries: 0,
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `jobwatch-${job.id}`,
      },
      body: JSON.stringify(payload),
    });
    if (!result.id) throw new Error("Réponse email sans identifiant");
    return result;
  }
}
export async function sendPending(
  profile,
  {
    db = productionDb,
    provider = new ResendNotificationProvider(),
    configured = emailConfigured(),
  } = {},
) {
  if (!profile.alertsEnabled || !configured)
    return { sent: 0, failed: 0, enabled: false };
  const items = (
    await db.query(
      `SELECT n.*,j.data,j.status_active FROM jw_notifications n JOIN jw_jobs j ON j.id=n.job_id WHERE n.state='pending' ORDER BY n.created_at LIMIT 20`,
    )
  ).rows;
  let sent = 0,
    failed = 0;
  for (const item of items) {
    if (
      !item.status_active ||
      item.data.match_score < profile.alertThreshold ||
      filterReason(item.data, profile)
    ) {
      await db.query(
        "UPDATE jw_notifications SET state='suppressed',last_error='Offre inactive ou hors critères' WHERE job_id=$1",
        [item.job_id],
      );
      continue;
    }
    // Resend idempotency lasts 24h. Never retry an uncertain delivery outside that window.
    if (
      item.first_attempt_at &&
      Date.now() - new Date(item.first_attempt_at) > 23 * 3600000
    ) {
      await db.query(
        "UPDATE jw_notifications SET state='failed',last_error='Envoi incertain : fenêtre de relance expirée' WHERE job_id=$1",
        [item.job_id],
      );
      failed++;
      continue;
    }
    const job = { ...item.data, id: item.job_id };
    const payload = item.payload || provider.prepare?.(job) || null;
    await db.query(
      "UPDATE jw_notifications SET attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),payload=coalesce(payload,$2::jsonb) WHERE job_id=$1",
      [item.job_id, payload ? JSON.stringify(payload) : null],
    );
    try {
      await provider.send(job, payload);
      await db.query(
        "UPDATE jw_notifications SET state='sent',sent_at=now(),last_error=null WHERE job_id=$1",
        [item.job_id],
      );
      sent++;
    } catch {
      await db.query(
        "UPDATE jw_notifications SET last_error='Échec ou réponse incertaine du fournisseur email' WHERE job_id=$1",
        [item.job_id],
      );
      failed++;
    }
  }
  return { sent, failed, enabled: true };
}
