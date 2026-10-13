import type {
  Aisle,
  CiqualFood,
  Ingredient,
  IngredientSummary,
  InventoryItem,
  RecipeListEntry,
  RecipeSummary,
  RecipeWithIngredients,
  SaveRecipePayload,
  ShoppingListItem,
  Unit,
} from './db-types.ts'
import type { FoodhelpBackup, RestoreSummary, restorePayload } from './backup.ts'
import { supabase } from './supabase.ts'

/** Message lisible pour une erreur Supabase ou réseau. */
export function describeError(error: unknown): string {
  if (error instanceof TypeError) return 'Impossible de joindre le serveur. Vérifie ta connexion.'
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String(error.message)
    if (message.includes('Failed to fetch') || message.includes('Load failed')) {
      return 'Impossible de joindre le serveur. Vérifie ta connexion.'
    }
    return message
  }
  return 'Une erreur inattendue est survenue.'
}

// Les unités ne changent pas : chargées une seule fois par session
let unitsPromise: Promise<Unit[]> | null = null

export function fetchUnits(): Promise<Unit[]> {
  unitsPromise ??= (async () => {
    const { data, error } = await supabase.from('units').select('*').order('sort_order')
    if (error) {
      unitsPromise = null
      throw error
    }
    return data as Unit[]
  })()
  return unitsPromise
}

export async function listRecipes(): Promise<RecipeSummary[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('id, title, tags, servings, prep_minutes, cook_minutes, created_at')
    .order('title')
  if (error) throw error
  return data as RecipeSummary[]
}

/** Champs d'un ingrédient utiles au calcul des calories */
const NUTRITION_REF = 'density_g_per_ml, piece_weight_g, kcal_per_100g, ciqual_code, ciqual:ciqual_foods ( kcal_100g, name_fr )'

/** Recettes de la liste, avec leurs ingrédients pour calculer les calories. */
export async function listRecipeEntries(): Promise<RecipeListEntry[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select(
      `id, title, tags, servings, prep_minutes, cook_minutes, created_at,
       recipe_ingredients ( quantity, unit, optional, ingredient:ingredients ( name, ${NUTRITION_REF} ) )`,
    )
    .order('title')
  if (error) throw error
  return data as unknown as RecipeListEntry[]
}

