# Format d'import de recettes FoodHelp (version 1)

Format JSON utilisé par l'écran **Recettes → Importer**. Il est pensé pour être produit
par une conversation Claude (ou tout autre outil) puis collé tel quel dans l'app.

## Exemple

```json
{
  "format": "foodhelp",
  "version": 1,
  "recipes": [
    {
      "title": "Crêpes",
      "description": "Crêpes fines pour 4 personnes.",
      "servings": 4,
      "prep_minutes": 10,
      "cook_minutes": 20,
      "tags": ["dessert", "rapide"],
      "source": "Claude",
      "notes": "Laisser reposer la pâte 1 h.",
      "ingredients": [
        { "name": "farine de blé", "quantity": 250, "unit": "g" },
        { "name": "œuf", "quantity": 3, "unit": "piece", "piece_weight_g": 55 },
        { "name": "lait demi-écrémé", "quantity": 500, "unit": "ml", "density_g_per_ml": 1.03 },
        { "name": "beurre", "quantity": 2, "unit": "cs", "note": "fondu", "density_g_per_ml": 0.91 },
        { "name": "rhum", "quantity": 1, "unit": "cs", "optional": true },
        { "name": "sel", "quantity": null, "unit": null }
      ],
      "steps": [
        { "text": "Mélanger la farine et les œufs." },
        { "text": "Ajouter le lait petit à petit en fouettant." },
        { "text": "Cuire les crêpes à la poêle.", "minutes": 20 }
      ]
    }
  ]
}
```

## Champs

### Enveloppe

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `format` | `"foodhelp"` | non | Identifie le format. |
| `version` | entier | non | `1` pour ce document. |
| `recipes` | liste | oui | Une ou plusieurs recettes. |

L'app accepte aussi une recette seule (objet avec `title`) ou une liste de recettes sans enveloppe.

### Recette

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `title` | texte | **oui** | Titre de la recette. |
| `description` | texte | non | Courte présentation. |
| `servings` | entier ≥ 1 | non (2 par défaut) | Nombre de portions de la recette. |
| `prep_minutes` | entier ≥ 0 | non | Temps de préparation. |
| `cook_minutes` | entier ≥ 0 | non | Temps de cuisson. |
| `tags` | liste de textes | non | Mots-clés, mis en minuscules et dédoublonnés. |
| `source` | texte | non | Lien ou origine (ex. `"Claude"`). |
| `notes` | texte | non | Conseils, variantes, conservation. |
| `ingredients` | liste | non | Voir ci-dessous. |
| `steps` | liste | non | Étapes dans l'ordre : `{ "text": "…", "minutes": 10 }` (ou simple texte). |

