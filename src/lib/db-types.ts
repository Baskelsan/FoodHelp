// Types écrits d'après supabase/migrations/*.sql (à tenir à jour avec le schéma)

export type BaseUnit = 'g' | 'ml' | 'piece'

export interface Unit {
  code: string
  label: string
  label_plural: string
  base_unit: BaseUnit
  to_base: number
  sort_order: number
}

export interface Ingredient {
  id: string
  name: string
  default_unit: string
  aisle_id: string | null
  ciqual_code: number | null
  kcal_per_100g: number | null
  density_g_per_ml: number | null
  piece_weight_g: number | null
}

export type IngredientSummary = Pick<Ingredient, 'id' | 'name' | 'default_unit'>

export interface RecipeStep {
  text: string
  minutes?: number
}

export interface Recipe {
  id: string
  title: string
  description: string | null
  servings: number
  prep_minutes: number | null
  cook_minutes: number | null
  steps: RecipeStep[]
  notes: string | null
  source: string | null
  tags: string[]
  created_at: string
  updated_at: string
}

export type RecipeSummary = Pick<
  Recipe,
  'id' | 'title' | 'tags' | 'servings' | 'prep_minutes' | 'cook_minutes'
>

export interface RecipeIngredient {
  id: string
  position: number
  quantity: number | null
  unit: string | null
  optional: boolean
  section: string | null
  note: string | null
  ingredient: Pick<
    Ingredient,
    'id' | 'name' | 'default_unit' | 'density_g_per_ml' | 'piece_weight_g'
  >
}

export interface RecipeWithIngredients extends Recipe {
  recipe_ingredients: RecipeIngredient[]
}

/** Paramètre de la fonction SQL save_recipe */
export interface SaveRecipePayload {
  id?: string
  title: string
  description: string | null
  servings: number
  prep_minutes: number | null
  cook_minutes: number | null
  steps: RecipeStep[]
  notes: string | null
  source: string | null
  tags: string[]
  ingredients: {
    name: string
    quantity: number | null
    unit: string | null
    optional: boolean
    section: string | null
    note: string | null
    /** Complètent la fiche de l'ingrédient si elle n'a pas encore ces valeurs */
    piece_weight_g?: number
    density_g_per_ml?: number
  }[]
}
