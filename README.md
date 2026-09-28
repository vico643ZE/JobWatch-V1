# JobWatch V2

Application personnelle de veille Finance × IT et de suivi des candidatures. Next.js 16 / React 19, PostgreSQL, collecte SmartRecruiters. Aucun LLM requis.

## Fonctions

- Espace privé protégé par mot de passe haché, session signée HttpOnly, contrôle d’origine et limitation persistante des connexions.
- Profil éditable : intitulés, tags, outils réellement maîtrisés, géographie, contrats, expérience et seuils.
- Collecteur réel SmartRecruiters par entreprise, pagination, délais, retries limités et temporisation. Une source technique, extensible via `lib/collectors/`.
- Normalisation ; déduplication par source/entreprise/identifiant, URL canonique, puis empreinte entreprise/intitulé/lieu.
- Score déterministe expliqué /100, écarts explicites ; Qlik Sense ne vaut pas Power BI. Les postes techniques hors cible sont exclus. Les années et mois sont distingués.
- Données centralisées ; statuts, notes, dates d’envoi et de relance, historique ; conservation du suivi lorsqu’une annonce disparaît.
- Recherche, filtres et tris ; import idempotent du stockage local V1 ; export JSON.
- Journal des collectes, verrou distribué, clôture uniquement après un relevé complet réussi de la source.
- Cron Render toutes les 6 heures, même lorsque l’ordinateur est éteint.
- Emails Resend optionnels, uniquement nouvelles offres au-dessus du seuil. Première collecte sans emails. Clé d’idempotence stable ; arrêt des reprises incertaines après 23 h.

## Mise en production

Suivre **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** puis **[docs/PRODUCTION-CHECKLIST.md](docs/PRODUCTION-CHECKLIST.md)**. Ne pas écraser les données locales de V1 avant leur import. Ne pas créer un deuxième Web Service Render si la V1 existe déjà.

## Développement

Node.js 22.16+ ou 24 et PostgreSQL. Copier `.env.example` en `.env.local`, compléter les valeurs localement, puis :

```sh
npm ci
npm run auth:setup
npm run db:migrate
npm run dev
```

`npm run auth:setup` génère un mot de passe et deux variables. Conserver les valeurs dans un gestionnaire de mots de passe et les saisir dans l’environnement ; ne jamais les commiter.

```sh
npm test
npm run build
npm run test:http
npx playwright install chromium
npm run test:e2e
npm run source:check
npm run collect
npm run verify:production -- https://jobwatch-v1.onrender.com
```

`source:check` lit la source réelle sans écrire en base ni envoyer d’email. `collect` modifie la base configurée et peut envoyer les alertes activées. Les tests unitaires et d’intégration utilisent une base PostgreSQL embarquée éphémère (PGlite) ; les tests navigateur ont leur propre base et leurs propres secrets temporaires. Ils ne se connectent jamais à la production.

## Organisation

| Répertoire                            | Rôle                                       |
| ------------------------------------- | ------------------------------------------ |
| `app/`, `components/`                 | Page privée, dashboard, connexion, API     |
| `lib/matching.mjs`, `lib/profile.mjs` | Profil, filtrage et score                  |
| `lib/normalize.mjs`, `lib/store.mjs`  | Normalisation, déduplication et stockage   |
| `lib/collectors/`                     | Sources indépendantes                      |
| `lib/pipeline.mjs`                    | Collecte, verrou, journal, clôture         |
| `lib/notifications.mjs`               | Interface `send(job)` et fournisseur email |
| `supabase/migrations/`                | Migration additive PostgreSQL              |
| `scripts/`                            | Migration, collecte, vérifications         |
| `tests/`                              | Régressions, base et navigateur            |

## Données et accès

`jw_jobs.data` contient le Job normalisé (entreprise, titre, pays, contrat, description, source, dates de publication, séniorité, catégorie, score, raisons, écarts et détail du score). Les identités, l’URL canonique et l’empreinte sont indexées dans les colonnes relationnelles. `jw_job_sources` conserve les sources secondaires. Les candidatures et l’historique sont séparés pour ne jamais être écrasés par une collecte. Le profil, les exécutions et les notifications disposent de tables dédiées.

La migration conserve la table historique `jobs` sans la lire ni l’altérer. Si vous y avez réellement enregistré des données, prévoir un import spécifique avant de retirer la V1 ; le code initial ne l’utilisait pas. Les nouvelles tables activent RLS et retirent les accès publics `anon` et `authenticated`. Seul le serveur se connecte avec le propriétaire PostgreSQL. Ne pas exposer l’URL de connexion au navigateur.

## Limites explicites

- Couverture des seules entreprises configurées sur SmartRecruiters, pas une recherche exhaustive de LinkedIn ou de tout le marché. La valeur initiale est `SopraSteria1` ; d’autres identifiants peuvent être ajoutés dans le profil.
- Un score est une règle de priorisation, pas une probabilité de succès ni une analyse sémantique du CV. Les tags sont organisés en catégories ; les tags personnalisés peuvent compléter les points de compétences transférables, dans la limite de la catégorie.
- Le CV est représenté par le profil éditable ; l’extraction automatique d’un PDF n’est pas incluse.
- Les libellés génériques « Full-time » ne prouvent pas un CDI. Un contrat inconnu reste « Non précisé ».
- Les postes hors zone, trop anciens ou sous le seuil ne sont pas importés. Les candidatures déjà sauvegardées restent disponibles après un changement de critères.
- Un batch est plafonné à 100 pages, 250 détails par entreprise et environ 8 minutes (hors dernière requête/reprise en cours). Une exécution partielle n’entraîne pas de clôtures automatiques ni de nouvelles alertes pour l’entreprise concernée.
- Une source inaccessible ne rend pas une offre inactive ; consulter le journal et la dernière observation. La disponibilité observée n’est pas une garantie que le recruteur accepte encore des candidatures.
- Le dashboard charge les offres sauvegardées de cette application personnelle en une fois. Une volumétrie importante nécessitera une pagination serveur.
- Le premier passage initialise la veille sans email ; activer les alertes n’envoie pas rétroactivement les offres connues.
- L’alerte de nouvelle offre est distincte d’un rappel de relance : les dates de relance sont affichées dans le dashboard, sans email de rappel.

## Sources techniques

- [SmartRecruiters Posting API](https://developers.smartrecruiters.com/docs/posting-api)
- [Render Cron Jobs](https://render.com/docs/cronjobs)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys)
