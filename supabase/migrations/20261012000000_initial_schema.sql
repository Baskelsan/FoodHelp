-- =============================================================================
-- Étape 1 : schéma initial + RLS
--
-- Tables de référence (globales, lecture seule) : units, ciqual_foods
-- Tables métier (une ligne = un utilisateur)     : aisles, ingredients, recipes,
--   recipe_ingredients, inventory_items, shopping_list_items
--
-- Nécessite Postgres 15+ (ON DELETE SET NULL (colonne)).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Trigger générique updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Référence : unités
-- Unités de base : g, ml, piece. Chaque unité lisible se convertit vers sa base
-- via to_base. Les conversions entre dimensions (ml -> g, piece -> g) dépendent
-- de l'ingrédient (density_g_per_ml, piece_weight_g).
-- -----------------------------------------------------------------------------
create table public.units (
  code         text primary key,
  label        text    not null,
  label_plural text    not null,
  base_unit    text    not null check (base_unit in ('g', 'ml', 'piece')),
  to_base      numeric not null check (to_base > 0),
  sort_order   integer not null default 0
);

insert into public.units (code, label, label_plural, base_unit, to_base, sort_order) values
  ('g',      'g',          'g',          'g',     1,    10),
  ('kg',     'kg',         'kg',         'g',     1000, 20),
  ('pincee', 'pincée',     'pincées',    'g',     0.4,  30),
  ('ml',     'ml',         'ml',         'ml',    1,    40),
  ('cl',     'cl',         'cl',         'ml',    10,   50),
  ('dl',     'dl',         'dl',         'ml',    100,  60),
  ('l',      'l',          'l',          'ml',    1000, 70),
  ('cc',     'c. à café',  'c. à café',  'ml',    5,    80),
  ('cs',     'c. à soupe', 'c. à soupe', 'ml',    15,   90),
  ('tasse',  'tasse',      'tasses',     'ml',    250,  100),
  ('verre',  'verre',      'verres',     'ml',    200,  110),
  ('piece',  'pièce',      'pièces',     'piece', 1,    120),
  ('gousse', 'gousse',     'gousses',    'piece', 1,    130),
  ('tranche','tranche',    'tranches',   'piece', 1,    140),
  ('sachet', 'sachet',     'sachets',    'piece', 1,    150),
  ('botte',  'botte',      'bottes',     'piece', 1,    160),
  ('boite',  'boîte',      'boîtes',     'piece', 1,    170)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Référence : table CIQUAL (ANSES), remplie à l'étape 6
-- -----------------------------------------------------------------------------
create table public.ciqual_foods (
  alim_code  integer primary key,
  name_fr    text    not null,
  group_name text,
  kcal_100g  numeric check (kcal_100g >= 0)
);

