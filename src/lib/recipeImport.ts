// Import de recettes au format FoodHelp (voir docs/recipe-format.md)

import type { RecipeStep, SaveRecipePayload } from './db-types.ts'
import { parseQuantity } from './units.ts'

export const FORMAT_NAME = 'foodhelp'
export const FORMAT_VERSION = 1

export interface ParsedRecipe {
  title: string
  payload: SaveRecipePayload
  /** Bloquant : la recette ne peut pas être importée */
  errors: string[]
  /** Informatif : corrigé automatiquement */
  warnings: string[]
}

export interface ParseResult {
  recipes: ParsedRecipe[]
  /** Erreur globale (texte illisible, aucune recette…) */
  error: string | null
  warnings: string[]
}

// --- Extraction du JSON depuis un texte collé ---------------------------------

/**
 * Récupère le JSON d'un texte copié depuis une conversation : accepte un bloc
 * ```json … ```, ou du texte avant / après l'objet.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim()
  const candidates: string[] = [trimmed]

  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)
  if (fence) candidates.push(fence[1].trim())

  const start = trimmed.search(/[{[]/)
  if (start >= 0) {
    const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'))
    if (end > start) candidates.push(trimmed.slice(start, end + 1))
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      // candidat suivant
    }
  }
  throw new Error('JSON illisible')
}

// --- Unités -------------------------------------------------------------------

function simplify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const UNIT_ALIASES: Record<string, string[]> = {
  g: ['g', 'gr', 'gramme', 'grammes'],
  kg: ['kg', 'kilo', 'kilos', 'kilogramme', 'kilogrammes'],
  pincee: ['pincee', 'pincees'],
  ml: ['ml', 'millilitre', 'millilitres'],
  cl: ['cl', 'centilitre', 'centilitres'],
  dl: ['dl', 'decilitre', 'decilitres'],
  l: ['l', 'litre', 'litres'],
  cc: ['cc', 'cac', 'c a cafe', 'cuillere a cafe', 'cuilleres a cafe', 'tsp', 'teaspoon', 'teaspoons'],
  cs: ['cs', 'cas', 'c a soupe', 'cuillere a soupe', 'cuilleres a soupe', 'tbsp', 'tablespoon', 'tablespoons'],
  tasse: ['tasse', 'tasses', 'cup', 'cups'],
  verre: ['verre', 'verres'],
  piece: ['piece', 'pieces', 'pc', 'pcs', 'unite', 'unites'],
  gousse: ['gousse', 'gousses'],
  tranche: ['tranche', 'tranches'],
  sachet: ['sachet', 'sachets'],
  botte: ['botte', 'bottes'],
  boite: ['boite', 'boites'],
}

const UNIT_LOOKUP = new Map(
  Object.entries(UNIT_ALIASES).flatMap(([code, aliases]) => aliases.map((a) => [a, code])),
)

/** Code d'unité de l'app pour un libellé (« c. à soupe » -> cs), ou null. */
export function resolveUnit(raw: string): string | null {
  return UNIT_LOOKUP.get(simplify(raw)) ?? null
}

// --- Lecture d'une recette ----------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number') return String(value)
  return null
}

function positiveNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? parseQuantity(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

function minutes(value: unknown, label: string, warnings: string[]): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n === 'number' && Number.isFinite(n) && n >= 0) return Math.round(n)
  warnings.push(`${label} ignoré (valeur invalide).`)
  return null
}

function parseTags(value: unknown): string[] {
  const list =
    typeof value === 'string' ? value.split(',') : Array.isArray(value) ? value : []
  const tags = list
    .map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
    .filter(Boolean)
  return [...new Set(tags)]
}

function parseSteps(value: unknown, warnings: string[]): RecipeStep[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    warnings.push('Étapes ignorées (liste attendue).')
    return []
  }
  const steps: RecipeStep[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      if (item.trim()) steps.push({ text: item.trim() })
    } else if (isObject(item) && text(item.text)) {
      const step: RecipeStep = { text: text(item.text)! }
      const m = positiveNumber(item.minutes)
      if (m) step.minutes = Math.round(m)
      steps.push(step)
    }
  }
  return steps
}

