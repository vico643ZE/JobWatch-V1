import { createHash } from "node:crypto";
import {
  normalizeText,
  extractSeniority,
  parseSeniority,
} from "./matching.mjs";
export function plainText(html = "") {
  return String(html)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) =>
      Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : "",
    )
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, 60000);
}
export function canonicalUrl(value) {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
      return null;
    u.hash = "";
    for (const key of [...u.searchParams.keys()])
      if (/^utm_|^(source|ref|tracking|trk|gh_src)$/i.test(key))
        u.searchParams.delete(key);
    u.searchParams.sort();
    u.pathname = u.pathname.replace(/\/$/, "") || "/";
    return u.toString();
  } catch {
    return null;
  }
}
export function fingerprint(job) {
  const parts = [job.company, job.title, job.location].map(normalizeText);
  return createHash("sha256").update(parts.join("|")).digest("hex");
}
export function contractType(value = "") {
  const t = normalizeText(value);
  if (/\b(stage|intern|internship)\b/.test(t)) return "Stage";
  if (/\b(alternance|apprenticeship|apprentice)\b/.test(t)) return "Alternance";
  if (/\b(cdd|temporary|fixed term)\b/.test(t)) return "CDD";
  if (/\b(freelance|contractor)\b/.test(t)) return "Freelance";
  if (/\b(cdi|permanent|regular)\b/.test(t)) return "CDI";
  return "Non précisé";
}
export function normalizedJob(input) {
  const clean = {};
  for (const key of [
    "company",
    "title",
    "location",
    "country",
    "region",
    "postal_code",
    "description",
    "source",
    "source_company_id",
    "external_id",
    "remote_policy",
  ])
    clean[key] = plainText(input[key] || "");
  if (!clean.company || !clean.title)
    throw new Error("Entreprise et poste obligatoires.");
  clean.country = clean.country.toLowerCase();
  clean.url = canonicalUrl(input.url);
  if (input.url && !clean.url)
    throw new Error("Lien invalide : utilisez une URL HTTP ou HTTPS.");
  clean.contract_type = [
    "CDI",
    "CDD",
    "Freelance",
    "Stage",
    "Alternance",
  ].includes(input.contract_type)
    ? input.contract_type
    : "Non précisé";
  clean.published_at =
    input.published_at && !Number.isNaN(Date.parse(input.published_at))
      ? new Date(input.published_at).toISOString()
      : null;
  const seniority = input.seniority
    ? parseSeniority(input.seniority)
    : extractSeniority(clean.description);
  clean.seniority_min = input.seniority_min ?? seniority.seniority_min;
  clean.seniority_max = input.seniority_max ?? seniority.seniority_max;
  clean.fingerprint = fingerprint(clean);
  return clean;
}
