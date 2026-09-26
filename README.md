# JobWatch — Victor

Mini-app de veille et suivi des offres Finance / IT.

## V1
- Dashboard des offres
- Matching par tags avec le profil cible
- Filtres : recherche, catégorie, localisation, statut
- Pipeline de candidature
- Ajout manuel d'une offre
- Persistance locale dans le navigateur
- Configuration prête pour Supabase (V2)

## Lancer en local
1. Installer Node.js 18+
2. `npm install`
3. `npm run dev`
4. Ouvrir http://localhost:3000

## Déploiement
Importer le dossier dans GitHub puis connecter le dépôt à Vercel.

## Matching actuel
Le score V1 est volontairement explicable : il compare le texte de l'annonce à des mots-clés pondérés issus du CV et des cibles :
- contrôle de gestion IT / SI
- FP&A / forecast
- Finance Business Partner
- CAPEX / OPEX
- reporting exécutif
- KPI / performance management
- ROI / business case
- portfolio / LPM / PMO
- ERP / EPM / Anaplan
- transformation / process
- Jira / Clarity / Qlik Sense / n8n

La V2 pourra remplacer ce score par une analyse LLM du CV + de l'annonce et alimenter automatiquement la base via des sources autorisées / alertes e-mail.
