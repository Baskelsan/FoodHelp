# Sauvegarde automatique FoodHelp

Ce dossier est le modèle du repo **privé** qui reçoit chaque nuit une sauvegarde complète
des données FoodHelp (`foodhelp-backup.json`, format décrit dans `docs/recipe-format.md`).

## Fonctionnement

- Le workflow `.github/workflows/backup.yml` appelle la fonction Supabase
  `export_backup(jeton)` avec la clé publique et un **jeton de sauvegarde**.
- Ce jeton ne donne qu'un accès en **lecture** aux données de son propriétaire. Supabase
  n'en garde que l'empreinte SHA-256 (table `private.backup_token`, non exposée par l'API).
  La clé `service_role` n'est jamais utilisée.
- Le fichier n'est commité que s'il a changé ; l'historique git conserve chaque version.
- Restauration : télécharger `foodhelp-backup.json` (bouton « Download raw file » sur
  GitHub), puis dans l'app : **Compte → Restaurer une sauvegarde**.

## Mise en place

1. Créer un repo **privé** vide sur GitHub (ex. `FoodHelp-backups`).
2. Y copier `.github/workflows/backup.yml`.
3. Générer le jeton dans le SQL Editor de Supabase (le résultat s'affiche une seule fois) :

   ```sql
   with t as (select encode(extensions.gen_random_bytes(32), 'hex') as token)
   insert into private.backup_token (user_id, token_hash)
   select u.id, encode(extensions.digest(t.token, 'sha256'), 'hex')
     from auth.users u, t
   on conflict (user_id) do update
     set token_hash = excluded.token_hash, created_at = now()
   returning (select token from t) as jeton_a_copier;
   ```

   Relancer la même requête génère un nouveau jeton et invalide l'ancien.
4. Dans le repo privé, **Settings → Secrets and variables → Actions**, créer :
   - `SUPABASE_URL` : `https://<projet>.supabase.co`
   - `SUPABASE_ANON_KEY` : la clé publique (anon / publishable)
   - `BACKUP_TOKEN` : le jeton de l'étape 3
5. **Actions → Sauvegarde FoodHelp → Run workflow** pour un premier essai.

En cas d'échec (Supabase en pause, jeton invalide…), GitHub envoie un email.
