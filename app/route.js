import { NextResponse } from "next/server";
import {
  COOKIE,
  authConfigured,
  validSession,
  verifyPassword,
  createSession,
  cookieOptions,
  sameOrigin,
  loginBucket,
} from "../../../lib/auth.mjs";
import { query } from "../../../lib/db.mjs";
import {
  getProfile,
  saveProfile,
  listJobs,
  storeJob,
  updateApplication,
} from "../../../lib/store.mjs";
import { validateProfile } from "../../../lib/profile.mjs";
import { bodyJson, manualJob } from "../../../lib/validation.mjs";
import { runCollection } from "../../../lib/pipeline.mjs";
import { emailConfigured } from "../../../lib/notifications.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (data, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
async function handler(request, context) {
  const path = (await context.params).path.join("/"),
    method = request.method;
  try {
    if (path === "health" && method === "GET") {
      if (!authConfigured() || !process.env.DATABASE_URL)
        return json({ ok: false, version: "2.0.0" }, 503);
      try {
        await query("SELECT id FROM jw_settings LIMIT 1");
        return json({ ok: true, version: "2.0.0" });
      } catch {
        return json({ ok: false, version: "2.0.0" }, 503);
      }
    }
    if (!authConfigured())
      return json(
        {
          error:
            "Configuration privée incomplète. Consultez le guide de déploiement.",
        },
        503,
      );
    if (method !== "GET" && !sameOrigin(request))
      return json({ error: "Origine de la requête refusée." }, 403);
    if (path === "login" && method === "POST") {
      const input = await bodyJson(request, 2000);
      if (typeof input.password !== "string" || input.password.length > 256)
        return json({ error: "Mot de passe invalide." }, 400);
      // Persistent limits survive restarts. Global bucket also bounds spoofed proxy headers.
      for (const key of ["global", loginBucket(request)]) {
        const result = await query(
          `INSERT INTO jw_login_limits(key,attempts,expires_at) VALUES($1,1,now()+interval '15 minutes')
          ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN jw_login_limits.expires_at<now() THEN 1 ELSE jw_login_limits.attempts+1 END,
          expires_at=CASE WHEN jw_login_limits.expires_at<now() THEN now()+interval '15 minutes' ELSE jw_login_limits.expires_at END RETURNING attempts`,
          [key],
        );
        if (result.rows[0].attempts > (key === "global" ? 100 : 10))
          return json(
            { error: "Trop de tentatives. Réessayez dans 15 minutes." },
            429,
          );
      }
      if (!verifyPassword(input.password))
        return json({ error: "Mot de passe incorrect." }, 401);
      const response = json({ ok: true });
      response.cookies.set(COOKIE, createSession(), cookieOptions());
      return response;
    }
    if (!validSession(request.cookies.get(COOKIE)?.value))
      return json({ error: "Connectez-vous pour accéder à JobWatch." }, 401);
    if (path === "logout" && method === "POST") {
      const response = json({ ok: true });
      response.cookies.set(COOKIE, "", { ...cookieOptions(), maxAge: 0 });
      return response;
    }
    if (path === "dashboard" && method === "GET") {
      const [profile, jobs, runs, notifications] = await Promise.all([
        getProfile(),
        listJobs(),
        query("SELECT * FROM jw_runs ORDER BY started_at DESC LIMIT 15"),
        query(
          "SELECT state,count(*)::integer AS count FROM jw_notifications GROUP BY state",
        ),
      ]);
      return json({
        profile,
        jobs,
        runs: runs.rows,
        notifications: notifications.rows,
        emailConfigured: emailConfigured(),
      });
    }
    if (path === "profile" && method === "PUT") {
      const profile = validateProfile(await bodyJson(request));
      await getProfile();
      await saveProfile(profile);
      return json({ ok: true });
    }
    if (path === "jobs" && method === "POST") {
      const { job, ...options } = manualJob(await bodyJson(request));
      const profile = await getProfile();
      return json(await storeJob(job, { ...options, profile }), 201);
    }
    if (path === "import" && method === "POST") {
      const input = await bodyJson(request);
      if (!Array.isArray(input.jobs) || input.jobs.length > 200)
        throw new Error("Import : maximum 200 offres par lot.");
      const items = input.jobs.map((j) => manualJob(j, true)),
        profile = await getProfile();
      let created = 0;
      for (const { job, ...options } of items) {
        const result = await storeJob(job, { ...options, profile });
        if (result.created) created++;
      }
      return json({ created, existing: items.length - created });
    }
    if (/^jobs\/[a-f0-9-]{36}$/.test(path) && method === "PATCH") {
      await updateApplication(path.split("/")[1], await bodyJson(request));
      return json({ ok: true });
    }
    if (path === "collect" && method === "POST")
      return json(await runCollection());
    return json({ error: "Route inconnue." }, 404);
  } catch (error) {
    if (error.status === 409) return json({ error: error.message }, 409);
    if (
      error.code ||
      /DATABASE_URL|connect|timeout|relation|database/i.test(error.message)
    ) {
      console.error(
        JSON.stringify({
          event: "api_error",
          path,
          code: error.code || "database",
        }),
      );
      return json(
        {
          error:
            "Base indisponible ou migration manquante. Vérifiez la configuration Render.",
        },
        503,
      );
    }
    console.error(
      JSON.stringify({ event: "request_failed", path, type: error.name }),
    );
    return json({ error: error.message || "Une erreur est survenue." }, 400);
  }
}
export { handler as GET, handler as POST, handler as PUT, handler as PATCH };
