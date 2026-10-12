import { describe, expect, it } from 'vitest'
import {
  collectNeeds,
  mergeIntoList,
  subtractStock,
  type RecipeNeedSource,
} from './shopping.ts'
import { U } from './test-units.ts'

const NONE = { density_g_per_ml: null, piece_weight_g: null }
const OEUF = { density_g_per_ml: null, piece_weight_g: 55 }

const item = (
  ingredientId: string,
  quantity: number | null,
  unit: string | null,
  extra: Partial<RecipeNeedSource['items'][number]> = {},
) => ({ ingredientId, name: ingredientId, conv: NONE, quantity, unit, optional: false, ...extra })

const CREPES: RecipeNeedSource = {
  recipeId: 'crepes',
  factor: 1,
  items: [
    item('farine', 250, 'g'),
    item('oeuf', 3, 'piece', { conv: OEUF }),
    item('lait', 500, 'ml'),
    item('beurre', 2, 'cs'),
    item('rhum', 1, 'cs', { optional: true }),
    item('sel', null, null),
  ],
}

const GATEAU: RecipeNeedSource = {
  recipeId: 'gateau',
  factor: 2,
  items: [
    item('farine', 0.1, 'kg'),
    item('oeuf', 110, 'g', { conv: OEUF }),
    item('beurre', 30, 'ml'),
    item('sel', 1, 'pincee'),
  ],
}

describe('collectNeeds', () => {
  it('additionne les besoins et applique le facteur', () => {
    const needs = collectNeeds([CREPES, GATEAU], U)
    const byId = Object.fromEntries(needs.map((n) => [n.ingredientId, n]))

    // 250 g + 2 × 0,1 kg = 450 g
    expect(byId.farine.amounts).toEqual([{ quantity: 450, unit: 'g' }])
    // 3 œufs + 2 × 110 g (55 g / œuf) = 3 + 4 œufs, dans l'unité du premier montant
    expect(byId.oeuf.amounts).toEqual([{ quantity: 7, unit: 'piece' }])
    // 2 c. à soupe (30 ml) + 2 × 30 ml = 90 ml
    expect(byId.beurre.amounts).toEqual([{ quantity: 90, unit: 'ml' }])
    expect(byId.sel).toMatchObject({ untracked: true, amounts: [{ quantity: 2, unit: 'pincee' }] })
    expect(byId.farine.recipeIds).toEqual(['crepes', 'gateau'])
    expect(byId.rhum).toBeUndefined()
  })

  it('inclut les facultatifs sur demande', () => {
    const needs = collectNeeds([CREPES], U, { includeOptional: true })
    expect(needs.find((n) => n.ingredientId === 'rhum')?.amounts).toEqual([{ quantity: 1, unit: 'cs' }])
  })

  it('garde séparées les quantités non convertibles', () => {
    const needs = collectNeeds(
      [{ recipeId: 'r', factor: 1, items: [item('oignon', 2, 'piece'), item('oignon', 100, 'g')] }],
      U,
    )
    expect(needs[0].amounts).toEqual([
      { quantity: 2, unit: 'piece' },
      { quantity: 100, unit: 'g' },
    ])
  })
})

