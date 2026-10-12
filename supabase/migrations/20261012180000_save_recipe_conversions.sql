-- =============================================================================
-- Import de recettes : save_recipe accepte les données de conversion
--
-- Chaque ingrédient peut maintenant porter "piece_weight_g" et/ou
-- "density_g_per_ml" (ex. fournis par un export Claude). Ils complètent la fiche
-- de l'ingrédient uniquement si elle n'a pas encore de valeur : on n'écrase
-- jamais une donnée saisie à la main.
--
-- Le reste du comportement est identique à 20261012120000_save_recipe.sql.
-- =============================================================================

begin;

create or replace function public.save_recipe(p_recipe jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid           uuid := auth.uid();
  v_id            uuid := nullif(p_recipe->>'id', '')::uuid;
  v_tags          text[];
  v_item          jsonb;
  v_name          text;
  v_unit          text;
  v_piece_weight  numeric;
  v_density       numeric;
  v_ingredient_id uuid;
  v_position      integer := 0;
begin
  if v_uid is null then
    raise exception 'Non authentifié' using errcode = '42501';
  end if;

  select coalesce(array_agg(btrim(t)), '{}')
    into v_tags
    from jsonb_array_elements_text(coalesce(p_recipe->'tags', '[]'::jsonb)) as t
   where btrim(t) <> '';

  if v_id is null then
    insert into public.recipes
      (title, description, servings, prep_minutes, cook_minutes, steps, notes, source, tags)
    values (
      btrim(p_recipe->>'title'),
      nullif(btrim(p_recipe->>'description'), ''),
      coalesce((p_recipe->>'servings')::integer, 2),
      (p_recipe->>'prep_minutes')::integer,
      (p_recipe->>'cook_minutes')::integer,
      coalesce(p_recipe->'steps', '[]'::jsonb),
      nullif(btrim(p_recipe->>'notes'), ''),
      nullif(btrim(p_recipe->>'source'), ''),
      v_tags
    )
    returning id into v_id;
  else
    update public.recipes set
      title        = btrim(p_recipe->>'title'),
      description  = nullif(btrim(p_recipe->>'description'), ''),
      servings     = coalesce((p_recipe->>'servings')::integer, 2),
      prep_minutes = (p_recipe->>'prep_minutes')::integer,
      cook_minutes = (p_recipe->>'cook_minutes')::integer,
      steps        = coalesce(p_recipe->'steps', '[]'::jsonb),
      notes        = nullif(btrim(p_recipe->>'notes'), ''),
      source       = nullif(btrim(p_recipe->>'source'), ''),
      tags         = v_tags
    where id = v_id;

    if not found then
      raise exception 'Recette introuvable' using errcode = 'P0002';
    end if;

    delete from public.recipe_ingredients where recipe_id = v_id;
  end if;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_recipe->'ingredients', '[]'::jsonb))
  loop
    v_name := btrim(v_item->>'name');
    continue when v_name is null or v_name = '';
    v_unit := nullif(v_item->>'unit', '');
    v_piece_weight := (v_item->>'piece_weight_g')::numeric;
    v_density := (v_item->>'density_g_per_ml')::numeric;

    select id into v_ingredient_id
      from public.ingredients
     where user_id = v_uid and lower(name) = lower(v_name);

    if v_ingredient_id is null then
      insert into public.ingredients (name, default_unit, piece_weight_g, density_g_per_ml)
      values (v_name, coalesce(v_unit, 'g'), v_piece_weight, v_density)
      returning id into v_ingredient_id;
    elsif v_piece_weight is not null or v_density is not null then
      -- Complète sans écraser
      update public.ingredients set
        piece_weight_g   = coalesce(piece_weight_g, v_piece_weight),
        density_g_per_ml = coalesce(density_g_per_ml, v_density)
      where id = v_ingredient_id
        and (piece_weight_g is null or density_g_per_ml is null);
    end if;

    insert into public.recipe_ingredients
      (recipe_id, ingredient_id, position, quantity, unit, optional, section, note)
    values (
      v_id,
      v_ingredient_id,
      v_position,
      (v_item->>'quantity')::numeric,
      v_unit,
      coalesce((v_item->>'optional')::boolean, false),
      nullif(btrim(v_item->>'section'), ''),
      nullif(btrim(v_item->>'note'), '')
    );
    v_position := v_position + 1;
  end loop;

  return v_id;
end;
$$;

revoke execute on function public.save_recipe(jsonb) from public, anon;
grant execute on function public.save_recipe(jsonb) to authenticated;

commit;
