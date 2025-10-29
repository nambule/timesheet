# Timesheet Codex

Application de saisie de temps simple (desktop et mobile), 100% locale (sans serveur), qui enregistre vos entrées du jour dans le stockage local du navigateur.

## Lancer

- Ouvrez `index.html` dans votre navigateur (double‑clic ou glisser‑déposer).
- Sur mobile, servez le dossier avec un serveur statique (ex: `python3 -m http.server`) et ouvrez l’URL depuis votre téléphone sur le même réseau.

## Fonctionnalités

- Entrées par projet, avec commentaire et durée.
- Liste des projets gérée via un écran « Réglages » (ajout, renommage, suppression), stockée localement.
- Heure de début par entrée; la durée est calculée automatiquement entre le début de la tâche et le début de la tâche suivante.
- Saisie rapide au clavier (une main) ou à la souris/tactile.
- Auto‑complétion sur Projets et Commentaires (basée sur l’historique/meta).
- Récapitulatif du jour (totaux par Projet) et export CSV.

## Raccourcis clavier

- `a` : ajouter une ligne
- `j` / `k` ou flèches bas/haut : naviguer entre les lignes
- `h` / `l` ou `Ctrl+←` / `Ctrl+→` : jour précédent/suivant
- `p` : focus sur le champ Projet
- `c` : focus sur le champ Commentaire
- `+` / `-` : décaler l'heure de début de ±15 minutes
- Boutons ± à côté de Début pour ajuster par pas de 15 minutes

Astuce: tapez directement dans un champ, les suggestions de commentaire apparaissent et sont cliquables.

## Données et confidentialité

- Les données du jour sont stockées localement dans `localStorage` par jour, clé `ts:YYYY-MM-DD`.
- La liste des Projets est stockée dans `ts:meta` (globale).
- Rien n’est envoyé vers un serveur.

## Export

- Bouton « Export CSV » pour obtenir les lignes du jour (colonnes: Date, Projet, Début, Commentaire, Minutes, HH:MM) et les totaux par Projet.
