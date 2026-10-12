# App Recettes — contexte projet

Web app perso (un seul utilisateur : moi) pour stocker mes recettes, gérer ce que j'ai en stock,
générer ma liste de courses et estimer les calories par portion.
Utilisation principale : **iPhone, depuis Safari, installée sur l'écran d'accueil (PWA)**.
Développement : PC Windows. Pas de Mac, pas d'App Store.

## Contrainte n°1 : 0 € de coûts
- Hébergement : GitHub Pages (site statique).
- Données : Supabase, offre gratuite.
- Pas d'API payante (pas d'API Claude/OpenAI dans l'app).
- Si une solution implique un coût, me le signaler avant de l'implémenter.

## Stack
- Vite + React + TypeScript.
- `@supabase/supabase-js` pour la base et l'authentification.
- `vite-plugin-pwa` pour le manifest et le service worker.
- CSS simple (ou Tailwind si ça simplifie vraiment). Pas de grosse librairie UI.
- Déploiement via GitHub Action vers GitHub Pages (attention au `base` de Vite = nom du repo).

## Variables d'environnement
- `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans `.env.local` (jamais commité) et en secrets GitHub pour le build.
- La clé `anon` est publique par nature : la sécurité repose sur les règles RLS.
- **Ne jamais utiliser ni demander la clé `service_role` dans le front.**

## Authentification
- Supabase Auth par **code OTP à 6 chiffres envoyé par email** (pas de lien magique).
  Raison : sur iOS, un lien magique s'ouvre dans Safari et non dans la PWA installée,
  la session ne serait donc pas partagée avec l'app de l'écran d'accueil.
- Session persistante pour ne pas avoir à se reconnecter souvent.

## Données (Supabase / Postgres)
- Toutes les tables métier ont une colonne `user_id uuid` référencée sur `auth.users`, avec valeur par défaut `auth.uid()`.
- **RLS activée sur toutes les tables**, politique : l'utilisateur ne lit/écrit que ses lignes (`user_id = auth.uid()`).
- Le schéma est versionné dans `supabase/migrations/*.sql` (fichiers SQL que je colle dans l'éditeur SQL Supabase ou que j'applique avec la CLI).
- Unités normalisées : `g`, `ml`, `piece` (+ libellés lisibles côté UI : pincée, c. à soupe, etc. convertis si possible).
- Tables prévues (à affiner à l'étape 1) :
  - `ingredients` : catalogue d'ingrédients (nom, unité par défaut, rayon du magasin, lien optionnel vers CIQUAL, kcal/100 g ou 100 ml).
  - `recipes` : titre, description, portions de base, étapes (JSON ordonné), notes, tags.
  - `recipe_ingredients` : recette, ingrédient, quantité, unité, facultatif (bool).
  - `inventory_items` : ingrédient, quantité (optionnelle), date, type de date (`DLC` | `DDM`).
  - `shopping_list_items` : ingrédient, quantité, coché (bool), recette d'origine (optionnelle).
- Calories : table de référence `ciqual_foods` (lecture seule, partagée) importée depuis la table CIQUAL de l'ANSES.

## Fonctionnalités V1
1. Recettes : créer, modifier, lister, rechercher.
2. Mise à l'échelle : par nombre de portions OU à partir d'un ingrédient limitant
   (ex. « j'ai 425 ml de lait » ou « j'ai 2 œufs » → recalcul de toute la recette).
3. Inventaire : ce que j'ai, avec date DLC/DDM optionnelle et mise en avant de ce qui approche.
4. Liste de courses : générée depuis une ou plusieurs recettes, moins l'inventaire, regroupée par rayon, cochable au magasin.
5. Calories par portion calculées depuis CIQUAL.
6. Import de recettes en JSON (format défini dans `docs/recipe-format.md`), pour coller des fiches générées ailleurs.
7. Export complet en JSON (sauvegarde manuelle).

## Plus tard (V2+) — ne pas implémenter sans que je le demande
- Planning de repas de la semaine.
- Macros (protéines, glucides, lipides).
- Scan de code-barres (ZXing) + Open Food Facts.
- « Qu'est-ce que je peux cuisiner avec ce que j'ai ? »
- Notifications push pour les dates de péremption.
- Mode hors ligne avancé (édition hors ligne + synchro).

## Mode hors ligne V1
- L'app shell est mise en cache par le service worker.
- La dernière liste de courses est gardée en cache local pour être consultable sans réseau au supermarché.

## Contraintes iPhone / UI
- Mobile-first, pensé pour une main, gros boutons.
- `viewport-fit=cover` + gestion des safe areas (encoche, barre du bas).
- Champs de saisie en `font-size: 16px` minimum (sinon iOS zoome).
- `apple-touch-icon`, `display: standalone`, thème clair/sombre selon le système.
- Interface **en français**.

## Maintenance (gratuite)
- GitHub Action planifiée qui envoie une petite requête à Supabase tous les 3 jours pour éviter la mise en pause (projets gratuits en pause après 7 jours d'inactivité).
- GitHub Action de sauvegarde : export des données vers un repo privé (à faire en fin de V1).

## Méthode de travail
- Avancer **étape par étape**, une étape = un commit propre.
- Avant de coder une étape, proposer un plan court et attendre ma validation.
- Ne pas ajouter de dépendance sans dire pourquoi.
- Pas de données de test réelles commitées ; pas de secrets dans le repo.
- Quand une action est à faire de mon côté (dashboard Supabase, réglages GitHub), me donner les étapes précises plutôt que de deviner.

## Étapes prévues
1. Schéma Supabase + RLS (migrations SQL).
2. Squelette PWA (Vite + React + TS + vite-plugin-pwa) + déploiement GitHub Pages.
3. Authentification par code OTP.
4. Recettes (CRUD + mise à l'échelle).
5. Inventaire + liste de courses.
6. Import CIQUAL + calcul des calories.
7. Import/export JSON.
8. GitHub Actions anti-pause et sauvegarde.