### Ingrédient

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `name` | texte | **oui** | Nom **générique et réutilisable** (« œuf », « oignon jaune »). Sert à retrouver l'ingrédient dans le catalogue (sans tenir compte des majuscules). |
| `quantity` | nombre > 0 ou `null` | non | `null` = « selon goût » (non mis à l'échelle). |
| `unit` | code d'unité | si `quantity` | Voir la liste ci-dessous. |
| `optional` | booléen | non | Ingrédient facultatif. |
| `note` | texte | non | Précision de préparation (« coupé en dés », « fondu »). |
| `section` | texte | non | Sous-partie de la recette (« Pâte », « Garniture »). |
| `piece_weight_g` | nombre > 0 | non | Poids moyen d'une pièce en grammes. |
| `density_g_per_ml` | nombre > 0 | non | Densité, pour passer des ml aux grammes. |

`piece_weight_g` et `density_g_per_ml` complètent la fiche de l'ingrédient **uniquement si
elle n'a pas encore de valeur** : une donnée saisie à la main n'est jamais écrasée.
Elles permettent les conversions (ex. « j'ai 110 g d'œufs ») et le calcul des calories.

### Codes d'unité

| Code | Libellé | Équivalent |
|---|---|---|
| `g`, `kg` | g, kg | |
| `pincee` | pincée | 0,4 g |
| `ml`, `cl`, `dl`, `l` | ml, cl, dl, l | |
| `cc` | c. à café | 5 ml |
| `cs` | c. à soupe | 15 ml |
| `tasse` | tasse | 250 ml |
| `verre` | verre | 200 ml |
| `piece` | pièce | 1 pièce |
| `gousse`, `tranche`, `sachet`, `botte`, `boite` | | 1 pièce |

## Tolérances à l'import

L'app corrige automatiquement (avec un avertissement) :

- le texte autour du JSON et les blocs ```` ```json ````,
- les libellés d'unité courants : « c. à soupe », « cuillère à café », « grammes », `tbsp`, `tsp`, `cup`…,
- les quantités écrites en texte : `"1,5"`, `"1/2"`, `"1 1/2"`,
- une unité absente quand la quantité est donnée (comptée en pièces),
- un nombre de portions non entier (arrondi).

Sont bloquants : titre manquant, ingrédient sans nom, quantité illisible, unité inconnue.
Une recette dont le titre existe déjà est décochée par défaut pour éviter les doublons.

## Sauvegarde complète (`foodhelp-backup`)

L'écran **Compte → Sauvegarde** exporte un fichier `foodhelp-sauvegarde-AAAA-MM-JJ.json` :

```json
{
  "format": "foodhelp-backup",
  "version": 1,
  "exported_at": "2026-10-13T20:00:00.000Z",
  "recipes": [ "… recettes au format ci-dessus …" ],
  "ingredients": [
    { "name": "Œuf", "default_unit": "piece", "aisle": "Crèmerie", "ciqual_code": 22000,
      "kcal_per_100g": null, "density_g_per_ml": null, "piece_weight_g": 55 }
  ],
  "aisles": [ { "name": "Crèmerie", "position": 0 } ],
  "inventory": [
    { "ingredient": "Lait", "quantity": 1, "unit": "l", "expires_on": "2026-10-20",
      "date_type": "DLC", "note": null }
  ],
  "shopping_list": [ { "ingredient": "Œuf", "quantity": 6, "unit": "piece", "checked": false } ]
}
```

Les liens se font par nom d'ingrédient (pas d'identifiants internes). Aucune donnée de compte
n'est exportée. Le fichier est construit côté base par `private.build_backup`, utilisée à la
fois par l'app et par la sauvegarde automatique nocturne (`ops/backup-repo/`).

Restauration : **Compte → Restaurer une sauvegarde** fusionne le fichier avec les données
actuelles, en une seule transaction, sans rien supprimer ni écraser (les ingrédients existants
sont seulement complétés). Coller le fichier dans **Recettes → Importer** ne restaure que les
recettes.

## Instructions à donner à Claude

À coller dans les instructions du projet Claude « cuisine » (ou en début de conversation) :

```
Quand je te demande d'exporter une ou plusieurs recettes pour FoodHelp, réponds uniquement
avec un bloc JSON valide au format suivant, sans texte autour :

{"format":"foodhelp","version":1,"recipes":[{
  "title": string, "description": string|null, "servings": entier ≥ 1,
  "prep_minutes": entier|null, "cook_minutes": entier|null,
  "tags": [string en minuscules], "source": "Claude", "notes": string|null,
  "ingredients": [{
    "name": nom générique au singulier, en minuscules (ex. "œuf", "oignon jaune"),
    "quantity": nombre|null (null = selon goût),
    "unit": un code parmi g, kg, pincee, ml, cl, dl, l, cc, cs, tasse, verre, piece, gousse,
            tranche, sachet, botte, boite (null si quantity est null),
    "optional": true si facultatif (sinon omettre),
    "note": précision de préparation (ex. "coupé en dés") ou omettre,
    "section": sous-partie (ex. "Pâte", "Garniture") ou omettre,
    "piece_weight_g": poids moyen d'une pièce en grammes si unit est piece/gousse/tranche/...,
    "density_g_per_ml": densité si unit est un volume (ml, cl, cs, cc, tasse...)
  }],
  "steps": [{"text": string, "minutes": entier optionnel}]
}]}

Règles : quantités en nombres décimaux (0.5, pas "1/2"), unités métriques uniquement,
une étape = une action, pas de sel/poivre inventés. Pour la mise à l'échelle, privilégie
des quantités en g ou ml quand c'est naturel.
```
