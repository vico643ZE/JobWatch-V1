import test from "node:test";
import assert from "node:assert/strict";
import {
  scoreJob,
  parseSeniority,
  extractSeniority,
  filterReason,
  locationMatches,
} from "../lib/matching.mjs";
import { DEFAULT_PROFILE, validateProfile } from "../lib/profile.mjs";
import {
  normalizedJob,
  canonicalUrl,
  fingerprint,
  contractType,
} from "../lib/normalize.mjs";
import { manualJob } from "../lib/validation.mjs";
const relevant = normalizedJob({
  company: "Entreprise",
  title: "Contrôleur de gestion IT",
  location: "Courbevoie",
  region: "IDF",
  country: "fr",
  contract_type: "CDI",
  seniority: "3 à 5 ans",
  description:
    "CAPEX OPEX budget forecast reporting KPI business case ROI portfolio finance transformation Excel Anaplan DSI",
});
test("un métier sans rapport ne reçoit aucun bonus IT/SI par sous-chaîne", () => {
  for (const title of ["Visiteur", "Boulanger"]) {
    const r = scoreJob({ title });
    assert.equal(r.match_score, 0);
    assert.equal(
      r.score_breakdown.find((x) => x.label === "Dimension IT").points,
      0,
    );
  }
});
test("une offre finance IT complète obtient un score expliqué sur 100", () => {
  const r = scoreJob(relevant);
  assert.equal(r.match_score, 100);
  assert.equal(
    r.score_breakdown.reduce((n, x) => n + x.points, 0),
    100,
  );
});
test("mois, intervalles et pénalité senior", () => {
  assert.deepEqual(parseSeniority("18 mois"), {
    seniority_min: 1.5,
    seniority_max: 1.5,
  });
  assert.deepEqual(parseSeniority("3–5 ans"), {
    seniority_min: 3,
    seniority_max: 5,
  });
  assert.deepEqual(parseSeniority("6 to 10 years"), {
    seniority_min: 6,
    seniority_max: 10,
  });
  assert.equal(
    extractSeniority("Entreprise fondée en 1990. Vous avez 9 ans d’expérience.")
      .seniority_min,
    9,
  );
  const senior = scoreJob({ ...relevant, seniority_min: 9 });
  assert.equal(senior.match_score, 72);
  assert.ok(senior.match_gaps.some((x) => x.includes("9 ans")));
  assert.equal(scoreJob({ ...relevant, seniority_min: 1.5 }).match_score, 100);
});
test("Power BI ne devient pas une compétence via Qlik Sense", () => {
  const r = scoreJob({ ...relevant, description: "Power BI" });
  assert.ok(r.match_gaps.some((x) => x.includes("Power BI")));
  assert.equal(r.score_breakdown.find((x) => x.label === "Outils").points, 0);
});
test("filtrage pays, zone, date et contrat sans supprimer pour séniorité", () => {
  assert.equal(filterReason({ ...relevant, seniority_min: 10 }), null);
  assert.equal(filterReason({ ...relevant, country: "de" }), "Pays hors cible");
  assert.equal(
    filterReason({ ...relevant, location: "Lyon", region: "ARA" }),
    "Localisation hors cible",
  );
  assert.equal(
    filterReason({ ...relevant, contract_type: "Stage" }),
    "Contrat exclu",
  );
  assert.equal(
    filterReason({ ...relevant, published_at: "2020-01-01" }),
    "Offre trop ancienne",
  );
  assert.ok(
    locationMatches(
      { ...relevant, location: "Ville", region: "", postal_code: "92100" },
      DEFAULT_PROFILE,
    ),
  );
});
test("URL canonique conserve les identifiants, retire les trackers et refuse javascript", () => {
  assert.equal(
    canonicalUrl("https://example.com/job?id=12&utm_source=a#x"),
    "https://example.com/job?id=12",
  );
  assert.notEqual(
    canonicalUrl("https://example.com/?id=1"),
    canonicalUrl("https://example.com/?id=2"),
  );
  assert.equal(canonicalUrl("javascript:alert(1)"), null);
  assert.throws(() =>
    manualJob({ company: "A", title: "B", url: "javascript:alert(1)" }),
  );
});
test("empreinte normalise accents et casse mais distingue les localisations", () => {
  assert.equal(
    fingerprint({ company: "ACMÉ", title: "Contrôleur IT", location: "Paris" }),
    fingerprint({ company: "acme", title: "controleur IT", location: "Paris" }),
  );
  assert.notEqual(
    fingerprint({ ...relevant, location: "Lyon" }),
    fingerprint(relevant),
  );
});
test("contrat explicite prime sur temps plein et validation profil stricte", () => {
  assert.equal(contractType("Full-time"), "Non précisé");
  assert.equal(contractType("Réceptionniste CDD Permanent"), "CDD");
  assert.throws(() =>
    validateProfile({ ...DEFAULT_PROFILE, boards: ["https://evil.test"] }),
  );
  assert.throws(() => validateProfile({ ...DEFAULT_PROFILE, minScore: 101 }));
  assert.deepEqual(validateProfile(DEFAULT_PROFILE), DEFAULT_PROFILE);
});
test("import conserve statut V1 et ne réutilise pas son ancien score", () => {
  const { job, status } = manualJob(
    {
      id: 1,
      title: "A",
      company: "B",
      date: "2026-01-01",
      status: "Case Study/Final",
      score: 96,
    },
    true,
  );
  assert.equal(status, "Case Study / Final");
  assert.equal(job.source, "Import V1");
  assert.equal(job.match_score, undefined);
  assert.equal(job.published_at, "2026-01-01T00:00:00.000Z");
});
test("développeur finance de marché reste hors cible", () => {
  assert.equal(
    scoreJob({ ...relevant, title: "Développeur C# finance de marché" })
      .match_score,
    0,
  );
});
test("les tags personnalisés donnent des points limités et expliqués", () => {
  const j = {
    title: "FP&A Analyst",
    description: "Consolidation internationale",
    location: "Paris",
  };
  const before = scoreJob(j);
  const after = scoreJob(j, {
    ...DEFAULT_PROFILE,
    tags: [...DEFAULT_PROFILE.tags, "consolidation internationale"],
  });
  assert.ok(after.match_score > before.match_score);
  assert.ok(
    after.match_reasons.some((x) => x.includes("consolidation internationale")),
  );
});
