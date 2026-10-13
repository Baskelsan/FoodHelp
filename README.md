# FoodHelp

Web app perso (PWA) : recettes, stock, liste de courses, calories.
En ligne : https://baskelsan.github.io/FoodHelp/

## Développement

```bash
npm install
cp .env.example .env.local   # puis remplir les valeurs Supabase
npm run dev                  # http://localhost:5173/FoodHelp/
```

- `npm run build` : vérification TypeScript + build de production dans `dist/`
- `npm run preview` : sert `dist/` en local (service worker actif)
- `npm test` : tests unitaires (vitest)

Les icônes PWA sont générées au build depuis `public/icon.svg`.

## Base de données

Migrations SQL dans `supabase/migrations/`, à coller dans le SQL Editor de Supabase.

### Table CIQUAL (calories)

`supabase/seed/ciqual_foods.csv` contient la table Ciqual 2025 de l'Anses
([source](https://doi.org/10.57745/RDMHWY), Licence Ouverte Etalab 2.0), à importer dans la
table `ciqual_foods` (Table Editor → Insert → Import data from CSV).

Pour la régénérer depuis une nouvelle version du fichier XLSX officiel :

```bash
python scripts/ciqual_to_csv.py "Table Ciqual 2025_FR_2025_11_03.xlsx" supabase/seed/ciqual_foods.csv
```

## Déploiement

Chaque push sur `main` déclenche `.github/workflows/deploy.yml` (build + GitHub Pages).
Secrets GitHub requis : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

## Maintenance automatique

- `.github/workflows/keepalive.yml` : appelle la fonction `ping()` de Supabase tous les 3 jours
  (les projets gratuits sont mis en pause après 7 jours sans activité). Se réactive lui-même
  pour ne pas être désactivé par GitHub après 60 jours sans commit.
- Sauvegarde nocturne dans un repo **privé** : voir [`ops/backup-repo/README.md`](ops/backup-repo/README.md).
  Elle utilise un jeton en lecture seule (jamais la clé `service_role`).
- Restauration : dans l'app, **Compte → Restaurer une sauvegarde** (fusion, rien n'est supprimé).
