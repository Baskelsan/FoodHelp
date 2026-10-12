// Calcul de la liste de courses : besoins des recettes - stock, puis fusion avec la liste

import type { Unit } from './db-types.ts'
import { convert, type Conversion } from './units.ts'

const EPSILON = 1e-6

export interface RecipeNeedSource {
  recipeId: string
  /** Facteur de mise à l'échelle (portions voulues / portions de la recette) */
  factor: number
  items: {
    ingredientId: string
    name: string
    conv: Conversion
    quantity: number | null
    unit: string | null
    optional: boolean
  }[]
}

export interface Amount {
  quantity: number
  unit: string
}

export interface Need {
  ingredientId: string
  name: string
  conv: Conversion
  /** Quantités non convertibles entre elles (ex. pièces sans poids connu + grammes) */
  amounts: Amount[]
  /** Demandé « selon goût » dans au moins une recette */
  untracked: boolean
  recipeIds: string[]
}

/**
 * Ajoute une quantité à une liste de montants : cumule dans le même montant si
 * l'unité est identique ou convertible (en passant alors par l'unité de base).
 */
export function addAmount(
  amounts: Amount[],
  quantity: number,
  unit: Unit,
  units: Map<string, Unit>,
  conv: Conversion,
): void {
  for (const amount of amounts) {
    if (amount.unit === unit.code) {
      amount.quantity += quantity
      return
    }
    const target = units.get(amount.unit)
    if (!target) continue
    if (convert(quantity, unit, target, conv) === null) continue
    // Unités différentes mais compatibles : on additionne dans l'unité de base
    const base = units.get(target.base_unit) ?? target
    amount.quantity =
      convert(amount.quantity, target, base, conv)! + convert(quantity, unit, base, conv)!
    amount.unit = base.code
    return
  }
  amounts.push({ quantity, unit: unit.code })
}

/** Additionne les ingrédients de plusieurs recettes, par ingrédient. */
export function collectNeeds(
  sources: RecipeNeedSource[],
  units: Map<string, Unit>,
  { includeOptional = false } = {},
): Need[] {
  const needs = new Map<string, Need>()
  for (const source of sources) {
    for (const item of source.items) {
      if (item.optional && !includeOptional) continue
      let need = needs.get(item.ingredientId)
      if (!need) {
        need = {
          ingredientId: item.ingredientId,
          name: item.name,
          conv: item.conv,
          amounts: [],
          untracked: false,
          recipeIds: [],
        }
        needs.set(item.ingredientId, need)
      }
      if (!need.recipeIds.includes(source.recipeId)) need.recipeIds.push(source.recipeId)

      const unit = item.unit ? units.get(item.unit) : undefined
      if (item.quantity === null || !unit) {
        need.untracked = true
        continue
      }
      addAmount(need.amounts, item.quantity * source.factor, unit, units, item.conv)
    }
  }
  return [...needs.values()]
}

export interface StockEntry {
  ingredientId: string
  quantity: number | null
  unit: string | null
}

export interface ShoppingLine {
  key: string
  ingredientId: string
  name: string
  /** Quantité à acheter (ou totale si déjà en stock) ; null = sans quantité */
  quantity: number | null
  unit: string | null
  /** Vrai si le stock couvre entièrement le besoin */
  inStock: boolean
  /** Partie du besoin couverte par le stock (dans l'unité de la ligne) */
  fromStock: number
  recipeIds: string[]
}

