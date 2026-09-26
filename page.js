"use client";

import { useEffect, useMemo, useState } from "react";

const TARGETS = [
  ["Finance IT", ["contrôleur de gestion it","controle de gestion it","contrôleur de gestion si","it financial controller","finance business partner it","it finance business partner","dsi"]],
  ["FP&A", ["fp&a","financial planning","forecast","atterrissage","budget","variance analysis"]],
  ["Projet / PMO", ["project controller","contrôleur de gestion projet","controle de gestion projet","pmo finance","pmo financier","business case","roi"]],
  ["Transformation", ["finance transformation","transformation finance","performance management","process improvement","transformation digitale"]],
  ["Portfolio", ["portfolio management","lean portfolio management","lpm","it portfolio","portefeuille it"]],
  ["ERP / EPM", ["erp","epm","anaplan","sap","oracle","power bi","qlik sense"]]
];

const STRONG = [
  ["capex",7],["opex",7],["budget",5],["forecast",6],["atterrissage",6],
  ["reporting",4],["kpi",4],["roi",5],["business case",5],["dsi",7],
  ["it",2],["si",2],["erp",6],["anaplan",5],["portfolio",5],["pmo",4],
  ["finance business partner",8],["fp&a",8],["contrôleur de gestion",7],
  ["controle de gestion",7],["transformation",3],["jira",2],["clarity",3],
  ["qlik",3],["process",2],["ifrs",2]
];

const initialJobs = [
  {
    id: 1,
    company: "Hermès",
    title: "Contrôleur de Gestion Projet IT",
    location: "Île-de-France",
    source: "Ajout manuel",
    date: "2026-09-25",
    status: "À analyser",
    url: "",
    description: "PMO programme ERP international. Pilotage budgétaire mensuel, consolidation, reporting financier IFRS, suivi des écarts, prévisions glissantes, Change Management financier, business cases, Contract Management fournisseurs, licences, SLA.",
    seniority: "8 ans demandés",
    note: "Très forte proximité métier, mais séniorité demandée nettement supérieure."
  }
];

const statuses = ["À analyser","À préparer","Prête","Envoyée","Relance","Entretien RH","Entretien Manager","Case Study/Final","Offre","Refus","Abandonnée"];

function scoreJob(job) {
  const t = `${job.title} ${job.description || ""}`.toLowerCase();
  let raw = 0;
  const hits = [];
  for (const [k,w] of STRONG) {
    if (t.includes(k)) { raw += w; hits.push(k); }
  }
  let score = Math.min(96, 38 + raw);
  if ((job.seniority || "").match(/8|10|senior manager|director/i)) score -= 18;
  return { score: Math.max(25, score), hits: [...new Set(hits)].slice(0,8) };
}

function category(job) {
  const t = `${job.title} ${job.description || ""}`.toLowerCase();
  const found = TARGETS.map(([name, keys]) => [name, keys.filter(k => t.includes(k)).length])
    .sort((a,b)=>b[1]-a[1])[0];
  return found && found[1] ? found[0] : "Autre";
}

