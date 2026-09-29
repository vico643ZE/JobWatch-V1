import test from "node:test";
import assert from "node:assert/strict";
import {
  collectBoard,
  normalizePosting,
} from "../lib/collectors/smartrecruiters.mjs";
import { DEFAULT_PROFILE } from "../lib/profile.mjs";
const post = {
  id: "1",
  name: "Contrôleur de gestion IT",
  company: { name: "Acme" },
  location: { city: "Paris", country: "fr" },
  visibility: "PUBLIC",
  releasedDate: new Date().toISOString(),
  typeOfEmployment: { id: "permanent" },
};
const detail = {
  ...post,
  jobAd: {
    sections: {
      jobDescription: { text: "<p>Budget CAPEX</p>" },
      qualifications: { text: "<p>3 ans d’expérience</p>" },
    },
  },
};
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
test("collecte paginée inclut les IDs hors cible pour éviter les fausses clôtures", async () => {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    if (url.includes("offset=0"))
      return response({
        totalFound: 101,
        content: [
          post,
          ...Array.from({ length: 99 }, (_, i) => ({
            ...post,
            id: String(i + 2),
            name: "Boulanger",
          })),
        ],
      });
    if (url.includes("offset=100"))
      return response({
        totalFound: 101,
        content: [{ ...post, id: "101", name: "Boulanger" }],
      });
    return response(detail);
  };
  const result = await collectBoard("Acme", DEFAULT_PROFILE, {
    fetcher,
    pace: 0,
  });
  assert.equal(result.scanned, 101);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].seniority_min, 3);
  assert.equal(result.complete, true);
  assert.equal(calls.length, 3);
});
test("échec détail : snapshot incomplet, pas de clôture possible", async () => {
  const result = await collectBoard("Acme", DEFAULT_PROFILE, {
    pace: 0,
    fetcher: async (url) =>
      url.includes("?")
        ? response({ totalFound: 1, content: [post] })
        : response({}, 403),
  });
  assert.equal(result.complete, false);
  assert.ok(result.errors.length);
});
test("pagination tronquée et limite de détails sont signalées", async () => {
  const result = await collectBoard("Acme", DEFAULT_PROFILE, {
    pace: 0,
    maxPages: 1,
    fetcher: async (url) =>
      url.includes("?")
        ? response({ totalFound: 101, content: [post] })
        : response(detail),
  });
  assert.equal(result.complete, false);
});
test("ne transforme pas Full-time en CDI si CDD explicite", () => {
  assert.equal(
    normalizePosting({ ...detail, name: "Contrôleur de gestion CDD" }, "Acme")
      .contract_type,
    "CDD",
  );
});
test("entreprise inconnue ou source vide : avertissement, pas de snapshot vide validé", async () => {
  await assert.rejects(
    () =>
      collectBoard("Missing", DEFAULT_PROFILE, {
        pace: 0,
        fetcher: async () => response({ totalFound: 0, content: [] }),
      }),
    /Aucune annonce/,
  );
});