export async function getRecipe(id: string): Promise<RecipeWithIngredients | null> {
  const { data, error } = await supabase
    .from('recipes')
    .select(
      `*, recipe_ingredients (
        id, position, quantity, unit, optional, section, note,
        ingredient:ingredients ( id, name, default_unit, ${NUTRITION_REF} )
      )`,
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const recipe = data as RecipeWithIngredients
  recipe.recipe_ingredients.sort((a, b) => a.position - b.position)
  return recipe
}

export async function listIngredients(): Promise<IngredientSummary[]> {
  const { data, error } = await supabase
    .from('ingredients')
    .select('id, name, default_unit')
    .order('name')
  if (error) throw error
  return data as IngredientSummary[]
}

/** Crée ou met à jour une recette et ses ingrédients en une transaction. */
export async function saveRecipe(payload: SaveRecipePayload): Promise<string> {
  const { data, error } = await supabase.rpc('save_recipe', { p_recipe: payload })
  if (error) throw error
  return data as string
}

export async function deleteRecipe(id: string): Promise<void> {
  const { error } = await supabase.from('recipes').delete().eq('id', id)
  if (error) throw error
}

// --- Ingrédients ---------------------------------------------------------------

const INGREDIENT_REF = 'id, name, default_unit, aisle_id, density_g_per_ml, piece_weight_g'

export async function getIngredient(id: string): Promise<Ingredient | null> {
  const { data, error } = await supabase.from('ingredients').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as Ingredient | null
}

export async function updateIngredient(
  id: string,
  patch: Partial<Omit<Ingredient, 'id'>>,
): Promise<void> {
  const { error } = await supabase.from('ingredients').update(patch).eq('id', id)
  if (error) throw error
}

/** Retrouve un ingrédient du catalogue par nom (sans casse), ou le crée. */
export async function findOrCreateIngredient(
  name: string,
  defaultUnit: string,
  catalog: IngredientSummary[],
): Promise<IngredientSummary> {
  const clean = name.trim()
  const known = catalog.find((c) => c.name.toLowerCase() === clean.toLowerCase())
  if (known) return known
  const { data, error } = await supabase
    .from('ingredients')
    .insert({ name: clean, default_unit: defaultUnit })
    .select('id, name, default_unit')
    .single()
  if (error) {
    // Créé entre-temps (catalogue pas à jour) : on le relit
    if (error.code === '23505') {
      const fresh = await listIngredients()
      const found = fresh.find((c) => c.name.toLowerCase() === clean.toLowerCase())
      if (found) return found
    }
    throw error
  }
  return data as IngredientSummary
}

// --- Rayons ---------------------------------------------------------------------

export const DEFAULT_AISLES = [
  'Fruits et légumes',
  'Boulangerie',
  'Boucherie / Poissonnerie',
  'Crèmerie',
  'Épicerie salée',
  'Épicerie sucrée',
  'Surgelés',
  'Boissons',
  'Hygiène / Maison',
]

let defaultsPromise: Promise<void> | null = null

/** Crée les rayons par défaut si l'utilisateur n'en a aucun (une fois par session). */
function ensureDefaultAisles(): Promise<void> {
  defaultsPromise ??= (async () => {
    const { count, error } = await supabase
      .from('aisles')
      .select('id', { count: 'exact', head: true })
    if (error) throw error
    if (count) return
    const { error: insertError } = await supabase
      .from('aisles')
      .insert(DEFAULT_AISLES.map((name, position) => ({ name, position })))
    // 23505 : déjà créés depuis un autre appareil
    if (insertError && insertError.code !== '23505') throw insertError
  })().catch((e) => {
    defaultsPromise = null
    throw e
  })
  return defaultsPromise
}

export async function listAisles(): Promise<Aisle[]> {
  await ensureDefaultAisles()
  const { data, error } = await supabase
    .from('aisles')
    .select('id, name, position')
    .order('position')
    .order('name')
  if (error) throw error
  return data as Aisle[]
}

export async function createAisle(name: string, position: number): Promise<void> {
  const { error } = await supabase.from('aisles').insert({ name: name.trim(), position })
  if (error) throw error
}

export async function updateAisle(id: string, patch: Partial<Omit<Aisle, 'id'>>): Promise<void> {
  const { error } = await supabase.from('aisles').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteAisle(id: string): Promise<void> {
  const { error } = await supabase.from('aisles').delete().eq('id', id)
  if (error) throw error
}

// --- Stock ----------------------------------------------------------------------

const INVENTORY_SELECT = `id, ingredient_id, quantity, unit, expires_on, date_type, note, created_at,
  ingredient:ingredients ( ${INGREDIENT_REF} )`

export async function listInventory(): Promise<InventoryItem[]> {
  const { data, error } = await supabase.from('inventory_items').select(INVENTORY_SELECT)
  if (error) throw error
  return data as unknown as InventoryItem[]
}

export async function getInventoryItem(id: string): Promise<InventoryItem | null> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select(INVENTORY_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data as unknown as InventoryItem | null
}

export type InventoryInput = Pick<
  InventoryItem,
  'ingredient_id' | 'quantity' | 'unit' | 'expires_on' | 'date_type' | 'note'
>

export async function addInventoryItems(items: Partial<InventoryInput>[]): Promise<void> {
  if (items.length === 0) return
  const { error } = await supabase.from('inventory_items').insert(items)
  if (error) throw error
}

export async function updateInventoryItem(id: string, patch: InventoryInput): Promise<void> {
  const { error } = await supabase.from('inventory_items').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const { error } = await supabase.from('inventory_items').delete().eq('id', id)
  if (error) throw error
}

// --- Liste de courses -------------------------------------------------------------

const SHOPPING_SELECT = `id, ingredient_id, label, quantity, unit, checked, recipe_id, created_at,
  ingredient:ingredients ( ${INGREDIENT_REF} )`

export async function listShopping(): Promise<ShoppingListItem[]> {
  const { data, error } = await supabase
    .from('shopping_list_items')
    .select(SHOPPING_SELECT)
    .order('created_at')
  if (error) throw error
  return data as unknown as ShoppingListItem[]
}

export async function insertShoppingItems(
  items: { ingredient_id: string; quantity: number | null; unit: string | null; recipe_id?: string | null }[],
): Promise<void> {
  if (items.length === 0) return
  const { error } = await supabase.from('shopping_list_items').insert(items)
  if (error) throw error
}

export async function updateShoppingItem(
  id: string,
  patch: Partial<Pick<ShoppingListItem, 'quantity' | 'unit' | 'checked' | 'recipe_id'>>,
): Promise<void> {
  const { error } = await supabase.from('shopping_list_items').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteShoppingItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('shopping_list_items').delete().in('id', ids)
  if (error) throw error
}

// --- CIQUAL ---------------------------------------------------------------------

export async function searchCiqual(query: string, limit = 20): Promise<CiqualFood[]> {
  if (!query.trim()) return []
  const { data, error } = await supabase.rpc('search_ciqual', { p_query: query, p_limit: limit })
  if (error) throw error
  return data as CiqualFood[]
}

export interface CiqualSuggestion {
  query: string
  rank: number
  alim_code: number
  name_fr: string
  kcal_100g: number | null
}

/** Meilleures correspondances CIQUAL pour plusieurs noms d'ingrédients. */
export async function suggestCiqual(names: string[], perName = 3): Promise<CiqualSuggestion[]> {
  if (names.length === 0) return []
  const { data, error } = await supabase.rpc('suggest_ciqual', {
    p_names: names,
    p_per_name: perName,
  })
  if (error) throw error
  return data as CiqualSuggestion[]
}

export async function getCiqualFood(code: number): Promise<CiqualFood | null> {
  const { data, error } = await supabase
    .from('ciqual_foods')
    .select('*')
    .eq('alim_code', code)
    .maybeSingle()
  if (error) throw error
  return data as CiqualFood | null
}

/** Ingrédients sans calories : ni lien CIQUAL, ni valeur saisie. */
export async function listIngredientsWithoutKcal(): Promise<IngredientSummary[]> {
  const { data, error } = await supabase
    .from('ingredients')
    .select('id, name, default_unit')
    .is('ciqual_code', null)
    .is('kcal_per_100g', null)
    .order('name')
  if (error) throw error
  return data as IngredientSummary[]
}

// --- Sauvegarde ------------------------------------------------------------------

/** Sauvegarde complète de l'utilisateur connecté (construite côté base). */
export async function exportMyBackup(): Promise<FoodhelpBackup> {
  const { data, error } = await supabase.rpc('export_my_backup')
  if (error) throw error
  return data as FoodhelpBackup
}

/** Fusionne une sauvegarde dans les données actuelles, en une transaction. */
export async function restoreBackup(payload: ReturnType<typeof restorePayload>): Promise<RestoreSummary> {
  const { data, error } = await supabase.rpc('restore_backup', { p_backup: payload })
  if (error) throw error
  return data as RestoreSummary
}
