// Sauvegarde complète « foodhelp-backup » (voir docs/recipe-format.md).
// Le fichier est construit par la fonction SQL private.build_backup (source unique
// du format, utilisée par l'app et par la sauvegarde automatique).

import type { DateType, SaveRecipePayload } from './db-types.ts'
import { extractJson, parseRecipe, type ParsedRecipe } from './recipeImport.ts'

export const BACKUP_FORMAT = 'foodhelp-backup'

export interface BackupIngredient {
  name: string
  default_unit: string
  aisle: string | null
  ciqual_code: number | null
  kcal_per_100g: number | null
  density_g_per_ml: number | null
  piece_weight_g: number | null
}

export interface FoodhelpBackup {
  format: typeof BACKUP_FORMAT
  version: number
  exported_at?: string
  /** Recettes au format d'import FoodHelp */
  recipes: unknown[]
  ingredients: BackupIngredient[]
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

/** Nom de fichier : foodhelp-sauvegarde-2026-10-13.json (date locale) */
export function backupFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `foodhelp-sauvegarde-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`
}

// --- Restauration -----------------------------------------------------------------

export interface ParsedBackup {
  backup: FoodhelpBackup
  /** Recettes relues comme à l'import (erreurs, avertissements, payload normalisé) */
  recipes: ParsedRecipe[]
}

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

/** Lit un fichier de sauvegarde ; renvoie une erreur lisible s'il ne convient pas. */
export function parseBackup(text: string): { parsed: ParsedBackup | null; error: string | null } {
  let data: unknown
  try {
    data = extractJson(text)
  } catch {
    return { parsed: null, error: 'Fichier illisible : choisis une sauvegarde FoodHelp (.json).' }
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { parsed: null, error: 'Ce fichier n’est pas une sauvegarde FoodHelp.' }
  }
  const raw = data as Record<string, unknown>
  if (raw.format !== BACKUP_FORMAT) {
    return {
      parsed: null,
      error:
        raw.format === 'foodhelp'
          ? 'Ce fichier contient seulement des recettes : utilise Recettes → Importer.'
          : 'Ce fichier n’est pas une sauvegarde FoodHelp (format « foodhelp-backup » attendu).',
    }
  }
  const backup: FoodhelpBackup = {
    format: BACKUP_FORMAT,
    version: typeof raw.version === 'number' ? raw.version : 1,
    exported_at: typeof raw.exported_at === 'string' ? raw.exported_at : undefined,
    recipes: asArray(raw.recipes),
    ingredients: asArray(raw.ingredients) as FoodhelpBackup['ingredients'],
    aisles: asArray(raw.aisles) as FoodhelpBackup['aisles'],
    inventory: asArray(raw.inventory) as FoodhelpBackup['inventory'],
    shopping_list: asArray(raw.shopping_list) as FoodhelpBackup['shopping_list'],
  }
  return { parsed: { backup, recipes: backup.recipes.map(parseRecipe) }, error: null }
}

export interface RestoreChoices {
  /** Rayons et ingrédients (créés ou complétés, jamais écrasés) */
  ingredients: boolean
  /** Index des recettes à restaurer */
  recipes: Set<number>
  inventory: boolean
  shopping: boolean
}

/** Paramètre de la fonction SQL restore_backup selon les choix de l'utilisateur. */
export function restorePayload(parsed: ParsedBackup, choices: RestoreChoices) {
  const recipes: SaveRecipePayload[] = parsed.recipes
    .filter((r, i) => choices.recipes.has(i) && r.errors.length === 0)
    .map((r) => r.payload)
  return {
    format: BACKUP_FORMAT,
    aisles: choices.ingredients ? parsed.backup.aisles : [],
    ingredients: choices.ingredients ? parsed.backup.ingredients : [],
    recipes,
    inventory: choices.inventory ? parsed.backup.inventory : [],
    shopping_list: choices.shopping ? parsed.backup.shopping_list : [],
  }
}

export interface RestoreSummary {
  aisles: number
  ingredients_created: number
  ingredients_completed: number
  recipes: number
  inventory: number
  shopping_list: number
}
