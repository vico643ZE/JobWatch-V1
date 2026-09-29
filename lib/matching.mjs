import { DEFAULT_PROFILE } from "./profile.mjs";
export const normalizeText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9&]+/g, " ")
    .trim();
export const hasTerm = (text, term) =>
  ` ${normalizeText(text)} `.includes(` ${normalizeText(term)} `);
const any = (text, terms) => terms.some((term) => hasTerm(text, term));
export function parseSeniority(text = "") {
  const value = normalizeText(text);
  const ranges = [
    ...value.matchAll(
      /\b(\d{1,2})(?:\s+(?:a|to)\s+(\d{1,2})|\s+(\d{1,2}))?\s*(ans?|years?|mois|months?)\b/g,
    ),
  ];
  if (!ranges.length) return { seniority_min: null, seniority_max: null };
  const m = ranges[0],
    factor = /mois|month/.test(m[4]) ? 12 : 1;
  return {
    seniority_min: Number(m[1]) / factor,
    seniority_max: Number(m[2] || m[3] || m[1]) / factor,
  };
}
export function extractSeniority(description = "") {
  const sentences = description
    .split(/[.!?\n]/)
    .filter((s) => /expérience|experience/i.test(s));
  for (const sentence of sentences) {
    const found = parseSeniority(sentence);
    if (found.seniority_min !== null) return found;
  }
  return { seniority_min: null, seniority_max: null };
}
const IDF = [
  "paris",
  "ile de france",
  "idf",
  "la defense",
  "puteaux",
  "courbevoie",
  "neuilly sur seine",
  "levallois perret",
  "issy les moulineaux",
  "boulogne billancourt",
  "saint denis",
  "saint ouen",
  "nanterre",
  "montreuil",
  "massy",
  "versailles",
  "velizy villacoublay",
  "colombes",
  "clichy",
  "suresnes",
  "rueil malmaison",
  "fontenay sous bois",
  "charenton le pont",
  "guyancourt",
];
export function locationMatches(job, profile) {
  const text = `${job.location || ""} ${job.region || ""}`;
  return (
    !profile.locations.length ||
    profile.locations.some(
      (place) =>
        hasTerm(text, place) ||
        (normalizeText(place) === "ile de france" &&
          (any(text, IDF) ||
            /^(75|77|78|91|92|93|94|95)\d{3}$/.test(job.postal_code || ""))),
    )
  );
}
export function filterReason(job, profile = DEFAULT_PROFILE, now = new Date()) {
  if (
    profile.countries.length &&
    job.country &&
    !profile.countries.includes(job.country.toLowerCase())
  )
    return "Pays hors cible";
  if (job.location && !locationMatches(job, profile))
    return "Localisation hors cible";
  if (profile.excludedContracts.includes(job.contract_type))
    return "Contrat exclu";
  if (
    job.published_at &&
    (now - new Date(job.published_at)) / 86400000 > profile.maxAgeDays
  )
    return "Offre trop ancienne";
  return null;
}
export function excludedOccupation(title, profile = DEFAULT_PROFILE) {
  return (
    !any(title, [...profile.targetTitles, ...profile.secondaryTitles]) &&
    any(title, [
      "developpeur",
      "developpeuse",
      "developer",
      "software engineer",
      "architecte",
      "cloud engineer",
      "data scientist",
      "ingenieur systeme",
      "administrateur systeme",
      "recruteur",
    ])
  );
}
export function relevantTitle(title, profile = DEFAULT_PROFILE) {
  if (excludedOccupation(title, profile)) return false;
  return any(title, [
    ...profile.targetTitles,
    ...profile.secondaryTitles,
    "finance",
    "financial",
    "financier",
    "financiere",
    "controleur",
    "controle de gestion",
    "controlling",
    "controller",
    "fp&a",
    "pmo",
    "portfolio",
    "portefeuille",
    "epm",
    "anaplan",
    "business analyst",
    "transformation",
  ]);
}
export function scoreJob(job, profile = DEFAULT_PROFILE) {
  if (excludedOccupation(job.title, profile))
    return {
      match_score: 0,
      match_reasons: [],
      match_gaps: [
        "Métier principalement technique ou hors des cibles déclarées",
      ],
      score_breakdown: [{ label: "Métier hors cible", points: 0, max: 100 }],
      category: "Autre",
    };
  const text = `${job.title || ""} ${job.description || ""}`;
  const reasons = [],
    gaps = [],
    breakdown = [];
  const add = (label, points, max, detail) => {
    breakdown.push({ label, points, max });
    if (points > 0 && detail) reasons.push(detail);
  };
  const primary = any(job.title, profile.targetTitles),
    secondary = any(job.title, profile.secondaryTitles);
  const finance = any(job.title, [
    "finance",
    "financial",
    "financier",
    "financiere",
    "controleur de gestion",
    "controle de gestion",
    "controller",
    "controlling",
    "fp&a",
  ]);
  const family = primary
    ? 25
    : secondary
      ? 20
      : finance
        ? 15
        : relevantTitle(job.title, profile)
          ? 8
          : 0;
  add(
    "Métier",
    family,
    25,
    primary
      ? "Intitulé prioritaire"
      : secondary
        ? "Intitulé cible"
        : family
          ? "Famille métier proche"
          : null,
  );
  if (!family) gaps.push("Intitulé hors des métiers cibles");
  const tagGroup = (label, groups, max) => {
    const hits = groups.filter(
      (group) =>
        group.some((tag) =>
          profile.tags.some((p) => hasTerm(tag, p) || hasTerm(p, tag)),
        ) && any(text, group),
    );
    add(
      label,
      Math.round((max * hits.length) / groups.length),
      max,
      hits.length
        ? hits.map((g) => g.find((t) => hasTerm(text, t))).join(" · ")
        : null,
    );
  };
  tagGroup(
    "Finance",
    [
      ["capex", "opex"],
      ["budget", "budgetaire", "budgeting"],
      ["forecast", "previsions", "atterrissage", "variance analysis", "ecarts"],
      ["reporting", "kpi", "performance management"],
      ["business case", "roi", "business partnering"],
    ],
    20,
  );
  tagGroup(
    "Dimension IT",
    [["it", "si", "dsi", "information technology", "systemes d information"]],
    15,
  );
  tagGroup(
    "Projets et transformation",
    [
      ["portfolio", "portefeuille", "lpm", "pmo"],
      [
        "finance transformation",
        "transformation finance",
        "process improvement",
        "digital transformation",
        "transformation digitale",
      ],
    ],
    10,
  );
  // Additional user-defined tags can fill unused project/transferable-skill points,
  // while keeping the same 100-point ceiling and showing the actual matched terms.
  const knownTags = [
    "capex",
    "opex",
    "budget",
    "budgetaire",
    "budgeting",
    "forecast",
    "previsions",
    "atterrissage",
    "variance analysis",
    "ecarts",
    "reporting",
    "kpi",
    "performance management",
    "business case",
    "roi",
    "business partnering",
    "it",
    "si",
    "dsi",
    "information technology",
    "systemes d information",
    "portfolio",
    "portefeuille",
    "lpm",
    "pmo",
    "finance transformation",
    "transformation finance",
    "process improvement",
    "digital transformation",
    "transformation digitale",
  ];
  const customHits = profile.tags.filter(
    (tag) => !knownTags.includes(normalizeText(tag)) && hasTerm(text, tag),
  );
  if (customHits.length) {
    const group = breakdown.find(
      (x) => x.label === "Projets et transformation",
    );
    group.points = Math.min(
      group.max,
      group.points + Math.min(5, customHits.length * 2),
    );
    reasons.push(`Tags du profil : ${customHits.join(", ")}`);
  }
  const toolHits = profile.tools.filter((tool) => hasTerm(text, tool));
  add(
    "Outils",
    Math.min(5, toolHits.length * 2.5),
    5,
    toolHits.length ? `Outils du profil : ${toolHits.join(", ")}` : null,
  );
  for (const tool of [
    "Power BI",
    "SAP",
    "Oracle",
    "Tableau",
    "SQL",
    "Python",
    "IFRS",
  ])
    if (
      hasTerm(text, tool) &&
      !profile.tools.some((t) => normalizeText(t) === normalizeText(tool)) &&
      !profile.tags.some((t) => normalizeText(t) === normalizeText(tool))
    )
      gaps.push(`${tool} mentionné : non déclaré dans votre profil`);
  add(
    "Localisation",
    job.location && locationMatches(job, profile) ? 10 : 0,
    10,
    job.location && locationMatches(job, profile) ? "Localisation cible" : null,
  );
  if (!job.location) gaps.push("Localisation non précisée");
  add(
    "Contrat",
    job.contract_type !== "Non précisé" &&
      (profile.preferredContract === "Tous" ||
        job.contract_type === profile.preferredContract)
      ? 5
      : 0,
    5,
    job.contract_type === profile.preferredContract ? "Contrat préféré" : null,
  );
  if (!job.contract_type || job.contract_type === "Non précisé")
    gaps.push("Contrat à vérifier");
  const years = job.seniority_min ?? null;
  let senior =
    years === null
      ? 0
      : years <= profile.maxExperience
        ? 10
        : years <= profile.maxExperience + 2
          ? 4
          : 0;
  add(
    "Séniorité",
    senior,
    10,
    senior === 10 ? "Expérience demandée compatible" : null,
  );
  if (years === null) gaps.push("Expérience demandée non précisée");
  if (years !== null && years > profile.maxExperience)
    gaps.push(
      `${years} ans minimum demandés (cible : ${profile.minExperience}–${profile.maxExperience} ans)`,
    );
  const leadership = any(job.title, [
    "directeur financier",
    "directrice financiere",
    "finance director",
    "chief financial officer",
    "head of finance",
    "senior manager",
  ]);
  if (leadership)
    gaps.push("Poste de direction ou management senior : niveau à vérifier");
  const penalty =
    (years !== null && years > profile.maxExperience + 2) || leadership
      ? 18
      : 0;
  if (penalty)
    breakdown.push({ label: "Écart de séniorité", points: -penalty, max: 0 });
  let score = Math.round(breakdown.reduce((a, b) => a + b.points, 0));
  if (!family && score > 20) {
    breakdown.push({
      label: "Plafond métier hors cible",
      points: 20 - score,
      max: 0,
    });
    score = 20;
  }
  const category = primary
    ? "Finance IT"
    : any(job.title, ["pmo", "projet", "project"])
      ? "Projet / PMO"
      : any(job.title, ["portfolio", "portefeuille"])
        ? "Portfolio"
        : any(job.title, ["erp", "epm", "anaplan"])
          ? "ERP / EPM"
          : any(job.title, ["transformation"])
            ? "Transformation"
            : family
              ? "Finance / FP&A"
              : "Autre";
  return {
    match_score: Math.max(0, Math.min(100, score)),
    match_reasons: reasons,
    match_gaps: gaps,
    score_breakdown: breakdown,
    category,
  };
}
