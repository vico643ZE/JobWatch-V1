# Recette de production — JobWatch V2

N’effectuer ces vérifications qu’après déploiement et configuration de la base. Aucune validation locale ne prouve à elle seule que Render, le Cron Job et les emails sont opérationnels.

| Vérification         | Manipulation                                                                           | Résultat attendu                                                        |
| -------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Santé                | Ouvrir `/api/health`                                                                   | `ok:true`, version `2.0.0`                                              |
| Confidentialité      | Ouvrir le site dans une fenêtre privée                                                 | Formulaire de connexion, aucune candidature                             |
| Protection API       | Ouvrir `/api/dashboard` sans connexion                                                 | Refus 401                                                               |
| Connexion            | Saisir le mot de passe généré                                                          | Dashboard accessible                                                    |
| Import V1            | Sur l’ancien navigateur : sauvegarder, importer puis réimporter                        | Statuts et notes conservés ; pas de nouvelles cartes au second import   |
| Ajout manuel         | Ajouter une offre nommée « TEST V2 — Contrôleur de gestion IT »                        | Score, détail, sources et étape visibles                                |
| Persistance          | Modifier note/statut, actualiser puis se reconnecter                                   | Modifications conservées                                                |
| Autre appareil       | Ouvrir JobWatch et se connecter sur un autre navigateur                                | Même candidature, même note                                             |
| Étapes               | Passer à Envoyée puis Entretien RH                                                     | Historique des deux transitions                                         |
| Relance              | Saisir une relance aujourd’hui, enregistrer                                            | Compteur de relances augmenté                                           |
| Profil               | Retirer un outil présent dans une annonce, enregistrer                                 | Score recalculé ; candidature inchangée                                 |
| Filtres              | Combiner entreprise, statut, contrat, score, date                                      | Résultats cohérents ; tri fonctionnel                                   |
| Collecte réelle      | Lancer la recherche                                                                    | Journal terminé ou erreur explicite ; aucun faux succès                 |
| Idempotence          | Relancer immédiatement                                                                 | Les mêmes offres ne sont pas recréées                                   |
| Source erronée       | Sauvegarder provisoirement un identifiant inexistant et collecter                      | Pas de suppression des candidatures ; remettre ensuite la source valide |
| Automatisation       | Trigger Run du Cron Job Render                                                         | Ligne « Automatique » et logs cohérents                                 |
| Cycle planifié       | Attendre le prochain horaire UTC                                                       | Nouvelle ligne automatique sans ordinateur allumé                       |
| Email                | Configurer le fournisseur, activer les alertes et attendre une nouvelle offre éligible | Un seul email ; compteur envoyé mis à jour                              |
| Non-répétition email | Refaire un batch après réception                                                       | Aucun second email pour cette offre                                     |
| Export               | Exporter le tableau                                                                    | Fichier JSON lisible contenant les notes et étapes                      |
| Mobile               | Ouvrir sur écran étroit                                                                | Filtres et détail utilisables sans défilement horizontal global         |
| Déconnexion          | Se déconnecter puis actualiser                                                         | Retour au formulaire privé                                              |

Après le test manuel, passer l’offre « TEST V2 » à Abandonnée et inscrire « Offre de test ». Aucune suppression définitive n’est proposée afin de conserver l’historique.

## Vérification automatique en lecture seule

```sh
npm run verify:production -- https://jobwatch-v1.onrender.com
```

Pour inclure la connexion privée, placer temporairement `JOBWATCH_TEST_PASSWORD` dans un fichier `.env.local` ignoré par Git, puis lancer la même commande. Retirer ensuite cette variable. Le script n’affiche pas le mot de passe et ne crée aucune offre. Il ne prouve pas la réception réelle des emails ni la planification Render : vérifier ces deux éléments séparément.
