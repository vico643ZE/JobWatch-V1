import assert from "node:assert/strict";
const base = process.argv[2] || process.env.APP_URL;
if (!base) {
  console.error(
    "Usage : npm run verify:production -- https://votre-site.onrender.com",
  );
  process.exit(1);
}
const origin = new URL(base).origin;
const request = (path, options = {}) =>
  fetch(origin + path, {
    redirect: "error",
    signal: AbortSignal.timeout(90000),
    ...options,
  });
try {
  const health = await request("/api/health");
  assert.equal(health.status, 200, "Santé de la V2 : HTTP 200 requis");
  assert.equal((await health.json()).version, "2.0.0");
  console.log("✓ V2 active et base accessible");
  const page = await request("/");
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes("Mot de passe"), "Connexion privée attendue");
  assert.ok(!html.includes("215 M€"));
  console.log("✓ Page de connexion privée");
  const unauthorized = await request("/api/dashboard");
  assert.equal(unauthorized.status, 401);
  console.log("✓ Données interdites sans session");
  const csrf = await request("/api/collect", {
    method: "POST",
    headers: { Origin: "https://invalid.example" },
  });
  assert.equal(csrf.status, 403);
  console.log("✓ Requête externe refusée");
  if (process.env.JOBWATCH_TEST_PASSWORD) {
    const login = await request("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ password: process.env.JOBWATCH_TEST_PASSWORD }),
    });
    assert.equal(login.status, 200, "Connexion refusée");
    const cookie = login.headers.get("set-cookie");
    assert.ok(cookie?.includes("HttpOnly"));
    if (origin.startsWith("https:")) assert.ok(cookie.includes("Secure"));
    const dashboard = await request("/api/dashboard", {
      headers: { Cookie: cookie.split(";")[0] },
    });
    assert.equal(dashboard.status, 200);
    const data = await dashboard.json();
    assert.ok(Array.isArray(data.jobs));
    console.log(
      `✓ Espace authentifié : ${data.jobs.length} offres, ${data.runs.length} collectes récentes`,
    );
    console.log(
      data.runs[0]
        ? `Dernière collecte : ${data.runs[0].status}`
        : "À vérifier : aucune collecte encore exécutée.",
    );
  } else
    console.log(
      "Connexion authentifiée non testée : JOBWATCH_TEST_PASSWORD non fourni.",
    );
  console.log("Vérifications terminées. Aucune offre ni candidature modifiée.");
} catch (error) {
  console.error("ÉCHEC :", error.message);
  process.exitCode = 1;
}
