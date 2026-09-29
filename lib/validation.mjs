import { normalizedJob } from "./normalize.mjs";
import { STATUSES } from "./profile.mjs";
export function manualJob(input, importing = false) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Offre invalide.");
  for (const key of [
    "company",
    "title",
    "location",
    "country",
    "description",
    "url",
    "seniority",
    "contract_type",
    "note",
    "published_at",
    "date",
  ]) {
    if (
      input[key] != null &&
      (typeof input[key] !== "string" ||
        input[key].length >
          (key === "description" ? 60000 : key === "note" ? 10000 : 2000))
    )
      throw new Error(`Champ invalide : ${key}`);
  }
  let status = input.status || "À analyser";
  if (status === "Case Study/Final") status = "Case Study / Final";
  if (!STATUSES.includes(status)) throw new Error("Statut inconnu.");
  return {
    job: normalizedJob({
      ...input,
      seniority_min: null,
      seniority_max: null,
      published_at: input.published_at || input.date,
      source: importing ? "Import V1" : "Manuel",
      source_company_id: "",
      external_id:
        importing && input.id != null ? String(input.id).slice(0, 100) : "",
    }),
    status,
    note: input.note || "",
  };
}
export async function bodyJson(request, limit = 512000) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Requête vide.");
  const chunks = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error("Import trop volumineux (maximum 500 Ko par lot).");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("JSON invalide.");
  }
}
