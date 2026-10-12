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

## Déploiement

Chaque push sur `main` déclenche `.github/workflows/deploy.yml` (build + GitHub Pages).
Secrets GitHub requis : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