/** Retire le stock des besoins. Une ligne de stock sans quantité couvre tout le besoin. */
export function subtractStock(
  needs: Need[],
  stock: StockEntry[],
  units: Map<string, Unit>,
): ShoppingLine[] {
  const lines: ShoppingLine[] = []
  for (const need of needs) {
    const entries = stock.filter((s) => s.ingredientId === need.ingredientId)
    const coveredWithoutQuantity = entries.some((s) => s.quantity === null)
    // Stock restant à consommer, modifié au fil des montants
    const pool = entries
      .filter((s) => s.quantity !== null && s.unit && units.has(s.unit))
      .map((s) => ({ quantity: s.quantity!, unit: units.get(s.unit!)! }))

    const base = { ingredientId: need.ingredientId, name: need.name, recipeIds: need.recipeIds }

    if (need.amounts.length === 0) {
      lines.push({
        ...base,
        key: need.ingredientId,
        quantity: null,
        unit: null,
        inStock: entries.length > 0,
        fromStock: 0,
      })
      continue
    }

    need.amounts.forEach((amount, i) => {
      const key = `${need.ingredientId}:${i}`
      const unit = units.get(amount.unit)!
      if (coveredWithoutQuantity) {
        lines.push({ ...base, key, ...amount, inStock: true, fromStock: amount.quantity })
        return
      }
      let remaining = amount.quantity
      for (const item of pool) {
        if (remaining <= EPSILON || item.quantity <= EPSILON) continue
        const available = convert(item.quantity, item.unit, unit, need.conv)
        if (available === null || available <= EPSILON) continue
        const taken = Math.min(available, remaining)
        remaining -= taken
        item.quantity *= 1 - taken / available
      }
      const inStock = remaining <= EPSILON
      // On n'achète pas une demi-pièce : arrondi à l'unité supérieure
      const toBuy = unit.base_unit === 'piece' ? Math.ceil(remaining - EPSILON) : remaining
      lines.push({
        ...base,
        key,
        quantity: inStock ? amount.quantity : toBuy,
        unit: amount.unit,
        inStock,
        fromStock: amount.quantity - Math.max(remaining, 0),
      })
    })
  }
  return lines
}

export interface ExistingListItem {
  id: string
  ingredientId: string | null
  quantity: number | null
  unit: string | null
  checked: boolean
  recipeId: string | null
}

export interface ListChanges {
  inserts: { ingredient_id: string; quantity: number | null; unit: string | null; recipe_id: string | null }[]
  updates: { id: string; quantity: number | null; unit: string | null; recipe_id: string | null }[]
}

/**
 * Ajoute des lignes à la liste existante : cumule avec un article non coché du même
 * ingrédient si l'unité est compatible, sinon crée un nouvel article.
 */
export function mergeIntoList(
  lines: ShoppingLine[],
  existing: ExistingListItem[],
  units: Map<string, Unit>,
  convs: Map<string, Conversion>,
): ListChanges {
  const items = existing.map((e) => ({ ...e }))
  const touched = new Set<string>()
  const inserts: ListChanges['inserts'] = []

  for (const line of lines) {
    const recipeId = line.recipeIds.length === 1 ? line.recipeIds[0] : null
    const conv = convs.get(line.ingredientId) ?? { density_g_per_ml: null, piece_weight_g: null }
    const candidates = items.filter((e) => !e.checked && e.ingredientId === line.ingredientId)
    const lineUnit = line.unit ? units.get(line.unit) : undefined

    let merged = false
    if (line.quantity === null || !lineUnit) {
      // Sans quantité : inutile de l'ajouter s'il est déjà sur la liste
      merged = candidates.length > 0
    } else {
      for (const item of candidates) {
        const itemUnit = item.unit ? units.get(item.unit) : undefined
        if (item.quantity === null || !itemUnit) {
          item.quantity = line.quantity
          item.unit = lineUnit.code
        } else {
          const converted = convert(line.quantity, lineUnit, itemUnit, conv)
          if (converted === null) continue
          item.quantity += converted
        }
        if (item.recipeId !== recipeId) item.recipeId = null
        touched.add(item.id)
        merged = true
        break
      }
    }

    if (!merged) {
      inserts.push({
        ingredient_id: line.ingredientId,
        quantity: line.quantity,
        unit: line.quantity === null ? null : line.unit,
        recipe_id: recipeId,
      })
    }
  }

  const updates = items
    .filter((e) => touched.has(e.id))
    .map((e) => ({ id: e.id, quantity: e.quantity, unit: e.unit, recipe_id: e.recipeId }))
  return { inserts, updates }
}
