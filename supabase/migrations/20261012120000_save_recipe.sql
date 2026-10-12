-- =============================================================================
-- Étape 4 : enregistrement atomique d'une recette
--
-- save_recipe(p_recipe jsonb) -> uuid
--   Crée (sans "id") ou met à jour (avec "id") une recette et remplace toutes ses
--   lignes d'ingrédients, en une seule transaction. Les ingrédients inconnus du
--   catalogue sont créés (recherche par nom, insensible à la casse).
--
-- Format attendu :
-- {
--   "id": "uuid" | null,
--   "title": "…", "description": "…", "servings": 4,
--   "prep_minutes": 10, "cook_minutes": 20,
--   "steps": [{"text": "…"}], "notes": "…", "source": "…", "tags": ["…"],
--   "ingredients": [
--     {"name": "Lait", "quantity": 500, "unit": "ml", "optional": false,
--      "section": null, "note": null}
--   ]
-- }
--
-- security invoker : s'exécute avec les droits de l'appelant, la RLS s'applique.
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

    select id into v_ingredient_id
      from public.ingredients
     where user_id = v_uid and lower(name) = lower(v_name);

    if v_ingredient_id is null then
      insert into public.ingredients (name, default_unit)
      values (v_name, coalesce(v_unit, 'g'))
      returning id into v_ingredient_id;
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
