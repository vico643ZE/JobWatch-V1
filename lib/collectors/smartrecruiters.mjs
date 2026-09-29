import { fetchJson, delay } from "../http.mjs";
import { plainText, normalizedJob, contractType } from "../normalize.mjs";
import { relevantTitle, filterReason } from "../matching.mjs";
const base = "https://api.smartrecruiters.com/v1/companies/";
export function normalizePosting(post, board) {
  const sections = post.jobAd?.sections || {};
  const description = Object.values(sections)
    .map((s) => plainText(s.text || ""))
    .join("\n\n");
  const custom = post.customField || [];
  const contract = custom
    .filter((x) => /contract|job type/i.test(x.fieldLabel))
    .map((x) => x.valueLabel)
    .join(" ");
  const explicit = contractType(`${post.name} ${contract}`);
  return normalizedJob({
    company: post.company?.name || board,
    title: post.name,
    location: post.location?.city || "",
    region: post.location?.region || "",
    postal_code: post.location?.postalCode || "",
    country: post.location?.country || "",
    description,
    source: "SmartRecruiters",
    source_company_id: board,
    external_id: String(post.id),
    url:
      post.applyUrl ||
      `https://jobs.smartrecruiters.com/${encodeURIComponent(board)}/${encodeURIComponent(post.id)}`,
    contract_type:
      explicit !== "Non précisé"
        ? explicit
        : contractType(post.typeOfEmployment?.id),
    remote_policy: post.location?.remote
      ? "Télétravail"
      : post.location?.hybrid
        ? "Hybride"
        : "Non précisé",
    published_at: post.releasedDate,
    seniority: custom.find((x) => /experience expected/i.test(x.fieldLabel))
      ?.valueLabel,
  });
}
// Provider contract: full ID snapshot + normalized jobs. Never returns a partial snapshot as complete.
export async function collectBoard(
  board,
  profile,
  {
    fetcher,
    pace = 250,
    maxPages = 100,
    maxDetails = 250,
    deadline = Date.now() + 480000,
  } = {},
) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(board))
    throw new Error("Identifiant source invalide");
  const seen = new Set(),
    jobs = [],
    errors = [];
  let scanned = 0,
    details = 0,
    total = 0,
    complete = false;
  for (let page = 0; page < maxPages; page++) {
    if (Date.now() > deadline)
      throw new Error("Durée maximale de collecte atteinte");
    const data = await fetchJson(
      `${base}${board}/postings?limit=100&offset=${page * 100}`,
      { fetcher },
    );
    if (!Array.isArray(data.content) || !Number.isInteger(data.totalFound))
      throw new Error("Réponse de liste invalide");
    total = data.totalFound;
    if (page === 0 && total === 0)
      throw new Error(
        "Aucune annonce renvoyée : identifiant entreprise à vérifier ou source vide. Aucune clôture appliquée.",
      );
    for (const post of data.content) {
      if (!post.id || (post.visibility && post.visibility !== "PUBLIC"))
        continue;
      if (seen.has(String(post.id))) continue;
      seen.add(String(post.id));
      scanned++;
      const light = normalizePosting(post, board);
      if (!relevantTitle(light.title, profile) || filterReason(light, profile))
        continue;
      if (details >= maxDetails || Date.now() > deadline) {
        errors.push("Limite de détails atteinte ; collecte partielle");
        break;
      }
      details++;
      await delay(pace);
      try {
        const detail = await fetchJson(
          `${base}${board}/postings/${encodeURIComponent(post.id)}`,
          { fetcher },
        );
        if (String(detail.id) !== String(post.id) || !detail.jobAd?.sections)
          throw new Error("Détail source invalide");
        if (detail.visibility && detail.visibility !== "PUBLIC") continue;
        jobs.push(normalizePosting(detail, board));
      } catch (e) {
        if (e.status === 404) {
          seen.delete(String(post.id));
          continue;
        }
        errors.push(`Détail ${post.id} : ${e.message}`);
      }
    }
    if ((page + 1) * 100 >= total) {
      complete = true;
      break;
    }
    if (!data.content.length) throw new Error("Pagination interrompue");
    if (errors.some((e) => e.startsWith("Limite"))) break;
    await delay(pace);
  }
  if (!complete)
    errors.push("Pagination incomplète : aucune clôture automatique");
  return {
    board,
    seen: [...seen],
    jobs,
    scanned,
    details,
    total,
    complete: complete && !errors.length,
    errors,
  };
}
