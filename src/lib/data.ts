import type {
  IngredientSummary,
  RecipeSummary,
  RecipeWithIngredients,
  SaveRecipePayload,
  Unit,
} from './db-types.ts'
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
    .select('id, title, tags, servings, prep_minutes, cook_minutes')
    .order('title')
  if (error) throw error
  return data as RecipeSummary[]
}

export async function getRecipe(id: string): Promise<RecipeWithIngredients | null> {
  const { data, error } = await supabase
    .from('recipes')
    .select(
      `*, recipe_ingredients (
        id, position, quantity, unit, optional, section, note,
        ingredient:ingredients ( id, name, default_unit, density_g_per_ml, piece_weight_g )
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
