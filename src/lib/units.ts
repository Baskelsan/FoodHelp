import type { BaseUnit, Unit } from './db-types.ts'

/** Données de l'ingrédient permettant de passer d'une dimension à l'autre. */
export interface Conversion {
  density_g_per_ml: number | null
  piece_weight_g: number | null
}

function toGrams(baseQty: number, base: BaseUnit, conv?: Conversion | null): number | null {
  switch (base) {
    case 'g':
      return baseQty
    case 'ml':
      return conv?.density_g_per_ml ? baseQty * conv.density_g_per_ml : null
    case 'piece':
      return conv?.piece_weight_g ? baseQty * conv.piece_weight_g : null
  }
}

function fromGrams(grams: number, base: BaseUnit, conv?: Conversion | null): number | null {
  switch (base) {
    case 'g':
      return grams
    case 'ml':
      return conv?.density_g_per_ml ? grams / conv.density_g_per_ml : null
    case 'piece':
      return conv?.piece_weight_g ? grams / conv.piece_weight_g : null
  }
}

/**
 * Convertit une quantité d'une unité à une autre.
 * Entre dimensions différentes (g / ml / pièce), passe par les grammes grâce à
 * la densité ou au poids par pièce de l'ingrédient ; null si l'info manque.
 */
export function convert(
  qty: number,
  from: Unit,
  to: Unit,
  conv?: Conversion | null,
): number | null {
  if (from.base_unit === to.base_unit) return (qty * from.to_base) / to.to_base
  const grams = toGrams(qty * from.to_base, from.base_unit, conv)
  if (grams === null) return null
  const base = fromGrams(grams, to.base_unit, conv)
  return base === null ? null : base / to.to_base
}

/**
 * Facteur à appliquer à toute la recette quand un ingrédient est limitant :
 * « j'ai 425 ml de lait » pour une recette qui en demande 500 ml -> 0,85.
 */
export function limitingFactor(
  available: { quantity: number; unit: Unit },
  required: { quantity: number; unit: Unit },
  conv?: Conversion | null,
): number | null {
  if (!(available.quantity > 0) || !(required.quantity > 0)) return null
  const inRequiredUnit = convert(available.quantity, available.unit, required.unit, conv)
  return inRequiredUnit === null ? null : inRequiredUnit / required.quantity
}

// --- Affichage ---------------------------------------------------------------

const FRACTIONS: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' }

// Unités « de cuisine » : on raisonne en quarts (½ c. à soupe, 1 ¼ tasse…)
const QUARTER_UNITS = new Set(['cc', 'cs', 'tasse', 'verre', 'pincee'])

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

const numberFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

/** Arrondit une quantité pour qu'elle soit lisible dans l'unité donnée. */
export function roundForDisplay(value: number, unit: Unit): number {
  if (unit.base_unit === 'piece' || QUARTER_UNITS.has(unit.code)) {
    return Math.max(0.25, roundTo(value, 0.25))
  }
  if (unit.code === 'kg' || unit.code === 'l') return Math.max(0.05, roundTo(value, 0.05))
  if (value >= 100) return roundTo(value, 5)
  if (value >= 10) return Math.round(value)
  return Math.max(0.5, roundTo(value, 0.5))
}

function formatAmount(value: number, unit: Unit): string {
  if (unit.base_unit === 'piece' || QUARTER_UNITS.has(unit.code)) {
    const whole = Math.floor(value)
    const fraction = FRACTIONS[value - whole]
    if (fraction) return whole > 0 ? `${whole} ${fraction}` : fraction
  }
  return numberFormat.format(value)
}

/** Choisit kg / l au-delà de 1000 g / 1000 ml, et g / ml en dessous de 1 kg / 1 l. */
function displayUnit(value: number, unit: Unit, units: Map<string, Unit>): [number, Unit] {
  const base = value * unit.to_base
  const kg = units.get('kg')
  const g = units.get('g')
  const l = units.get('l')
  const ml = units.get('ml')
  if (unit.code === 'g' && base >= 1000 && kg) return [base / kg.to_base, kg]
  if (unit.code === 'kg' && base < 1000 && g) return [base, g]
  if ((unit.code === 'ml' || unit.code === 'cl' || unit.code === 'dl') && base >= 1000 && l) {
    return [base / l.to_base, l]
  }
  if (unit.code === 'l' && base < 1000 && ml) return [base, ml]
  return [value, unit]
}

/**
 * Texte d'une quantité : « 250 g », « 1,5 kg », « ½ c. à soupe », « 2 gousses ».
 * Pour l'unité « pièce », seul le nombre est affiché (« 3 » œufs).
 */
export function formatQuantity(value: number, unit: Unit, units: Map<string, Unit>): string {
  const [converted, shownUnit] = displayUnit(value, unit, units)
  const rounded = roundForDisplay(converted, shownUnit)
  const amount = formatAmount(rounded, shownUnit)
  if (shownUnit.code === 'piece') return amount
  const label = rounded >= 2 ? shownUnit.label_plural : shownUnit.label
  return `${amount} ${label}`
}

/** Nombre de portions affiché : entier si possible, sinon une décimale. */
export function formatServings(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return numberFormat.format(rounded)
}

/**
 * Lit une quantité saisie : « 1,5 », « 1.5 », « 1/2 », « 1 1/2 ».
 * Renvoie null si vide ou invalide.
 */
export function parseQuantity(input: string): number | null {
  const s = input.trim().replace(',', '.')
  if (!s) return null
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s)
  if (mixed) {
    const den = Number(mixed[3])
    return den ? Number(mixed[1]) + Number(mixed[2]) / den : null
  }
  const frac = /^(\d+)\/(\d+)$/.exec(s)
  if (frac) {
    const den = Number(frac[2])
    return den ? Number(frac[1]) / den : null
  }
  if (!/^\d*\.?\d+$/.test(s)) return null
  return Number(s)
}
