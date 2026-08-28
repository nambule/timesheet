# Timesheet

Timesheet est une application web légère pour saisir son temps de travail au fil de la journée et analyser sa répartition par projet. Elle fonctionne directement dans le navigateur, sans compte ni serveur, conserve toutes les données localement et peut être [testée en ligne](https://nambule.github.io/timesheet).

## Ce que permet l’application

### Saisir sa journée

- Ajouter rapidement une activité, un projet et un commentaire.
- Calculer automatiquement la durée d’une activité jusqu’au début de la suivante.
- Ajouter des pauses, exclues des statistiques et des exports de temps travaillé.
- Naviguer entre les journées tout en voyant clairement si la date affichée est aujourd’hui.
- Réutiliser les projets et commentaires fréquents grâce aux raccourcis et à l’auto-complétion.
- Regrouper les projets et personnaliser la couleur de chaque groupe depuis les réglages.
- Contrôler le total de la journée par projet et copier rapidement les commentaires associés.

### Analyser son temps

- Consulter la répartition du temps par groupe de projets puis par projet dans une vue dédiée.
- Analyser par défaut la semaine courante, du lundi au dimanche.
- Parcourir rapidement les semaines et les mois précédents ou suivants.
- Définir librement une autre période.
- Comparer les projets avec leurs durées, pourcentages et barres de répartition, colorées selon leur groupe.
- Comparer la part de chaque groupe au temps théorique de 8 heures par journée renseignée.
- Voir le temps théorique total et l’écart signé correspondant aux heures supplémentaires.

### Exporter les données

- Copier les entrées de la journée dans un format prêt à coller dans Excel.
- Exporter l’année complète au format CSV.
- Copier les commentaires associés à un projet sur la période analysée.

## Démarrage rapide

Aucune installation ni compilation n’est nécessaire.

1. Téléchargez ou clonez le dépôt.
2. Ouvrez `index.html` dans un navigateur moderne.
3. Ajoutez une première activité et indiquez son heure de début.
4. Ajoutez l’activité suivante : la durée de la précédente est calculée automatiquement.

Pour tester l’application sur un autre appareil du réseau, lancez un serveur statique depuis le dossier du projet :

```bash
python3 -m http.server 8000
```

Ouvrez ensuite `http://<adresse-ip>:8000/index.html` sur l’appareil.

## Raccourcis clavier

| Raccourci | Action |
| --- | --- |
| `a` | Ajouter une entrée |
| `j` / `k` ou `↓` / `↑` | Naviguer entre les entrées |
| `h` / `l` ou `Ctrl+←` / `Ctrl+→` | Changer de journée |
| `p` | Sélectionner le champ Projet |
| `c` | Sélectionner le champ Commentaire |
| `+` / `-` | Décaler l’heure de début de 15 minutes |

## Données et confidentialité

- Les temps saisis sont stockés uniquement dans le navigateur.
- Chaque journée est enregistrée dans `localStorage` sous la clé `ts:YYYY-MM-DD`.
- Les projets, groupes, couleurs et raccourcis globaux sont enregistrés sous la clé `ts:meta`.
- Aucun compte, backend applicatif ou suivi analytique n’est utilisé.

Effacer les données du site depuis les outils de développement du navigateur supprime définitivement les temps enregistrés sur cet appareil.

## Structure du projet

- `index.html` : structure de l’interface.
- `styles.css` : identité visuelle et mise en page responsive.
- `app.js` : saisie, calculs, stockage local, statistiques et exports.
