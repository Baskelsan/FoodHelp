// Calories d'une recette à partir des kcal / 100 g de chaque ingrédient (CIQUAL ou saisie)

import type { NutritionRef, Unit } from './db-types.ts'

export interface CalorieInput {
  name: string
  quantity: number | null
  unit: string | null
  optional: boolean
  ingredient: NutritionRef
}

export interface CountedIngredient {
  name: string
  grams: number
  kcal: number
  /** ml convertis sans densité connue : comptés comme de l'eau (1 g / ml) */
  assumedDensity: boolean
}

export type MissingReason = 'no-kcal' | 'no-piece-weight'

export interface CalorieResult {
  /** Total pour la recette entière (portions de base) */
  total: number
  perServing: number
  counted: CountedIngredient[]
  missing: { name: string; reason: MissingReason }[]
  /** Faux si au moins un ingrédient n'a pas pu être compté : le total est un minimum */
  complete: boolean
}

/** kcal / 100 g retenues : saisie manuelle prioritaire, sinon CIQUAL */
export function kcalPer100g(ingredient: NutritionRef): number | null {
  return ingredient.kcal_per_100g ?? ingredient.ciqual?.kcal_100g ?? null
}

/** Poids en grammes d'une quantité ; null si impossible (pièce sans poids connu). */
function toGrams(
  quantity: number,
  unit: Unit,
  ingredient: NutritionRef,
): { grams: number; assumedDensity: boolean } | null {
  const base = quantity * unit.to_base
  switch (unit.base_unit) {
    case 'g':
      return { grams: base, assumedDensity: false }
    case 'ml':
      return ingredient.density_g_per_ml
        ? { grams: base * ingredient.density_g_per_ml, assumedDensity: false }
        : { grams: base, assumedDensity: true }
    case 'piece':
      return ingredient.piece_weight_g
        ? { grams: base * ingredient.piece_weight_g, assumedDensity: false }
        : null
  }
}

/**
 * Calories d'une recette. Ne compte ni les ingrédients facultatifs ni ceux
 * « selon goût » ; liste ceux qui n'ont pas pu être comptés.
 */
export function recipeCalories(
  items: CalorieInput[],
  servings: number,
  units: Map<string, Unit>,
): CalorieResult {
  const counted: CountedIngredient[] = []
  const missing: CalorieResult['missing'] = []

  for (const item of items) {
    if (item.optional || item.quantity === null || !item.unit) continue
    const unit = units.get(item.unit)
    if (!unit) continue
    const kcal100 = kcalPer100g(item.ingredient)
    if (kcal100 === null) {
      missing.push({ name: item.name, reason: 'no-kcal' })
      continue
    }
    const weight = toGrams(item.quantity, unit, item.ingredient)
    if (!weight) {
      missing.push({ name: item.name, reason: 'no-piece-weight' })
      continue
    }
    counted.push({
      name: item.name,
      grams: weight.grams,
      kcal: (weight.grams * kcal100) / 100,
      assumedDensity: weight.assumedDensity,
    })
  }

  const total = counted.reduce((sum, c) => sum + c.kcal, 0)
  return {
    total,
    perServing: servings > 0 ? total / servings : total,
    counted,
    missing,
    complete: missing.length === 0,
  }
}

const kcalFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

/** « 452 kcal », arrondi à l'unité (à la dizaine au-delà de 1000). */
export function formatKcal(kcal: number): string {
  const rounded = kcal >= 1000 ? Math.round(kcal / 10) * 10 : Math.round(kcal)
  return `${kcalFormat.format(rounded)} kcal`
}
