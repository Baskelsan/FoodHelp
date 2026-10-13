-- =============================================================================
-- Étape 8 : anti-pause, sauvegarde automatique et restauration
--
-- public.ping()                 -> appelée tous les 3 jours par GitHub Actions pour
--                                  éviter la mise en pause du projet (aucune donnée).
-- public.export_my_backup()     -> sauvegarde complète de l'utilisateur connecté (app).
-- public.export_backup(jeton)   -> même sauvegarde, pour le workflow de sauvegarde
--                                  nocturne : lecture seule, protégée par un jeton
--                                  dont seule l'empreinte SHA-256 est stockée.
-- public.restore_backup(jsonb)  -> fusionne une sauvegarde dans les données de
--                                  l'utilisateur connecté, sans rien supprimer ni
--                                  écraser, en une seule transaction.
--
-- Format produit : « foodhelp-backup » version 1 (voir docs/recipe-format.md).
-- =============================================================================

begin;

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Schéma privé : jamais exposé par l'API (seul « public » l'est)
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.backup_token (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now()
);
alter table private.backup_token enable row level security;
revoke all on private.backup_token from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Anti-pause
-- -----------------------------------------------------------------------------
create or replace function public.ping()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select now()
$$;

revoke execute on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Construction de la sauvegarde (source unique du format)
-- security invoker : sous RLS quand l'utilisateur l'appelle ; filtre de plus
-- explicitement sur p_uid (indispensable quand export_backup l'appelle).
-- -----------------------------------------------------------------------------
create or replace function private.build_backup(p_uid uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'format', 'foodhelp-backup',
    'version', 1,
    'exported_at', to_jsonb(now()),
    'recipes', coalesce((
      select jsonb_agg(
               -- champs vides omis : même forme que le format d'import
               jsonb_strip_nulls(jsonb_build_object(
                 'title', r.title,
                 'description', nullif(r.description, ''),
                 'servings', r.servings,
                 'prep_minutes', r.prep_minutes,
                 'cook_minutes', r.cook_minutes,
                 'tags', to_jsonb(r.tags),
                 'source', nullif(r.source, ''),
                 'notes', nullif(r.notes, ''),
                 'ingredients', coalesce((
                   select jsonb_agg(
                            jsonb_build_object(
                              'name', i.name,
                              'quantity', ri.quantity,
                              'unit', case when ri.quantity is null then null else ri.unit end,
                              'optional', case when ri.optional then true end,
                              'note', nullif(ri.note, ''),
                              'section', nullif(ri.section, ''),
                              'piece_weight_g', i.piece_weight_g,
                              'density_g_per_ml', i.density_g_per_ml
                            )
                            order by ri.position)
                     from public.recipe_ingredients ri
                     join public.ingredients i on i.id = ri.ingredient_id
                    where ri.recipe_id = r.id and ri.user_id = p_uid
                 ), '[]'::jsonb),
                 'steps', r.steps
               ))
               order by r.title, r.created_at)
        from public.recipes r
       where r.user_id = p_uid
    ), '[]'::jsonb),
    'ingredients', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'name', i.name,
                 'default_unit', i.default_unit,
                 'aisle', a.name,
                 'ciqual_code', i.ciqual_code,
                 'kcal_per_100g', i.kcal_per_100g,
                 'density_g_per_ml', i.density_g_per_ml,
                 'piece_weight_g', i.piece_weight_g
               )
               order by lower(i.name))
        from public.ingredients i
        left join public.aisles a on a.id = i.aisle_id
       where i.user_id = p_uid
    ), '[]'::jsonb),
    'aisles', coalesce((
      select jsonb_agg(jsonb_build_object('name', a.name, 'position', a.position)
                       order by a.position, lower(a.name))
        from public.aisles a
       where a.user_id = p_uid
    ), '[]'::jsonb),
    'inventory', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'ingredient', i.name,
                 'quantity', v.quantity,
                 'unit', v.unit,
                 'expires_on', v.expires_on,
                 'date_type', v.date_type,
                 'note', v.note
               )
               order by lower(i.name), v.expires_on nulls last, v.created_at)
        from public.inventory_items v
        join public.ingredients i on i.id = v.ingredient_id
       where v.user_id = p_uid
    ), '[]'::jsonb),
    'shopping_list', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'ingredient', coalesce(i.name, s.label, '?'),
                 'quantity', s.quantity,
                 'unit', s.unit,
                 'checked', s.checked
               )
               order by s.created_at)
        from public.shopping_list_items s
        left join public.ingredients i on i.id = s.ingredient_id
       where s.user_id = p_uid
    ), '[]'::jsonb)
  )