describe('subtractStock', () => {
  const needs = collectNeeds([CREPES], U)

  it('retire le stock convertible et signale ce qui est couvert', () => {
    const lines = subtractStock(
      needs,
      [
        { ingredientId: 'lait', quantity: 0.2, unit: 'l' },
        { ingredientId: 'farine', quantity: 1, unit: 'kg' },
        { ingredientId: 'sel', quantity: null, unit: null },
      ],
      U,
    )
    const byId = Object.fromEntries(lines.map((l) => [l.ingredientId, l]))
    expect(byId.lait).toMatchObject({ quantity: 300, unit: 'ml', inStock: false, fromStock: 200 })
    expect(byId.farine).toMatchObject({ quantity: 250, unit: 'g', inStock: true })
    expect(byId.oeuf).toMatchObject({ quantity: 3, unit: 'piece', inStock: false, fromStock: 0 })
    expect(byId.sel).toMatchObject({ quantity: null, inStock: true })
  })

  it('une ligne de stock sans quantité couvre tout le besoin', () => {
    const lines = subtractStock(needs, [{ ingredientId: 'lait', quantity: null, unit: null }], U)
    expect(lines.find((l) => l.ingredientId === 'lait')).toMatchObject({ quantity: 500, inStock: true })
  })

  it('ignore le stock non convertible', () => {
    const lines = subtractStock(needs, [{ ingredientId: 'lait', quantity: 300, unit: 'g' }], U)
    expect(lines.find((l) => l.ingredientId === 'lait')).toMatchObject({ quantity: 500, inStock: false })
  })

  it('arrondit à la pièce supérieure ce qu’il reste à acheter', () => {
    const lines = subtractStock(
      collectNeeds([{ ...CREPES, factor: 1.5 }], U),
      [{ ingredientId: 'oeuf', quantity: 2, unit: 'piece' }],
      U,
    )
    // 4,5 œufs - 2 en stock = 2,5 -> 3
    expect(lines.find((l) => l.ingredientId === 'oeuf')).toMatchObject({ quantity: 3, unit: 'piece' })
  })

  it('utilise le poids par pièce entre pièces et grammes', () => {
    const lines = subtractStock(
      collectNeeds([CREPES], U),
      [{ ingredientId: 'oeuf', quantity: 110, unit: 'g' }],
      U,
    )
    expect(lines.find((l) => l.ingredientId === 'oeuf')).toMatchObject({ quantity: 1, unit: 'piece' })
  })
})

describe('mergeIntoList', () => {
  const convs = new Map([['oeuf', OEUF]])
  const line = (ingredientId: string, quantity: number | null, unit: string | null, recipeIds = ['r1']) => ({
    key: ingredientId,
    ingredientId,
    name: ingredientId,
    quantity,
    unit,
    inStock: false,
    fromStock: 0,
    recipeIds,
  })
  const existing = (id: string, ingredientId: string, quantity: number | null, unit: string | null, checked = false) => ({
    id,
    ingredientId,
    quantity,
    unit,
    checked,
    recipeId: 'r1',
  })

  it('cumule avec un article compatible non coché', () => {
    const changes = mergeIntoList(
      [line('lait', 500, 'ml'), line('oeuf', 110, 'g', ['r2'])],
      [existing('a', 'lait', 1, 'l'), existing('b', 'oeuf', 2, 'piece')],
      U,
      convs,
    )
    expect(changes.inserts).toEqual([])
    expect(changes.updates).toEqual([
      { id: 'a', quantity: 1.5, unit: 'l', recipe_id: 'r1' },
      { id: 'b', quantity: 4, unit: 'piece', recipe_id: null },
    ])
  })

  it('crée un article si rien de compatible (ou déjà coché)', () => {
    const changes = mergeIntoList(
      [line('lait', 500, 'ml'), line('farine', 200, 'g', ['r1', 'r2'])],
      [existing('a', 'lait', 1, 'l', true), existing('b', 'farine', 2, 'piece')],
      U,
      convs,
    )
    expect(changes.updates).toEqual([])
    expect(changes.inserts).toEqual([
      { ingredient_id: 'lait', quantity: 500, unit: 'ml', recipe_id: 'r1' },
      { ingredient_id: 'farine', quantity: 200, unit: 'g', recipe_id: null },
    ])
  })

  it('gère les articles sans quantité', () => {
    const changes = mergeIntoList(
      [line('sel', null, null), line('poivre', null, null), line('sucre', 100, 'g')],
      [existing('a', 'sel', null, null), existing('b', 'sucre', null, null)],
      U,
      convs,
    )
    expect(changes.inserts).toEqual([
      { ingredient_id: 'poivre', quantity: null, unit: null, recipe_id: 'r1' },
    ])
    expect(changes.updates).toEqual([{ id: 'b', quantity: 100, unit: 'g', recipe_id: 'r1' }])
  })
})
