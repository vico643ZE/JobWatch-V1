export const STATUSES = [
  "Nouvelles offres",
  "À analyser",
  "À préparer",
  "Prête",
  "Envoyée",
  "Relance",
  "Entretien RH",
  "Entretien Manager",
  "Case Study / Final",
  "Offre",
  "Refus",
  "Abandonnée",
];
export const DEFAULT_PROFILE = {
  tags: [
    "CAPEX",
    "OPEX",
    "budget",
    "forecast",
    "atterrissage",
    "reporting",
    "KPI",
    "business partnering",
    "business case",
    "ROI",
    "IT",
    "SI",
    "DSI",
    "ERP",
    "EPM",
    "portfolio",
    "LPM",
    "PMO",
    "finance transformation",
    "performance management",
    "process improvement",
    "digital transformation",
  ],
  tools: [
    "Excel",
    "PowerPoint",
    "Jira",
    "Clarity",
    "Qlik Sense",
    "Anaplan",
    "n8n",
    "Dust",
  ],
  targetTitles: [
    "Contrôleur de gestion IT",
    "Contrôleur de gestion SI",
    "IT Financial Controller",
    "IT Controller",
    "Contrôleur financier DSI",
    "Finance Business Partner IT",
    "IT Finance Business Partner",
    "FP&A IT",
    "IT FP&A Analyst",
    "Contrôleur de gestion projet IT",
    "Contrôleur de gestion projet SI",
    "Project Financial Controller IT",
  ],
  secondaryTitles: [
    "FP&A Analyst",
    "Financial Planning Analyst",
    "Business Controller",
    "Finance Business Partner",
    "Finance Transformation Analyst",
    "Performance Management Analyst",
    "PMO Finance",
    "PMO financier",
    "IT Portfolio Analyst",
    "Portfolio Management Analyst",
    "EPM Analyst",
    "Business Analyst Finance",
    "ERP Finance Analyst",
  ],
  locations: ["Paris", "Île-de-France"],
  countries: ["fr"],
  preferredContract: "CDI",
  minExperience: 2,
  maxExperience: 5,
  maxAgeDays: 60,
  minScore: 40,
  alertThreshold: 75,
  excludedContracts: ["Stage", "Alternance"],
  alertsEnabled: false,
  boards: ["SopraSteria1"],
};
export function validateProfile(input) {
  if (!input || typeof input !== "object") throw new Error("Profil invalide.");
  const result = structuredClone(DEFAULT_PROFILE);
  for (const key of [
    "tags",
    "tools",
    "targetTitles",
    "secondaryTitles",
    "locations",
    "countries",
    "excludedContracts",
    "boards",
  ]) {
    if (
      !Array.isArray(input[key]) ||
      input[key].length > (key === "boards" ? 10 : 100) ||
      input[key].some(
        (x) => typeof x !== "string" || !x.trim() || x.length > 150,
      )
    )
      throw new Error(`Champ invalide : ${key}`);
    result[key] = [...new Set(input[key].map((x) => x.trim()))];
  }
  if (
    !result.boards.length ||
    result.boards.some((x) => !/^[a-zA-Z0-9_-]{1,100}$/.test(x))
  )
    throw new Error(
      "Indiquez au moins un identifiant entreprise SmartRecruiters valide.",
    );
  if (result.countries.some((x) => !/^[a-z]{2}$/.test(x)))
    throw new Error("Pays : code à deux lettres minuscules, par exemple fr.");
  for (const [key, min, max] of [
    ["minExperience", 0, 50],
    ["maxExperience", 0, 50],
    ["maxAgeDays", 1, 365],
    ["minScore", 0, 100],
    ["alertThreshold", 0, 100],
  ]) {
    if (!Number.isInteger(input[key]) || input[key] < min || input[key] > max)
      throw new Error(`Valeur invalide : ${key}`);
    result[key] = input[key];
  }
  if (result.maxExperience < result.minExperience)
    throw new Error("La séniorité maximale doit dépasser la minimale.");
  if (!["CDI", "CDD", "Freelance", "Tous"].includes(input.preferredContract))
    throw new Error("Contrat préféré invalide.");
  result.preferredContract = input.preferredContract;
  result.alertsEnabled = input.alertsEnabled === true;
  return result;
}
