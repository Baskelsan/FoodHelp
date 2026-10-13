-- =============================================================================
-- Étape 6 : recherche dans la table CIQUAL
--
-- search_ciqual(texte, limite)  -> aliments CIQUAL correspondants, les plus
--   pertinents d'abord (insensible aux accents, à la casse et au pluriel :
--   « creme » trouve « Crème », « oeufs » trouve « Oeuf cru »).
-- suggest_ciqual(noms[], n)     -> les n meilleures correspondances pour chaque nom
--   (propositions automatiques pour relier les ingrédients).
--
-- Les données de ciqual_foods s'importent depuis supabase/seed/ciqual_foods.csv.
-- =============================================================================

begin;

create extension if not exists unaccent with schema extensions;

-- Forme normalisée d'un texte pour la recherche : minuscules, sans accents.
-- Le dictionnaire est nommé explicitement : search_path est vide dans ces fonctions.
create or replace function public.ciqual_normalize(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_text, '')))
$$;

create or replace function public.search_ciqual(p_query text, p_limit integer default 20)
returns setof public.ciqual_foods
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    -- Mots significatifs : séparés par tout ce qui n'est pas lettre ou chiffre
    -- (« d'ail » -> « ail »), sans le s / x du pluriel (« lardons » -> « lardon »)
    select array_to_string(
             array(
               select regexp_replace(w, '(.{3,})[sx]$', '\1')
                 from regexp_split_to_table(t.accented, '[^[:alnum:]]+') as w
                where length(w) > 1
             ),
             ' '
           ) as accented,
           array(
             select regexp_replace(w, '(.{3,})[sx]$', '\1')
               from regexp_split_to_table(t.plain, '[^a-z0-9]+') as w
              where length(w) > 1
           ) as words
      from (
        select lower(btrim(coalesce(p_query, ''))) as accented,
               public.ciqual_normalize(btrim(p_query)) as plain
      ) as t
  ),
  terms as (
    select q.words, q.accented, array_to_string(q.words, ' ') as term from q
  ),
  scored as (
    select f.*,
           t.term,
           public.ciqual_normalize(f.name_fr) as norm,
           coalesce(
             (select bool_and(strpos(public.ciqual_normalize(f.name_fr), w) > 0)
                from unnest(t.words) as w),
             false
           ) as all_words,
           extensions.word_similarity(t.term, public.ciqual_normalize(f.name_fr)) as similarity,
           -- Avec les accents : départage « pâtes » / « pâté »
           extensions.word_similarity(t.accented, lower(f.name_fr)) as accented_similarity
      from public.ciqual_foods f, terms t
     where t.term <> ''
  )
  select s.alim_code, s.name_fr, s.group_name, s.kcal_100g
    from scored s
   where s.all_words or s.similarity >= 0.6
   order by
     -- 1. contient tous les mots cherchés
     s.all_words desc,
     -- 2. commence par le texte cherché, en mots entiers, au singulier ou au pluriel
     (s.norm ~ ('^' || replace(s.term, ' ', '[sx]?\W+') || '[sx]?\M')) desc,
     -- 3. plats composés en dernier (« sel au céleri », « pâtes à la bolognaise »)
     (s.norm ~ '^\S+(\s\S+)?\s(au|aux|a la|a l|avec|en)\s') asc,
     -- 4. ressemblance, d'abord avec les accents, puis sans
     s.accented_similarity desc,
     s.similarity desc,
     -- 5. « aliment moyen » : la référence générique de CIQUAL
     (s.norm like '%aliment moyen%') desc,
     -- 6. à égalité, l'aliment cru (forme la plus courante dans une recette)
     (s.norm ~ '\mcru(e|s|es)?\M') desc,
     -- 7. les noms courts (moins spécifiques) d'abord
     length(s.name_fr)
   limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

create or replace function public.suggest_ciqual(p_names text[], p_per_name integer default 3)
returns table (query text, rank integer, alim_code integer, name_fr text, kcal_100g numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select n.name, s.rank::integer, s.alim_code, s.name_fr, s.kcal_100g
    from unnest(p_names) as n(name)
    cross join lateral public.search_ciqual(n.name, p_per_name)
      with ordinality as s(alim_code, name_fr, group_name, kcal_100g, rank)
   order by n.name, s.rank
$$;

revoke execute on function public.ciqual_normalize(text) from public, anon;
revoke execute on function public.search_ciqual(text, integer) from public, anon;
revoke execute on function public.suggest_ciqual(text[], integer) from public, anon;
grant execute on function public.ciqual_normalize(text) to authenticated;
grant execute on function public.search_ciqual(text, integer) to authenticated;
grant execute on function public.suggest_ciqual(text[], integer) to authenticated;

commit;
