// Isolated local browser test. Never uses DATABASE_URL or any production secret.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { chromium } from "@playwright/test";
import { hashPassword } from "../lib/auth.mjs";
import { DEFAULT_PROFILE } from "../lib/profile.mjs";
const base = "http://127.0.0.1:3199",
  password = randomBytes(18).toString("hex");
const db = await PGlite.create();
let server, app, browser;
let logs = "";
await mkdir("test-results", { recursive: true });
try {
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/001_jobwatch_v2.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query("INSERT INTO jw_settings VALUES(1,$1,now())", [
    JSON.stringify(DEFAULT_PROFILE),
  ]);
  server = new PGLiteSocketServer({
    db,
    port: 5499,
    host: "127.0.0.1",
    maxConnections: 10,
  });
  await server.start();
  app = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3199",
    ],
    {
      env: {
        ...process.env,
        APP_URL: base,
        DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5499/postgres",
        DATABASE_SSL: "disable",
        APP_PASSWORD_HASH: hashPassword(password),
        SESSION_SECRET: randomBytes(48).toString("hex"),
        RESEND_API_KEY: "",
        ALERT_EMAIL_FROM: "",
        ALERT_EMAIL_TO: "",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  app.stdout.on("data", (x) => (logs += x));
  app.stderr.on("data", (x) => (logs += x));
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base + "/api/health")).status === 200) break;
    } catch {}
    if (i === 59) throw new Error("Serveur de test indisponible");
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.equal((await fetch(base + "/api/dashboard")).status, 401);
  assert.equal(
    (
      await fetch(base + "/api/collect", {
        method: "POST",
        headers: { Origin: "https://external.example" },
      })
    ).status,
    403,
  );
  const httpOnly = process.argv.includes("--http-only");
  const call = async (path, method = "GET", body, cookie = "") => {
    const r = await fetch(base + "/api/" + path, {
      method,
      headers: {
        Origin: base,
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get("set-cookie"),
    };
  };
  assert.equal(
    (await call("login", "POST", { password: "incorrect" })).status,
    401,
  );
  const login = await call("login", "POST", { password });
  assert.equal(login.status, 200);
  assert.ok(login.cookie.includes("HttpOnly"));
  const cookie = login.cookie.split(";")[0];
  assert.equal(
    (await call("dashboard", "GET", null, cookie + "broken")).status,
    401,
  );
  const offer = {
    company: "HTTP test",
    title: "Contrôleur de gestion IT",
    location: "Paris",
    country: "fr",
    contract_type: "CDI",
    seniority: "3 ans",
    description:
      "CAPEX OPEX budget forecast reporting KPI business case ROI portfolio finance transformation Excel Anaplan IT",
    url: "https://example.com/http-test",
  };
  assert.equal(
    (
      await call(
        "jobs",
        "POST",
        { ...offer, url: "javascript:alert(1)" },
        cookie,
      )
    ).status,
    400,
  );
  const added = await call("jobs", "POST", offer, cookie);
  assert.equal(added.status, 201);
  assert.equal(added.data.created, true);
  assert.equal((await call("jobs", "POST", offer, cookie)).data.created, false);
  assert.equal(
    (
      await call(
        "jobs/" + added.data.id,
        "PATCH",
        {
          status: "Envoyée",
          note: "Persistant",
          applied_at: "2026-09-28",
          follow_up_at: "2026-10-02",
        },
        cookie,
      )
    ).status,
    200,
  );
  let snapshot = (await call("dashboard", "GET", null, cookie)).data;
  assert.equal(snapshot.jobs.length, 1);
  assert.equal(snapshot.jobs[0].note, "Persistant");
  assert.equal(snapshot.jobs[0].applied_at, "2026-09-28");
  assert.equal(snapshot.jobs[0].follow_up_at, "2026-10-02");
  assert.equal(snapshot.jobs[0].match_score, 100);
  assert.equal(
    (
      await call(
        "jobs/" + added.data.id,
        "PATCH",
        { status: "Envoyée", note: "x", applied_at: "2026-02-31" },
        cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "import",
        "POST",
        { jobs: [{ ...offer, id: 4, note: "Old note", status: "À analyser" }] },
        cookie,
      )
    ).data.created,
    0,
  );
  assert.equal(
    (await call("profile", "PUT", { ...snapshot.profile, tools: [] }, cookie))
      .status,
    200,
  );
  snapshot = (await call("dashboard", "GET", null, cookie)).data;
  assert.equal(snapshot.jobs[0].note, "Persistant");
  assert.equal(snapshot.jobs[0].applied_at, "2026-09-28");
  assert.equal(snapshot.jobs[0].follow_up_at, "2026-10-02");
  assert.equal(snapshot.jobs[0].status, "Envoyée");
  assert.equal(snapshot.jobs[0].match_score, 95);
  assert.equal(snapshot.jobs[0].history.length, 2);
  const logout = await call("logout", "POST", {}, cookie);
  assert.equal(logout.status, 200);
  assert.ok(logout.cookie.includes("Max-Age=0"));
  console.log(
    "✓ HTTP : connexion, session, CSRF, validation, ajout, déduplication, notes, dates, import, profil et déconnexion",
  );
  if (httpOnly) {
    let result;
    for (let i = 0; i < 12; i++) {
      result = await call("login", "POST", { password: "wrong" });
      if (result.status === 429) break;
    }
    assert.equal(result.status, 429);
    console.log("✓ HTTP : limitation persistante des tentatives de connexion");
  }
  await db.exec(
    "TRUNCATE jw_jobs,jw_job_sources,jw_applications,jw_events,jw_notifications,jw_login_limits CASCADE",
  );
  await db.query("UPDATE jw_settings SET profile=$1 WHERE id=1", [
    JSON.stringify(DEFAULT_PROFILE),
  ]);
  if (!httpOnly) {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
        : {}),
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page.getByLabel("Mot de passe").fill(password);
    await page.getByRole("button", { name: "Ouvrir mon espace" }).click();
    await page.getByText("Votre veille commence ici").waitFor();
    console.log("✓ Accès privé, connexion et dashboard vide");
    await page.evaluate(() =>
      localStorage.setItem(
        "jobwatch-jobs",
        JSON.stringify([
          {
            id: 123,
            company: "Entreprise de test",
            title: "Contrôleur de gestion IT",
            location: "Paris",
            date: "2026-09-20",
            status: "Envoyée",
            description:
              "CAPEX OPEX budget forecast reporting business case ROI IT portfolio finance transformation Excel Anaplan",
            seniority: "3 ans",
            note: "Note conservée de V1",
            url: "https://example.com/jobwatch-test",
          },
        ]),
      ),
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Importer mes candidatures" })
      .click();
    await page.getByText("Import terminé : 1 nouvelle(s) offre(s).").waitFor();
    await page
      .getByRole("button", {
        name: "Voir Contrôleur de gestion IT chez Entreprise de test",
      })
      .click();
    await page
      .getByLabel("Notes et prochaines actions")
      .fill("Candidature vérifiée sur navigateur");
    await page
      .getByLabel("Étape", { exact: true })
      .selectOption("Entretien RH");
    await page.getByLabel("Prochaine relance").fill("2026-09-29");
    await page
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await page.getByText("Candidature enregistrée.").waitFor();
    await page.reload();
    await page
      .getByRole("button", {
        name: "Voir Contrôleur de gestion IT chez Entreprise de test",
      })
      .click();
    assert.equal(
      await page.getByLabel("Notes et prochaines actions").inputValue(),
      "Candidature vérifiée sur navigateur",
    );
    assert.equal(
      await page.getByLabel("Étape", { exact: true }).inputValue(),
      "Entretien RH",
    );
    await page
      .getByRole("button", { name: "Importer mes candidatures" })
      .click();
    await page.getByText("Import terminé : 0 nouvelle(s) offre(s).").waitFor();
    assert.equal(await page.locator("article.job").count(), 1);
    console.log("✓ Import V1 idempotent, notes, étapes, dates et rechargement");
    await page.getByRole("button", { name: "+ Ajouter une offre" }).click();
    await page
      .getByRole("dialog")
      .getByLabel("Entreprise", { exact: true })
      .fill("Autre entreprise de test");
    await page
      .getByRole("dialog")
      .getByLabel("Poste", { exact: true })
      .fill("FP&A Analyst");
    await page
      .getByRole("dialog")
      .getByLabel("Localisation", { exact: true })
      .fill("Paris");
    await page
      .getByRole("dialog")
      .getByLabel("Contrat", { exact: true })
      .selectOption("CDI");
    await page
      .getByRole("dialog")
      .getByLabel("Description", { exact: true })
      .fill("Budget forecast reporting Excel");
    await page.getByRole("button", { name: "Analyser et ajouter" }).click();
    await page.getByText("Offre enregistrée.").waitFor();
    assert.equal(await page.locator("article.job").count(), 2);
    await page
      .getByLabel("Rechercher", { exact: true })
      .fill("Autre entreprise");
    assert.equal(await page.locator("article.job").count(), 1);
    await page.getByLabel("Rechercher", { exact: true }).fill("");
    await page.getByRole("button", { name: "Mon profil", exact: true }).click();
    await page.getByLabel("Seuil des alertes").fill("80");
    await page.getByRole("button", { name: "Enregistrer mon profil" }).click();
    await page.getByText(/Profil enregistré et scores recalculés/).waitFor();
    await page
      .getByRole("button", { name: "Offres pertinentes", exact: true })
      .click();
    await page.getByText("Match ≥ 80/100").waitFor();
    const exported = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exporter", exact: true }).click();
    const file = await exported;
    await file.saveAs("test-results/export.json");
    assert.equal(
      JSON.parse(await readFile("test-results/export.json", "utf8")).length,
      2,
    );
    await page.screenshot({
      path: "test-results/dashboard-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: "test-results/dashboard-mobile.png",
      fullPage: true,
    });
    console.log("✓ Ajout, filtres, profil, export et largeur mobile");
    const other = await browser.newContext();
    const another = await other.newPage();
    await another.goto(base);
    await another.getByLabel("Mot de passe").fill(password);
    await another.getByRole("button", { name: "Ouvrir mon espace" }).click();
    await another
      .getByRole("button", {
        name: "Voir Contrôleur de gestion IT chez Entreprise de test",
      })
      .click();
    assert.equal(
      await another.getByLabel("Notes et prochaines actions").inputValue(),
      "Candidature vérifiée sur navigateur",
    );
    await page
      .getByRole("button", { name: "Déconnexion", exact: true })
      .click();
    await page.getByLabel("Mot de passe").waitFor();
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log("✓ Second navigateur, déconnexion, aucune erreur JavaScript");
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (app) {
    app.kill("SIGTERM");
    await new Promise((resolve) => {
      app.once("exit", resolve);
      setTimeout(resolve, 5000);
    });
  }
  if (server) {
    await server.stop();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await db.close();
  await writeFile("test-results/server.log", logs);
}
