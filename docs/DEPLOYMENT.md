# Déployer JobWatch V2 sur le site Render existant

## 1. Sauvegarder la V1

Sur le navigateur où vous avez enregistré vos candidatures, conserver le site et ses données. La V2 lit la même clé locale `jobwatch-jobs` sur le même domaine et proposera « Sauvegarder la V1 » puis « Importer mes candidatures ». L’import ne supprime pas la copie locale.

Ne changez pas le domaine Render avant cet import : le stockage local est lié au domaine ET au navigateur. Faites l’import sur chacun des navigateurs contenant des candidatures distinctes.

## 2. Mettre le code sur GitHub

La livraison contient tous les fichiers de la V2 et un patch Git. Options :

- Appliquer le patch à un clone propre de la V1 (`git apply --index jobwatch-v2.patch`), tester, créer un commit puis pousser une branche V2.
- Ou déposer les fichiers de l’archive dans le dépôt, en remplaçant les fichiers homonymes. Inclure `.github`, `.gitignore` et `.env.example`, jamais un fichier `.env.local`.

Le dépôt doit contenir `lib/`, `components/`, `scripts/`, `supabase/migrations/`, le nouveau `package.json` et son `package-lock.json`.

Ne connectez Render à cette branche qu’après configuration des variables ci-dessous. Évitez de pousser directement sur la branche de production avec un déploiement automatique actif.

## 3. Créer une base PostgreSQL

Aucune base n’était configurée dans le dépôt audité. Deux possibilités compatibles :

**Supabase** : créer un projet, conserver le mot de passe de base, ouvrir Connect et copier la chaîne PostgreSQL du **Session pooler, port 5432**. Utiliser le véritable mot de passe à la place du placeholder. Définir `DATABASE_SSL=require`. La migration crée des tables privées ; aucune clé publique Supabase n’est nécessaire.

**Render PostgreSQL** : créer une base dans la même région que le Web Service. Utiliser l’**Internal Database URL** et `DATABASE_SSL=disable` pour cette connexion interne. Vérifier la durée de vie et les sauvegardes du plan choisi : ne pas confier ses candidatures durablement à une base d’essai expirante.

Vérifiez le tarif affiché avant toute création payante. Le code n’impose aucun achat ni fournisseur précis.

## 4. Créer le mot de passe privé

Sur votre ordinateur, dans le dossier du projet après `npm ci` :

```sh
npm run auth:setup
```

Conservez le mot de passe affiché dans votre gestionnaire. Copiez les deux autres valeurs dans les variables Render `APP_PASSWORD_HASH` et `SESSION_SECRET`. Ne les placez ni dans GitHub ni dans une capture publique. Changer l’une de ces valeurs invalide les sessions existantes.

## 5. Configurer le Web Service existant

Dans Render → `jobwatch-v1` → Environment, renseigner :

| Variable                  | Valeur                                                               |
| ------------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`            | URL PostgreSQL complète                                              |
| `DATABASE_SSL`            | `require` pour Supabase/externe ; `disable` pour Render interne      |
| `DATABASE_CA`             | Seulement si votre fournisseur nécessite un certificat CA spécifique |
| `APP_URL`                 | `https://jobwatch-v1.onrender.com`                                   |
| `APP_PASSWORD_HASH`       | Valeur générée par le script                                         |
| `SESSION_SECRET`          | Valeur générée par le script                                         |
| `NODE_VERSION`            | `22.22.0`                                                            |
| `NEXT_TELEMETRY_DISABLED` | `1`                                                                  |

Dans Settings :

- Branche : celle contenant la V2 testée.
- Build Command : `npm ci --include=dev && npm run build`
- Start Command : `npm run db:migrate && npm start`
- Health Check Path : `/api/health`

Lancer Manual Deploy. La migration est rejouable et s’exécute avant le serveur ; une erreur de migration empêche le démarrage. Aucune ancienne table n’est supprimée.

`/api/health` doit renvoyer `{"ok":true,"version":"2.0.0"}`. La page d’accueil doit demander le mot de passe. Un statut 503 indique une configuration ou une migration incomplète : consultez les logs, sans partager les secrets.

## 6. Vérifier la première collecte

Se connecter, importer les données V1 si présentes, puis ouvrir « Mon profil ». La source initiale `SopraSteria1` est un identifiant SmartRecruiters vérifié. Lancer « Rechercher des offres ». Ouvrir le journal et vérifier le résultat.

Le premier passage ne déclenche pas d’email. Un deuxième passage sur les mêmes annonces doit afficher zéro nouvelle offre. Le nombre exact d’offres varie selon les publications et vos critères.

## 7. Activer l’automatisation

Créer un **Cron Job Render**, rattaché au même dépôt et à la même branche :

- Build Command : `npm ci --omit=dev`
- Command : `npm run collect`
- Schedule : `0 */6 * * *` (00 h, 06 h, 12 h, 18 h **UTC**, toutes les six heures).
- Variables : partager la base avec le Web Service, ainsi que les variables email si utilisées. `NODE_VERSION=22.22.0`.

Le Cron Job est un service facturable : vérifier son prix avant création. Le fichier `render.yaml` est une référence de configuration ; son import peut créer des services. Pour votre V1 existante, privilégiez les réglages manuels ci-dessus afin d’éviter un doublon.

Utiliser « Trigger Run » une fois, puis vérifier une collecte « Automatique » dans JobWatch. Fermer votre ordinateur n’arrête pas le Cron Job.

## 8. Emails optionnels

Créer un compte Resend et configurer une adresse d’expédition autorisée (domaine vérifié ou mode de test limité par le fournisseur). Dans le Web Service ET le Cron Job :

- `RESEND_API_KEY` : clé du fournisseur.
- `ALERT_EMAIL_FROM` : expéditeur autorisé.
- `ALERT_EMAIL_TO` : votre propre adresse de réception.

Puis activer les emails dans « Mon profil ». Aucun envoi n’est possible sans ces trois variables. Les alertes concernent seulement les offres nouvelles après initialisation, actives, au-dessus du seuil et jamais notifiées. Une augmentation de score d’une ancienne offre ne déclenche pas d’alerte.

En cas d’envoi incertain, le même identifiant est réutilisé pour la reprise. Après 23 heures, la reprise automatique est arrêtée pour éviter les doublons ; l’état « En échec » reste visible.

## 9. Retour arrière

Revenir au déploiement Render précédent si nécessaire. La migration additive laisse la V1 intacte, et son stockage local n’a pas été effacé. Les candidatures créées en V2 restent dans PostgreSQL et ne s’afficheront pas automatiquement dans la V1 : exportez-les depuis la V2 si possible. Ne supprimez pas la base lors d’un rollback.
