"use client";
import { useEffect, useState, useMemo } from "react";
import { STATUSES } from "../lib/profile.mjs";
const date = (value) =>
  value ? new Date(value).toLocaleDateString("fr-FR") : "Non précisée";
const day = (value) => (value ? String(value).slice(0, 10) : "");
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
async function api(path, method = "GET", body) {
  const response = await fetch(`/api/${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "Réponse interrompue. Actualisez pour vérifier le résultat.",
    );
  }
  if (!response.ok) {
    if (response.status === 401) location.reload();
    throw new Error(data.error || "Requête impossible.");
  }
  return data;
}
function download(name, value) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export default function Dashboard() {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [collecting, setCollecting] = useState(false),
    [tab, setTab] = useState("offres"),
    [selected, setSelected] = useState(null),
    [add, setAdd] = useState(false),
    [legacy, setLegacy] = useState(null);
  const [filters, setFilters] = useState({
    q: "",
    category: "",
    status: "",
    company: "",
    location: "",
    source: "",
    contract: "",
    score: 0,
    since: "",
    sort: "score",
    active: "all",
  });
  async function load() {
    const result = await api("dashboard");
    setData(result);
    return result;
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
    try {
      const saved = localStorage.getItem("jobwatch-jobs");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed)) throw new Error();
        setLegacy(parsed);
      }
    } catch {
      setError(
        "Les données locales V1 sont illisibles. Elles sont conservées ; exportez-les avant toute intervention.",
      );
    }
  }, []);
  useEffect(() => {
    if (!collecting && !data?.runs?.some((r) => r.status === "running")) return;
    const timer = setInterval(() => load().catch(() => {}), 10000);
    return () => clearInterval(timer);
  }, [collecting, data?.runs]);
  async function action(fn, success) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      await load();
      if (success) setMessage(success);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function collect() {
    setCollecting(true);
    setError("");
    setMessage("");
    try {
      const result = await api("collect", "POST", {});
      await load();
      setMessage(
        `${result.created} nouvelle(s) offre(s), ${result.updated} mise(s) à jour. ${result.status === "success" ? "Collecte terminée." : "Collecte incomplète : consultez le journal."}`,
      );
    } catch (e) {
      setError(
        e.message +
          " Le résultat reste consultable dans le journal de collecte.",
      );
    } finally {
      setCollecting(false);
    }
  }
  const jobs = data?.jobs || [];
  const filtered = useMemo(
    () =>
      jobs
        .filter(
          (j) =>
            (!filters.q ||
              `${j.title} ${j.company} ${j.description}`
                .toLowerCase()
                .includes(filters.q.toLowerCase())) &&
            (!filters.category || j.category === filters.category) &&
            (!filters.status || j.status === filters.status) &&
            (!filters.company || j.company === filters.company) &&
            (!filters.location || j.location === filters.location) &&
            (!filters.source ||
              j.sources.some((s) => s.source === filters.source)) &&
            (!filters.contract || j.contract_type === filters.contract) &&
            j.match_score >= Number(filters.score) &&
            (!filters.since ||
              (j.published_at &&
                j.published_at.slice(0, 10) >= filters.since)) &&
            (filters.active === "all" ||
              j.status_active === (filters.active === "active")) &&
            (tab !== "candidatures" || j.status !== "Nouvelles offres"),
        )
        .sort((a, b) =>
          filters.sort === "score"
            ? b.match_score - a.match_score
            : new Date(b.published_at || b.first_seen_at) -
              new Date(a.published_at || a.first_seen_at),
        ),
    [jobs, filters, tab],
  );
  const current = jobs.find((j) => j.id === selected),
    setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const last = data?.runs?.[0];
  const filterSelect = (key, label, values) => (
    <label key={key}>
      {label}
      <select
        value={filters[key]}
        onChange={(e) => setFilter(key, e.target.value)}
      >
        <option value="">Tous</option>
        {values.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  );
  return (
    <main>
      <header>
        <div>
          <div className="eyebrow">
            JOBWATCH · FINANCE × IT <span className="version">V2</span>
          </div>
          <h1>Opportunités</h1>
          <p>Votre veille et vos candidatures, au même endroit.</p>
        </div>
        <div className="actions">
          <button
            onClick={() =>
              action(() =>
                api("logout", "POST", {}).then(() => location.reload()),
              )
            }
          >
            Déconnexion
          </button>
          <button
            className="primary"
            disabled={busy || !data}
            onClick={() => setAdd(true)}
          >
            + Ajouter une offre
          </button>
        </div>
      </header>
      <nav aria-label="Navigation principale">
        {[
          ["offres", "Offres pertinentes"],
          ["candidatures", "Mes candidatures"],
          ["profil", "Mon profil"],
          ["collecte", "Collecte & alertes"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "tab active" : "tab"}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div aria-live="polite">
        {error && (
          <div className="notice error" role="alert">
            {error}{" "}
            <button
              onClick={() => {
                setError("");
                load().catch((e) => setError(e.message));
              }}
            >
              Actualiser
            </button>
          </div>
        )}
        {message && <div className="notice success">{message}</div>}
      </div>
      {!data ? (
        <div className="empty">
          {error
            ? "Les données ne sont pas disponibles."
            : "Chargement de votre espace…"}
        </div>
      ) : (
        <>
          {legacy?.length > 0 && (
            <div className="notice">
              <b>{legacy.length} offre(s) V1 présente(s) dans ce navigateur.</b>
              <p>
                Importez-les pour les retrouver sur vos autres appareils. Les
                données locales restent conservées. Un nouvel import ne recrée
                pas de doublons.
              </p>
              <div className="actions">
                <button
                  onClick={() =>
                    download("jobwatch-v1-sauvegarde.json", legacy)
                  }
                >
                  Sauvegarder la V1
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    action(async () => {
                      let count = 0;
                      for (let i = 0; i < legacy.length; i += 20) {
                        const r = await api("import", "POST", {
                          jobs: legacy.slice(i, i + 20),
                        });
                        count += r.created;
                      }
                      setLegacy(null);
                      setMessage(
                        `Import terminé : ${count} nouvelle(s) offre(s).`,
                      );
                    })
                  }
                >
                  Importer mes candidatures
                </button>
                <button onClick={() => setLegacy(null)}>Masquer</button>
              </div>
            </div>
          )}
          {(tab === "offres" || tab === "candidatures") && (
            <>
              <section className="stats">
                <Stat
                  label="Offres actives"
                  value={jobs.filter((j) => j.status_active).length}
                />
                <Stat
                  label={`Match ≥ ${data.profile.alertThreshold}/100`}
                  value={
                    jobs.filter(
                      (j) =>
                        j.status_active &&
                        j.match_score >= data.profile.alertThreshold,
                    ).length
                  }
                />
                <Stat
                  label="Entretiens en cours"
                  value={
                    jobs.filter((j) => /Entretien|Case Study/.test(j.status))
                      .length
                  }
                />
                <Stat
                  label="Relances à effectuer"
                  value={
                    jobs.filter(
                      (j) =>
                        j.follow_up_at &&
                        day(j.follow_up_at) <= today() &&
                        !["Refus", "Abandonnée", "Offre"].includes(j.status),
                    ).length
                  }
                />
              </section>
              <div className="coverage">
                <span>
                  <b>SmartRecruiters</b> · {data.profile.boards.length}{" "}
                  entreprise(s) configurée(s) · Dernière collecte :{" "}
                  {last ? date(last.started_at) : "pas encore lancée"}
                </span>
                <button
                  disabled={
                    collecting ||
                    busy ||
                    data.runs.some(
                      (r) =>
                        r.status === "running" &&
                        Date.now() - new Date(r.started_at) < 15 * 60000,
                    )
                  }
                  onClick={collect}
                >
                  {collecting ? "Collecte en cours…" : "Rechercher des offres"}
                </button>
              </div>
              <section className="filters">
                <label className="search">
                  Rechercher
                  <input
                    value={filters.q}
                    onChange={(e) => setFilter("q", e.target.value)}
                    placeholder="Poste, entreprise ou compétence…"
                  />
                </label>
                {filterSelect("status", "Candidature", STATUSES)}
                {filterSelect("category", "Métier", [
                  ...new Set(jobs.map((j) => j.category)),
                ])}
                {filterSelect(
                  "company",
                  "Entreprise",
                  [...new Set(jobs.map((j) => j.company))].sort(),
                )}
                {filterSelect(
                  "location",
                  "Localisation",
                  [
                    ...new Set(jobs.map((j) => j.location).filter(Boolean)),
                  ].sort(),
                )}
                {filterSelect("source", "Source", [
                  ...new Set(
                    jobs.flatMap((j) => j.sources.map((s) => s.source)),
                  ),
                ])}
                {filterSelect("contract", "Contrat", [
                  ...new Set(jobs.map((j) => j.contract_type)),
                ])}
                <label>
                  Score minimum
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={filters.score}
                    onChange={(e) => setFilter("score", e.target.value)}
                  />
                </label>
                <label>
                  Publiée depuis
                  <input
                    type="date"
                    value={filters.since}
                    onChange={(e) => setFilter("since", e.target.value)}
                  />
                </label>
                <label>
                  Publication
                  <select
                    value={filters.active}
                    onChange={(e) => setFilter("active", e.target.value)}
                  >
                    <option value="all">Toutes</option>
                    <option value="active">Actives</option>
                    <option value="inactive">Retirées</option>
                  </select>
                </label>
                <label>
                  Trier par
                  <select
                    value={filters.sort}
                    onChange={(e) => setFilter("sort", e.target.value)}
                  >
                    <option value="score">Meilleur match</option>
                    <option value="recent">Plus récentes</option>
                  </select>
                </label>
              </section>
              <section className="layout">
                <div className="list">
                  <div className="listHead">
                    <b>{filtered.length} opportunité(s)</b>
                    <button
                      onClick={() => download("jobwatch-export.json", jobs)}
                    >
                      Exporter
                    </button>
                  </div>
                  {filtered.map((job) => (
                    <article
                      className={`job ${selected === job.id ? "selected" : ""}`}
                      key={job.id}
                    >
                      <button
                        className="jobOpen"
                        onClick={() => setSelected(job.id)}
                        aria-label={`Voir ${job.title} chez ${job.company}`}
                      >
                        <div className="score">
                          {job.match_score}
                          <small>/100</small>
                        </div>
                        <div className="jobMain">
                          <div className="meta">
                            <span>{job.category}</span>
                            <span>{date(job.published_at)}</span>
                            {!job.status_active && (
                              <span className="inactive">Retirée</span>
                            )}
                          </div>
                          <h2>{job.title}</h2>
                          <h3>
                            {job.company} · {job.location || "Lieu non précisé"}
                          </h3>
                          <div className="tags">
                            <i>{job.contract_type}</i>
                            {job.match_reasons.slice(0, 2).map((x) => (
                              <i key={x}>{x}</i>
                            ))}
                          </div>
                        </div>
                      </button>
                      <select
                        aria-label={`Statut de ${job.title}`}
                        value={job.status}
                        disabled={busy}
                        onChange={(e) =>
                          action(
                            () =>
                              api(`jobs/${job.id}`, "PATCH", {
                                status: e.target.value,
                                note: job.note,
                                applied_at:
                                  day(job.applied_at) ||
                                  (e.target.value === "Envoyée" ? today() : ""),
                                follow_up_at: day(job.follow_up_at),
                              }),
                            "Statut enregistré.",
                          )
                        }
                      >
                        {STATUSES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </article>
                  ))}
                  {!filtered.length && (
                    <div className="empty">
                      <h2>
                        {jobs.length
                          ? "Aucune offre avec ces filtres"
                          : "Votre veille commence ici"}
                      </h2>
                      <p>
                        {jobs.length
                          ? "Ajustez les filtres pour retrouver vos offres."
                          : "Lancez une collecte ou ajoutez votre première offre. Aucune offre de démonstration n’est ajoutée."}
                      </p>
                    </div>
                  )}
                </div>
                <aside>
                  {current ? (
                    <Detail
                      key={`${current.id}-${current.updated_at}-${current.status}-${current.note}-${current.follow_up_at}`}
                      job={current}
                      busy={busy}
                      save={(values) =>
                        action(
                          () => api(`jobs/${current.id}`, "PATCH", values),
                          "Candidature enregistrée.",
                        )
                      }
                    />
                  ) : (
                    <div className="placeholder">
                      <div className="eyebrow">VOTRE PROFIL</div>
                      <h2>
                        Finance × IT
                        <br />
                        Transformation
                      </h2>
                      <p>
                        Les scores expliquent les correspondances avec vos
                        critères. Ils ne représentent pas une probabilité
                        d’embauche.
                      </p>
                      <div className="profileTags">
                        {data.profile.tools.map((x) => (
                          <span key={x}>{x}</span>
                        ))}
                      </div>
                      <hr />
                      <p>
                        Sélectionnez une offre pour lire l’annonce, vérifier les
                        écarts et préparer votre prochaine action.
                      </p>
                    </div>
                  )}
                </aside>
              </section>
            </>
          )}
          {tab === "profil" && (
            <Profile
              key={JSON.stringify(data.profile)}
              profile={data.profile}
              busy={busy}
              save={(profile) =>
                action(
                  () => api("profile", "PUT", profile),
                  "Profil enregistré et scores recalculés. Les nouveaux critères de collecte seront appliqués au prochain passage.",
                )
              }
            />
          )}
          {tab === "collecte" && (
            <section className="panel">
              <div className="sectionHead">
                <div>
                  <h2>Une veille qui continue sans votre ordinateur</h2>
                  <p>
                    Source : API publique SmartRecruiters. Seules les
                    entreprises configurées sont couvertes.
                  </p>
                </div>
                <button
                  className="primary"
                  disabled={collecting || busy}
                  onClick={collect}
                >
                  {collecting ? "Recherche en cours…" : "Lancer une collecte"}
                </button>
              </div>
              <div className="notice">
                Le premier passage de chaque entreprise initialise la veille
                sans envoyer d’email. Les passages suivants peuvent alerter sur
                les nouvelles offres. Le journal ci-dessous permet de vérifier
                l’automatisation Render.
              </div>
              <p>
                <b>Entreprises configurées :</b>{" "}
                {data.profile.boards.join(", ")}
              </p>
              <p>
                <b>Emails :</b>{" "}
                {data.emailConfigured
                  ? data.profile.alertsEnabled
                    ? "activés"
                    : "fournisseur connecté, alertes désactivées dans le profil"
                  : "non configurés — renseigner les variables email dans Render"}
                . Seuil : {data.profile.alertThreshold}/100.
              </p>
              <p>
                {data.notifications
                  .map(
                    (n) =>
                      `${{ pending: "En attente", sent: "Envoyés", failed: "En échec", suppressed: "Annulés" }[n.state]} : ${n.count}`,
                  )
                  .join(" · ") || "Aucune notification."}
              </p>
              <div className="runList">
                {data.runs.map((run) => (
                  <div className="run" key={run.id}>
                    <div>
                      <b>
                        {
                          {
                            success: "Terminée",
                            partial: "Partielle",
                            failed: "Échec",
                            running: "En cours",
                          }[run.status]
                        }
                      </b>{" "}
                      · {new Date(run.started_at).toLocaleString("fr-FR")} ·{" "}
                      {run.trigger === "cron" ? "Automatique" : "Manuelle"}
                    </div>
                    <p>
                      {run.summary.scanned ?? 0} annonces examinées ·{" "}
                      {run.summary.created ?? 0} nouvelles ·{" "}
                      {run.summary.updated ?? 0} mises à jour
                    </p>
                    {run.summary.boards?.map((b) => (
                      <p key={b.board} className="muted">
                        {b.board} : {b.scanned} annonces, {b.details} fiches
                        analysées {b.initial ? "· initialisation" : ""}
                      </p>
                    ))}
                    {run.summary.errors?.map((e, i) => (
                      <p key={i} className="error">
                        {e}
                      </p>
                    ))}
                  </div>
                ))}
                {!data.runs.length && (
                  <p className="empty">Aucune collecte lancée.</p>
                )}
              </div>
            </section>
          )}
        </>
      )}
      {add && (
        <AddJob
          busy={busy}
          close={() => setAdd(false)}
          save={(values) =>
            action(async () => {
              await api("jobs", "POST", values);
              setAdd(false);
            }, "Offre enregistrée.")
          }
        />
      )}
      <footer>
        JobWatch V2 · Votre espace personnel de veille professionnelle
      </footer>
    </main>
  );
}
function Stat({ label, value }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
function Detail({ job, busy, save }) {
  const [status, setStatus] = useState(job.status);
  return (
    <div className="detail">
      <div className="bigScore">
        {job.match_score}
        <span>sur 100</span>
      </div>
      <div className="eyebrow">{job.category}</div>
      <h2>{job.title}</h2>
      <h3>
        {job.company} · {job.location}
      </h3>
      <p>
        {job.contract_type} · {job.remote_policy || "Télétravail non précisé"}
      </p>
      <p className="muted">
        Publiée : {date(job.published_at)} · Repérée : {date(job.first_seen_at)}
        <br />
        Dernière observation : {date(job.last_seen_at)}
      </p>
      <h4>Pourquoi cette offre ?</h4>
      <div className="tags">
        {job.match_reasons.map((x) => (
          <i key={x}>{x}</i>
        ))}
      </div>
      <details>
        <summary>Détail du score</summary>
        {job.score_breakdown.map((x) => (
          <div className="scoreRow" key={x.label}>
            <span>{x.label}</span>
            <b>
              {x.points}
              {x.max ? ` / ${x.max}` : ""}
            </b>
          </div>
        ))}
      </details>
      <h4>Points à vérifier</h4>
      {job.match_gaps.length ? (
        <ul>
          {job.match_gaps.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : (
        <p>
          Aucun écart détecté par les règles actuelles ; relisez les exigences
          de l’annonce.
        </p>
      )}
      <h4>Ma candidature</h4>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(Object.fromEntries(new FormData(e.currentTarget)));
        }}
      >
        <label>
          Étape
          <select
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Date d’envoi
          <input
            type="date"
            name="applied_at"
            defaultValue={day(job.applied_at)}
          />
        </label>
        <label>
          Prochaine relance
          <input
            type="date"
            name="follow_up_at"
            defaultValue={day(job.follow_up_at)}
          />
        </label>
        <label>
          Notes et prochaines actions
          <textarea
            name="note"
            rows="4"
            maxLength="10000"
            defaultValue={job.note}
          />
        </label>
        <button className="primary" disabled={busy}>
          Enregistrer
        </button>
      </form>
      <h4>Annonce</h4>
      <details>
        <summary>Lire la description</summary>
        <p className="description">
          {job.description || "Description non renseignée."}
        </p>
      </details>
      {job.url && (
        <a
          className="link"
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Ouvrir l’annonce ↗
        </a>
      )}
      <h4>Sources</h4>
      {job.sources.map((s, i) => (
        <p key={i}>
          {s.source}
          {s.board ? ` · ${s.board}` : ""} ·{" "}
          {["Manuel", "Import V1"].includes(s.source)
            ? "ajout personnel"
            : s.active
              ? "observée active"
              : "retirée"}
        </p>
      ))}
      <details>
        <summary>Historique des étapes</summary>
        {job.history.map((e, i) => (
          <p key={i}>
            {date(e.date)} · {e.status}
          </p>
        ))}
      </details>
    </div>
  );
}
function Profile({ profile, busy, save }) {
  const arrays = [
    ["targetTitles", "Postes prioritaires"],
    ["secondaryTitles", "Autres postes cibles"],
    ["tags", "Compétences et tags"],
    ["tools", "Outils réellement maîtrisés"],
    ["locations", "Localisations"],
    ["countries", "Pays (fr, be…)"],
    ["boards", "Entreprises SmartRecruiters"],
    ["excludedContracts", "Contrats exclus"],
  ];
  return (
    <section className="panel">
      <h2>Votre référentiel de matching</h2>
      <p>
        Ces critères sont initialisés depuis votre profil fourni. Modifiez les
        tags et les outils pour refléter votre CV, sans ajouter de compétences
        non maîtrisées.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget),
            p = { ...profile };
          for (const [key] of arrays)
            p[key] = String(fd.get(key))
              .split(/[,\n]/)
              .map((s) => s.trim())
              .filter(Boolean);
          for (const key of [
            "minExperience",
            "maxExperience",
            "maxAgeDays",
            "minScore",
            "alertThreshold",
          ])
            p[key] = Number(fd.get(key));
          p.preferredContract = fd.get("preferredContract");
          p.alertsEnabled = fd.has("alertsEnabled");
          save(p);
        }}
      >
        <div className="grid2">
          {arrays.map(([key, label]) => (
            <label key={key}>
              {label}
              <textarea
                name={key}
                rows={key.includes("Titles") ? 5 : 3}
                defaultValue={profile[key].join("\n")}
              />
              <small>
                Une valeur par ligne ou séparée par une virgule.
                {key === "boards"
                  ? " Identifiant exact de la page entreprise, par exemple SopraSteria1."
                  : ""}
              </small>
            </label>
          ))}
        </div>
        <div className="grid3">
          {[
            ["minExperience", "Expérience cible minimum", 0, 50],
            ["maxExperience", "Expérience cible maximum", 0, 50],
            ["maxAgeDays", "Ancienneté maximale des offres (jours)", 1, 365],
            ["minScore", "Score minimum à collecter", 0, 100],
            ["alertThreshold", "Seuil des alertes", 0, 100],
          ].map(([key, label, min, max]) => (
            <label key={key}>
              {label}
              <input
                name={key}
                type="number"
                min={min}
                max={max}
                required
                defaultValue={profile[key]}
              />
            </label>
          ))}
          <label>
            Contrat préféré
            <select
              name="preferredContract"
              defaultValue={profile.preferredContract}
            >
              {["CDI", "CDD", "Freelance", "Tous"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="check">
          <input
            type="checkbox"
            name="alertsEnabled"
            defaultChecked={profile.alertsEnabled}
          />{" "}
          Activer les emails pour les nouvelles offres pertinentes
        </label>
        <p className="muted">
          Changer vos critères recalcule les scores, sans supprimer les
          candidatures existantes. Le fournisseur email doit également être
          configuré dans Render.
        </p>
        <button className="primary" disabled={busy}>
          Enregistrer mon profil
        </button>
      </form>
    </section>
  );
}
function AddJob({ busy, close, save }) {
  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape" && !busy) close();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [busy, close]);
  return (
    <div className="modalBg">
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-title"
        onSubmit={(e) => {
          e.preventDefault();
          save(Object.fromEntries(new FormData(e.currentTarget)));
        }}
      >
        <div className="modalTitle">
          <h2 id="add-title">Ajouter une offre</h2>
          <button
            type="button"
            aria-label="Fermer"
            disabled={busy}
            onClick={close}
          >
            ×
          </button>
        </div>
        <div className="grid2">
          {[
            ["company", "Entreprise"],
            ["title", "Poste"],
            ["location", "Localisation"],
            ["seniority", "Expérience demandée (ex. 3–5 ans)"],
          ].map(([name, label]) => (
            <label key={name}>
              {label}
              <input
                name={name}
                required={["company", "title"].includes(name)}
                autoFocus={name === "company"}
                maxLength="300"
              />
            </label>
          ))}
          <label>
            Date de publication
            <input name="published_at" type="date" />
          </label>
          <label>
            Contrat
            <select name="contract_type">
              {[
                "Non précisé",
                "CDI",
                "CDD",
                "Freelance",
                "Stage",
                "Alternance",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Lien vers l’annonce
            <input name="url" type="url" maxLength="2000" />
          </label>
          <label>
            Pays
            <input name="country" placeholder="fr" maxLength="2" />
          </label>
        </div>
        <label>
          Description
          <textarea name="description" rows="6" maxLength="60000" />
        </label>
        <label>
          Notes
          <textarea name="note" rows="2" maxLength="10000" />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Enregistrement…" : "Analyser et ajouter"}
        </button>
      </form>
    </div>
  );
}