$$;

revoke execute on function private.build_backup(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.build_backup(uuid) to authenticated;

-- Sauvegarde de l'utilisateur connecté (écran Compte > Sauvegarde)
create or replace function public.export_my_backup()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Non authentifié' using errcode = '42501';
  end if;
  return private.build_backup(auth.uid());
end;
$$;

revoke execute on function public.export_my_backup() from public, anon;
grant execute on function public.export_my_backup() to authenticated;

-- Sauvegarde par jeton (workflow GitHub) : security definer pour lire sans
-- session, mais uniquement les données du propriétaire du jeton.
create or replace function public.export_backup(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'Jeton invalide' using errcode = '28000';
  end if;
  select t.user_id into v_uid
    from private.backup_token t
   where t.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if v_uid is null then
    raise exception 'Jeton invalide' using errcode = '28000';
  end if;
  return private.build_backup(v_uid);
end;
$$;

revoke execute on function public.export_backup(text) from public;
grant execute on function public.export_backup(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Restauration (fusion) — security invoker : sous RLS, données de l'appelant
-- -----------------------------------------------------------------------------

-- Ingrédient de l'utilisateur par nom (sans casse), créé s'il n'existe pas
create or replace function private.ingredient_for(p_name text, p_default_unit text default 'g')
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_unit text;
begin
  select id into v_id
    from public.ingredients
   where user_id = auth.uid() and lower(name) = lower(btrim(p_name));
  if v_id is null then
    select code into v_unit from public.units where code = p_default_unit;
    insert into public.ingredients (name, default_unit)
    values (btrim(p_name), coalesce(v_unit, 'g'))
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

revoke execute on function private.ingredient_for(text, text) from public, anon;
grant execute on function private.ingredient_for(text, text) to authenticated;

create or replace function public.restore_backup(p_backup jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_item        jsonb;
  v_name        text;
  v_id          uuid;
  v_aisle_id    uuid;
  v_ciqual      integer;
  v_unit        text;
  n_aisles      integer := 0;
  n_created     integer := 0;
  n_completed   integer := 0;
  n_recipes     integer := 0;
  n_inventory   integer := 0;
  n_shopping    integer := 0;
  v_count       integer;
begin
  if v_uid is null then
    raise exception 'Non authentifié' using errcode = '42501';
  end if;
  if coalesce(p_backup->>'format', '') <> 'foodhelp-backup' then
    raise exception 'Ce fichier n''est pas une sauvegarde FoodHelp' using errcode = '22023';
  end if;

  -- 1. Rayons manquants
  for v_item in select value from jsonb_array_elements(coalesce(p_backup->'aisles', '[]'::jsonb)) loop
    v_name := btrim(v_item->>'name');
    continue when v_name is null or v_name = '';
    if not exists (
      select 1 from public.aisles where user_id = v_uid and lower(name) = lower(v_name)
    ) then
      insert into public.aisles (name, position)
      values (v_name, coalesce((v_item->>'position')::integer, 0));
      n_aisles := n_aisles + 1;
    end if;
  end loop;

  -- 2. Ingrédients : créés s'ils manquent, sinon seulement complétés
  for v_item in select value from jsonb_array_elements(coalesce(p_backup->'ingredients', '[]'::jsonb)) loop
    v_name := btrim(v_item->>'name');
    continue when v_name is null or v_name = '';

    select id into v_aisle_id
      from public.aisles
     where user_id = v_uid and lower(name) = lower(btrim(v_item->>'aisle'));
    select alim_code into v_ciqual
      from public.ciqual_foods
     where alim_code = (v_item->>'ciqual_code')::integer;
    select code into v_unit from public.units where code = v_item->>'default_unit';

    select id into v_id
      from public.ingredients
     where user_id = v_uid and lower(name) = lower(v_name);

    if v_id is null then
      insert into public.ingredients
        (name, default_unit, aisle_id, ciqual_code, kcal_per_100g, density_g_per_ml, piece_weight_g)
      values (
        v_name,
        coalesce(v_unit, 'g'),
        v_aisle_id,
        v_ciqual,
        (v_item->>'kcal_per_100g')::numeric,
        (v_item->>'density_g_per_ml')::numeric,
        (v_item->>'piece_weight_g')::numeric
      );
      n_created := n_created + 1;
    else
      update public.ingredients set
        aisle_id         = coalesce(aisle_id, v_aisle_id),
        ciqual_code      = coalesce(ciqual_code, v_ciqual),
        kcal_per_100g    = coalesce(kcal_per_100g, (v_item->>'kcal_per_100g')::numeric),
        density_g_per_ml = coalesce(density_g_per_ml, (v_item->>'density_g_per_ml')::numeric),
        piece_weight_g   = coalesce(piece_weight_g, (v_item->>'piece_weight_g')::numeric)
      where id = v_id
        and (
          (aisle_id is null and v_aisle_id is not null)
          or (ciqual_code is null and v_ciqual is not null)
          or (kcal_per_100g is null and v_item->>'kcal_per_100g' is not null)
          or (density_g_per_ml is null and v_item->>'density_g_per_ml' is not null)
          or (piece_weight_g is null and v_item->>'piece_weight_g' is not null)
        );
      get diagnostics v_count = row_count;
      n_completed := n_completed + v_count;
    end if;
  end loop;

  -- 3. Recettes (toujours créées : le choix des doublons est fait dans l'app)
  for v_item in select value from jsonb_array_elements(coalesce(p_backup->'recipes', '[]'::jsonb)) loop
    perform public.save_recipe(v_item - 'id');
    n_recipes := n_recipes + 1;
  end loop;

  -- 4. Stock
  for v_item in select value from jsonb_array_elements(coalesce(p_backup->'inventory', '[]'::jsonb)) loop
    v_name := btrim(v_item->>'ingredient');
    continue when v_name is null or v_name = '';
    insert into public.inventory_items (ingredient_id, quantity, unit, expires_on, date_type, note)
    values (
      private.ingredient_for(v_name, v_item->>'unit'),
      (v_item->>'quantity')::numeric,
      nullif(v_item->>'unit', ''),
      (v_item->>'expires_on')::date,
      nullif(v_item->>'date_type', ''),
      nullif(btrim(v_item->>'note'), '')
    );
    n_inventory := n_inventory + 1;
  end loop;

  -- 5. Liste de courses
  for v_item in select value from jsonb_array_elements(coalesce(p_backup->'shopping_list', '[]'::jsonb)) loop
    v_name := btrim(v_item->>'ingredient');
    continue when v_name is null or v_name = '';
    insert into public.shopping_list_items (ingredient_id, quantity, unit, checked)
    values (
      private.ingredient_for(v_name, v_item->>'unit'),
      (v_item->>'quantity')::numeric,
      nullif(v_item->>'unit', ''),
      coalesce((v_item->>'checked')::boolean, false)
    );
    n_shopping := n_shopping + 1;
  end loop;

  return jsonb_build_object(
    'aisles', n_aisles,
    'ingredients_created', n_created,
    'ingredients_completed', n_completed,
    'recipes', n_recipes,
    'inventory', n_inventory,
    'shopping_list', n_shopping
  );
end;
$$;

revoke execute on function public.restore_backup(jsonb) from public, anon;
grant execute on function public.restore_backup(jsonb) to authenticated;

commit;
