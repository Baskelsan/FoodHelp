// Sauvegarde complète au format JSON (voir docs/recipe-format.md pour les recettes)

import type {
  Aisle,
  DateType,
  Ingredient,
  InventoryItem,
  RecipeStep,
  ShoppingListItem,
} from './db-types.ts'

export const BACKUP_FORMAT = 'foodhelp-backup'
export const BACKUP_VERSION = 1

/** Recette complète telle que lue pour l'export */
export interface BackupRecipeSource {
  title: string
  description: string | null
  servings: number
  prep_minutes: number | null
  cook_minutes: number | null
  steps: RecipeStep[]
  notes: string | null
  source: string | null
  tags: string[]
  recipe_ingredients: {
    position: number
    quantity: number | null
    unit: string | null
    optional: boolean
    section: string | null
    note: string | null
    ingredient: Pick<Ingredient, 'name' | 'density_g_per_ml' | 'piece_weight_g'>
  }[]
}

export interface BackupInput {
  recipes: BackupRecipeSource[]
  ingredients: Ingredient[]
  aisles: Aisle[]
  inventory: InventoryItem[]
  shopping: ShoppingListItem[]
}

/** Recette au format d'import FoodHelp (champs vides omis) */
export interface ExportedRecipe {
  title: string
  description?: string
  servings: number
  prep_minutes?: number
  cook_minutes?: number
  tags: string[]
  source?: string
  notes?: string
  ingredients: {
    name: string
    quantity: number | null
    unit: string | null
    optional?: true
    note?: string
    section?: string
    piece_weight_g?: number
    density_g_per_ml?: number
  }[]
  steps: RecipeStep[]
}

export interface FoodhelpBackup {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exported_at: string
  recipes: ExportedRecipe[]
  ingredients: {
    name: string
    default_unit: string
    aisle: string | null
    ciqual_code: number | null
    kcal_per_100g: number | null
    density_g_per_ml: number | null
    piece_weight_g: number | null
  }[]
  aisles: { name: string; position: number }[]
  inventory: {
    ingredient: string
    quantity: number | null
    unit: string | null
    expires_on: string | null
    date_type: DateType | null
    note: string | null
  }[]
  shopping_list: {
    ingredient: string
    quantity: number | null
    unit: string | null
    checked: boolean
  }[]
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, 'fr')

export function exportRecipe(recipe: BackupRecipeSource): ExportedRecipe {
  const out: ExportedRecipe = {
    title: recipe.title,
    servings: recipe.servings,
    tags: recipe.tags,
    ingredients: [],
    steps: recipe.steps,
  }
  if (recipe.description) out.description = recipe.description
  if (recipe.prep_minutes !== null) out.prep_minutes = recipe.prep_minutes
  if (recipe.cook_minutes !== null) out.cook_minutes = recipe.cook_minutes
  if (recipe.source) out.source = recipe.source
  if (recipe.notes) out.notes = recipe.notes

  for (const ri of [...recipe.recipe_ingredients].sort((a, b) => a.position - b.position)) {
    const item: ExportedRecipe['ingredients'][number] = {
      name: ri.ingredient.name,
      quantity: ri.quantity,
      unit: ri.quantity === null ? null : ri.unit,
    }
    if (ri.optional) item.optional = true
    if (ri.note) item.note = ri.note
    if (ri.section) item.section = ri.section
    if (ri.ingredient.piece_weight_g !== null) item.piece_weight_g = ri.ingredient.piece_weight_g
    if (ri.ingredient.density_g_per_ml !== null) item.density_g_per_ml = ri.ingredient.density_g_per_ml
    out.ingredients.push(item)
  }
  return out
}

export function buildBackup(input: BackupInput, now: Date = new Date()): FoodhelpBackup {
  const aisleName = new Map(input.aisles.map((a) => [a.id, a.name]))
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: now.toISOString(),
    recipes: [...input.recipes]
      .sort((a, b) => a.title.localeCompare(b.title, 'fr'))
      .map(exportRecipe),
    ingredients: [...input.ingredients].sort(byName).map((i) => ({
      name: i.name,
      default_unit: i.default_unit,
      aisle: i.aisle_id ? (aisleName.get(i.aisle_id) ?? null) : null,
      ciqual_code: i.ciqual_code,
      kcal_per_100g: i.kcal_per_100g,
      density_g_per_ml: i.density_g_per_ml,
      piece_weight_g: i.piece_weight_g,
    })),
    aisles: [...input.aisles]
      .sort((a, b) => a.position - b.position)
      .map((a) => ({ name: a.name, position: a.position })),
    inventory: input.inventory
      .map((i) => ({
        ingredient: i.ingredient.name,
        quantity: i.quantity,
        unit: i.unit,
        expires_on: i.expires_on,
        date_type: i.date_type,
        note: i.note,
      }))
      .sort((a, b) => a.ingredient.localeCompare(b.ingredient, 'fr')),
    shopping_list: input.shopping.map((s) => ({
      ingredient: s.ingredient?.name ?? s.label ?? '?',
      quantity: s.quantity,
      unit: s.unit,
      checked: s.checked,
    })),
  }
}

/** Nom de fichier : foodhelp-sauvegarde-2026-10-13.json (date locale) */
export function backupFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `foodhelp-sauvegarde-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`
}