create index ciqual_foods_name_trgm_idx
  on public.ciqual_foods using gin (lower(name_fr) extensions.gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- Rayons du magasin (ordre propre à l'utilisateur)
-- -----------------------------------------------------------------------------
create table public.aisles (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  name       text        not null check (btrim(name) <> ''),
  position   integer     not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index aisles_user_name_key on public.aisles (user_id, lower(name));

-- -----------------------------------------------------------------------------
-- Ingrédients (catalogue personnel)
-- -----------------------------------------------------------------------------
create table public.ingredients (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  name             text        not null check (btrim(name) <> ''),
  default_unit     text        not null default 'g' references public.units (code),
  aisle_id         uuid,
  ciqual_code      integer     references public.ciqual_foods (alim_code) on delete set null,
  kcal_per_100g    numeric     check (kcal_per_100g >= 0),     -- surcharge manuelle de CIQUAL
  density_g_per_ml numeric     check (density_g_per_ml > 0),   -- conversion ml -> g
  piece_weight_g   numeric     check (piece_weight_g > 0),     -- conversion pièce -> g
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id),
  foreign key (aisle_id, user_id)
    references public.aisles (id, user_id) on delete set null (aisle_id)
);

create unique index ingredients_user_name_key on public.ingredients (user_id, lower(name));
create index ingredients_aisle_id_idx    on public.ingredients (aisle_id);
create index ingredients_ciqual_code_idx on public.ingredients (ciqual_code);

-- -----------------------------------------------------------------------------
-- Recettes
-- steps : tableau JSON ordonné, ex. [{"text": "...", "minutes": 10}]
-- -----------------------------------------------------------------------------
create table public.recipes (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  title        text        not null check (btrim(title) <> ''),
  description  text,
  servings     integer     not null default 2 check (servings > 0),
  prep_minutes integer     check (prep_minutes >= 0),
  cook_minutes integer     check (cook_minutes >= 0),
  steps        jsonb       not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  notes        text,
  source       text,
  tags         text[]      not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id)
);

create index recipes_user_id_idx on public.recipes (user_id);
create index recipes_tags_idx    on public.recipes using gin (tags);

-- -----------------------------------------------------------------------------
-- Ingrédients d'une recette
-- quantity NULL = « selon goût »
-- -----------------------------------------------------------------------------
create table public.recipe_ingredients (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  recipe_id     uuid        not null,
  ingredient_id uuid        not null,
  position      integer     not null default 0,
  quantity      numeric     check (quantity > 0),
  unit          text        references public.units (code),
  optional      boolean     not null default false,
  section       text,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (quantity is null or unit is not null),
  foreign key (recipe_id, user_id)
    references public.recipes (id, user_id) on delete cascade,
  foreign key (ingredient_id, user_id)
    references public.ingredients (id, user_id) on delete restrict
);

create index recipe_ingredients_recipe_idx     on public.recipe_ingredients (recipe_id, position);
create index recipe_ingredients_ingredient_idx on public.recipe_ingredients (ingredient_id);
create index recipe_ingredients_user_id_idx    on public.recipe_ingredients (user_id);

-- -----------------------------------------------------------------------------
-- Inventaire
-- -----------------------------------------------------------------------------
create table public.inventory_items (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  ingredient_id uuid        not null,
  quantity      numeric     check (quantity > 0),
  unit          text        references public.units (code),
  expires_on    date,
  date_type     text        check (date_type in ('DLC', 'DDM')),
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (quantity is null or unit is not null),
  check ((expires_on is null) = (date_type is null)),
  foreign key (ingredient_id, user_id)
    references public.ingredients (id, user_id) on delete cascade
);

create index inventory_items_user_expires_idx on public.inventory_items (user_id, expires_on);
create index inventory_items_ingredient_idx   on public.inventory_items (ingredient_id);

-- -----------------------------------------------------------------------------
-- Liste de courses
-- ingredient_id OU label libre (au moins l'un des deux)
-- -----------------------------------------------------------------------------
create table public.shopping_list_items (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  ingredient_id uuid,
  label         text,
  quantity      numeric     check (quantity > 0),
  unit          text        references public.units (code),
  checked       boolean     not null default false,
  recipe_id     uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ingredient_id is not null or btrim(coalesce(label, '')) <> ''),
  check (quantity is null or unit is not null),
  foreign key (ingredient_id, user_id)
    references public.ingredients (id, user_id) on delete cascade,
  foreign key (recipe_id, user_id)
    references public.recipes (id, user_id) on delete set null (recipe_id)
);

create index shopping_list_items_user_checked_idx on public.shopping_list_items (user_id, checked);
create index shopping_list_items_ingredient_idx   on public.shopping_list_items (ingredient_id);
create index shopping_list_items_recipe_idx       on public.shopping_list_items (recipe_id);

-- -----------------------------------------------------------------------------
-- Triggers updated_at
-- -----------------------------------------------------------------------------
create trigger set_updated_at before update on public.aisles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.ingredients
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.recipes
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.recipe_ingredients
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.inventory_items
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.shopping_list_items
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS : tables de référence (lecture seule pour les utilisateurs connectés)
-- -----------------------------------------------------------------------------
alter table public.units        enable row level security;
alter table public.ciqual_foods enable row level security;

create policy "units: lecture" on public.units
  for select to authenticated using (true);
create policy "ciqual_foods: lecture" on public.ciqual_foods
  for select to authenticated using (true);

-- -----------------------------------------------------------------------------
-- RLS : tables métier (chacun ne voit et ne modifie que ses lignes)
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'aisles', 'ingredients', 'recipes', 'recipe_ingredients',
    'inventory_items', 'shopping_list_items'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format(
      'create policy %I on public.%I for select to authenticated
         using ((select auth.uid()) = user_id)',
      t || ': lecture', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check ((select auth.uid()) = user_id)',
      t || ': création', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)',
      t || ': modification', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using ((select auth.uid()) = user_id)',
      t || ': suppression', t);

    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

revoke all on public.units, public.ciqual_foods from anon;
revoke insert, update, delete, truncate on public.units, public.ciqual_foods from authenticated;
grant select on public.units, public.ciqual_foods to authenticated;

commit;