export default function Home() {
  const [jobs, setJobs] = useState(initialJobs);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("Toutes");
  const [status, setStatus] = useState("Tous");
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("jobwatch-jobs");
    if (saved) setJobs(JSON.parse(saved));
  }, []);
  useEffect(() => localStorage.setItem("jobwatch-jobs", JSON.stringify(jobs)), [jobs]);

  const enriched = useMemo(() => jobs.map(j => ({...j, ...scoreJob(j), category: category(j)}))
    .sort((a,b)=>b.score-a.score), [jobs]);

  const filtered = enriched.filter(j => {
    const q = query.toLowerCase();
    return (!q || `${j.company} ${j.title} ${j.description}`.toLowerCase().includes(q))
      && (cat === "Toutes" || j.category === cat)
      && (status === "Tous" || j.status === status);
  });

  const active = enriched.filter(j => !["Refus","Abandonnée"].includes(j.status));
  const strong = enriched.filter(j => j.score >= 75).length;
  const interviews = enriched.filter(j => j.status.includes("Entretien") || j.status.includes("Case")).length;

  function updateStatus(id, value) {
    setJobs(js => js.map(j => j.id === id ? {...j, status:value} : j));
    if (selected?.id === id) setSelected(s => ({...s, status:value}));
  }

  function addJob(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const job = Object.fromEntries(fd.entries());
    job.id = Date.now();
    job.date = job.date || new Date().toISOString().slice(0,10);
    job.status = "À analyser";
    setJobs(js => [job, ...js]);
    setShowAdd(false);
  }

  return <main>
    <header>
      <div>
        <div className="eyebrow">JOBWATCH · FINANCE × IT</div>
        <h1>Opportunités</h1>
        <p>Veille ciblée, matching CV et pipeline de candidatures.</p>
      </div>
      <button className="primary" onClick={()=>setShowAdd(true)}>+ Ajouter une offre</button>
    </header>

    <section className="stats">
      <Stat label="Offres actives" value={active.length}/>
      <Stat label="Match ≥ 75%" value={strong}/>
      <Stat label="Entretiens" value={interviews}/>
      <Stat label="Cibles surveillées" value={TARGETS.length}/>
    </section>

    <section className="toolbar">
      <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher entreprise, poste, compétence…"/>
      <select value={cat} onChange={e=>setCat(e.target.value)}>
        <option>Toutes</option>{TARGETS.map(([n])=><option key={n}>{n}</option>)}<option>Autre</option>
      </select>
      <select value={status} onChange={e=>setStatus(e.target.value)}>
        <option>Tous</option>{statuses.map(s=><option key={s}>{s}</option>)}
      </select>
    </section>

    <section className="layout">
      <div className="list">
        <div className="listHead"><b>{filtered.length} opportunité{filtered.length>1?"s":""}</b><span>triées par correspondance</span></div>
        {filtered.map(job => <article className={`job ${selected?.id===job.id?"selected":""}`} key={job.id} onClick={()=>setSelected(job)}>
          <div className="score">{job.score}<small>%</small></div>
          <div className="jobMain">
            <div className="meta"><span>{job.category}</span><span>{job.date}</span></div>
            <h2>{job.title}</h2>
            <h3>{job.company} · {job.location}</h3>
            <div className="tags">{job.hits.slice(0,5).map(x=><i key={x}>{x}</i>)}</div>
          </div>
          <select value={job.status} onClick={e=>e.stopPropagation()} onChange={e=>updateStatus(job.id,e.target.value)}>
            {statuses.map(s=><option key={s}>{s}</option>)}
          </select>
        </article>)}
        {!filtered.length && <div className="empty">Aucune offre avec ces filtres.</div>}
      </div>

      <aside>
        {selected ? <JobDetail job={{...selected,...scoreJob(selected), category:category(selected)}} updateStatus={updateStatus}/> :
        <div className="placeholder">
          <div className="target">215 M€</div>
          <h2>Ton référentiel de matching</h2>
          <p>Pilotage financier IT, CAPEX/OPEX, écarts & atterrissages, reporting exécutif, ROI/business cases, KPI, LPM, coordination Métier/IT et transformation.</p>
          <div className="profileTags">{["Excel","Anaplan","Qlik Sense","Clarity","Jira","n8n","Dust"].map(x=><span key={x}>{x}</span>)}</div>
          <hr/>
          <p className="muted">Sélectionne une offre pour afficher ses correspondances, écarts et prochaines actions.</p>
        </div>}
      </aside>
    </section>

    {showAdd && <div className="modalBg" onMouseDown={()=>setShowAdd(false)}>
      <form className="modal" onSubmit={addJob} onMouseDown={e=>e.stopPropagation()}>
        <div className="modalTitle"><h2>Ajouter une offre</h2><button type="button" onClick={()=>setShowAdd(false)}>×</button></div>
        <div className="grid2">
          <label>Entreprise<input name="company" required/></label>
          <label>Poste<input name="title" required/></label>
          <label>Localisation<input name="location" defaultValue="Île-de-France"/></label>
          <label>Date<input name="date" type="date"/></label>
          <label>Séniorité<input name="seniority" placeholder="ex. 3–5 ans"/></label>
          <label>Lien<input name="url" type="url" placeholder="https://…"/></label>
        </div>
        <label>Description<textarea name="description" rows="7" placeholder="Colle ici l'annonce : le matching se calcule automatiquement."/></label>
        <label>Note<textarea name="note" rows="2"/></label>
        <button className="primary" type="submit">Analyser et ajouter</button>
      </form>
    </div>}
  </main>;
}

function Stat({label,value}) {
  return <div className="stat"><strong>{value}</strong><span>{label}</span></div>
}

function JobDetail({job, updateStatus}) {
  const gaps = [];
  const t = (job.description || "").toLowerCase();
  if (t.includes("ifrs")) gaps.push("IFRS : non démontré explicitement dans le CV");
  if (t.includes("power bi")) gaps.push("Power BI : le CV mentionne Qlik Sense, pas Power BI");
  if (t.includes("contract") || t.includes("contrat")) gaps.push("Contract management IT : expérience à préciser");
  if ((job.seniority || "").match(/8|10/)) gaps.push(`Séniorité : ${job.seniority}, supérieure à ton expérience actuelle`);

  return <div className="detail">
    <div className="bigScore">{job.score}%<span>match</span></div>
    <div className="eyebrow">{job.category}</div>
    <h2>{job.title}</h2>
    <h3>{job.company} · {job.location}</h3>
    <select value={job.status} onChange={e=>updateStatus(job.id,e.target.value)}>
      {statuses.map(s=><option key={s}>{s}</option>)}
    </select>
    <h4>Correspondances détectées</h4>
    <div className="tags">{job.hits.map(x=><i key={x}>{x}</i>)}</div>
    <h4>Points d'attention</h4>
    {gaps.length ? <ul>{gaps.map(x=><li key={x}>{x}</li>)}</ul> : <p>Aucun écart majeur détecté automatiquement. Vérifier la séniorité et les exigences sectorielles.</p>}
    {job.note && <><h4>Note</h4><p>{job.note}</p></>}
    {job.url && <a className="link" href={job.url} target="_blank">Ouvrir l'offre ↗</a>}
    <p className="muted foot">Le score V1 est un matching par mots-clés pondérés : il sert à prioriser, pas à remplacer une analyse de candidature.</p>
  </div>
}