function parseIngredient(
  raw: unknown,
  index: number,
  errors: string[],
  warnings: string[],
): SaveRecipePayload['ingredients'][number] | null {
  const label = `Ingrédient n° ${index + 1}`
  if (!isObject(raw)) {
    errors.push(`${label} : format invalide.`)
    return null
  }
  const name = text(raw.name)
  if (!name) {
    errors.push(`${label} : nom manquant.`)
    return null
  }

  let quantity: number | null = null
  if (raw.quantity !== null && raw.quantity !== undefined && raw.quantity !== '') {
    quantity = positiveNumber(raw.quantity)
    if (quantity === null) {
      errors.push(`« ${name} » : quantité invalide (${JSON.stringify(raw.quantity)}).`)
      return null
    }
  }

  let unit: string | null = null
  if (quantity !== null) {
    const rawUnit = text(raw.unit)
    if (!rawUnit) {
      unit = 'piece'
      warnings.push(`« ${name} » : unité absente, comptée en pièces.`)
    } else {
      unit = resolveUnit(rawUnit)
      if (!unit) {
        errors.push(`« ${name} » : unité inconnue « ${rawUnit} ».`)
        return null
      }
    }
  }

  const ingredient: SaveRecipePayload['ingredients'][number] = {
    name,
    quantity,
    unit,
    optional: raw.optional === true,
    section: text(raw.section),
    note: text(raw.note),
  }

  for (const key of ['piece_weight_g', 'density_g_per_ml'] as const) {
    if (raw[key] === undefined || raw[key] === null) continue
    const value = positiveNumber(raw[key])
    if (value === null) warnings.push(`« ${name} » : ${key} ignoré (valeur invalide).`)
    else ingredient[key] = value
  }
  return ingredient
}

export function parseRecipe(raw: unknown, index: number): ParsedRecipe {
  const errors: string[] = []
  const warnings: string[] = []

  if (!isObject(raw)) {
    return {
      title: `Recette n° ${index + 1}`,
      payload: emptyPayload(),
      errors: ['Format invalide (objet attendu).'],
      warnings,
    }
  }

  const title = text(raw.title) ?? ''
  if (!title) errors.push('Titre manquant.')

  let servings = 2
  if (raw.servings === undefined || raw.servings === null) {
    warnings.push('Nombre de portions absent : 2 par défaut.')
  } else {
    const n = positiveNumber(raw.servings)
    if (n === null) errors.push('Nombre de portions invalide.')
    else {
      servings = Math.max(1, Math.round(n))
      if (servings !== n) warnings.push(`Portions arrondies à ${servings}.`)
    }
  }

  const ingredients: SaveRecipePayload['ingredients'] = []
  if (Array.isArray(raw.ingredients)) {
    raw.ingredients.forEach((item: unknown, i: number) => {
      const parsed = parseIngredient(item, i, errors, warnings)
      if (parsed) ingredients.push(parsed)
    })
  } else if (raw.ingredients !== undefined && raw.ingredients !== null) {
    errors.push('Ingrédients : liste attendue.')
  }
  if (ingredients.length === 0 && errors.length === 0) warnings.push('Aucun ingrédient.')

  const payload: SaveRecipePayload = {
    title,
    description: text(raw.description),
    servings,
    prep_minutes: minutes(raw.prep_minutes, 'Temps de préparation', warnings),
    cook_minutes: minutes(raw.cook_minutes, 'Temps de cuisson', warnings),
    steps: parseSteps(raw.steps, warnings),
    notes: text(raw.notes),
    source: text(raw.source),
    tags: parseTags(raw.tags),
    ingredients,
  }
  return { title: title || `Recette n° ${index + 1}`, payload, errors, warnings }
}

function emptyPayload(): SaveRecipePayload {
  return {
    title: '',
    description: null,
    servings: 2,
    prep_minutes: null,
    cook_minutes: null,
    steps: [],
    notes: null,
    source: null,
    tags: [],
    ingredients: [],
  }
}

/** Analyse un texte collé et renvoie les recettes trouvées. */
export function parseImport(input: string): ParseResult {
  if (!input.trim()) return { recipes: [], error: null, warnings: [] }

  let data: unknown
  try {
    data = extractJson(input)
  } catch {
    return {
      recipes: [],
      error: 'Texte illisible : colle le bloc JSON fourni par Claude (format FoodHelp).',
      warnings: [],
    }
  }

  const warnings: string[] = []
  let list: unknown[]
  if (Array.isArray(data)) {
    list = data
  } else if (isObject(data) && Array.isArray(data.recipes)) {
    list = data.recipes
    // Une sauvegarde complète contient aussi les recettes au même format
    const knownFormat = data.format === FORMAT_NAME || data.format === 'foodhelp-backup'
    if (data.format !== undefined && !knownFormat) {
      warnings.push(`Format « ${String(data.format)} » inattendu : import tenté quand même.`)
    }
    if (typeof data.version === 'number' && data.version > FORMAT_VERSION) {
      warnings.push(
        `Version ${data.version} plus récente que celle gérée (${FORMAT_VERSION}) : certains champs peuvent être ignorés.`,
      )
    }
  } else if (isObject(data) && 'title' in data) {
    list = [data]
  } else {
    return { recipes: [], error: 'Aucune recette trouvée dans ce JSON.', warnings }
  }

  if (list.length === 0) return { recipes: [], error: 'La liste de recettes est vide.', warnings }
  return { recipes: list.map(parseRecipe), error: null, warnings }
}
