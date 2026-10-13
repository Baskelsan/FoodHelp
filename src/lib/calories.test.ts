import { describe, expect, it } from 'vitest'
import { formatKcal, kcalPer100g, recipeCalories, type CalorieInput } from './calories.ts'
import type { NutritionRef } from './db-types.ts'
import { U } from './test-units.ts'

const ref = (patch: Partial<NutritionRef> = {}): NutritionRef => ({
  density_g_per_ml: null,
  piece_weight_g: null,
  kcal_per_100g: null,
  ciqual_code: null,
  ciqual: null,
  ...patch,
})

const ciqual = (kcal: number | null) => ({ ciqual_code: 1, ciqual: { kcal_100g: kcal, name_fr: 'x' } })

const item = (
  name: string,
  quantity: number | null,
  unit: string | null,
  ingredient: NutritionRef,
  optional = false,
): CalorieInput => ({ name, quantity, unit, optional, ingredient })

describe('kcalPer100g', () => {
  it('privilégie la saisie manuelle puis CIQUAL', () => {
    expect(kcalPer100g(ref({ kcal_per_100g: 50, ...ciqual(47.5) }))).toBe(50)
    expect(kcalPer100g(ref(ciqual(47.5)))).toBe(47.5)
    expect(kcalPer100g(ref())).toBeNull()
  })
})

describe('recipeCalories', () => {
  it('additionne grammes, ml (densité) et pièces (poids)', () => {
    const result = recipeCalories(
      [
        item('farine', 250, 'g', ref(ciqual(346))),
        item('lait', 0.5, 'l', ref({ density_g_per_ml: 1.03, ...ciqual(47.5) })),
        item('œuf', 3, 'piece', ref({ piece_weight_g: 55, ...ciqual(140) })),
        item('beurre', 2, 'cs', ref({ density_g_per_ml: 0.91, kcal_per_100g: 731 })),
      ],
      4,
      U,
    )
    // 865 + 515 × 0,475 + 165 × 1,4 + 27,3 × 7,31
    const expected = 865 + 244.625 + 231 + 199.563
    expect(result.total).toBeCloseTo(expected, 2)
    expect(result.perServing).toBeCloseTo(expected / 4, 2)
    expect(result.complete).toBe(true)
    expect(result.counted.every((c) => !c.assumedDensity)).toBe(true)
  })

  it('compte les ml sans densité comme de l’eau et le signale', () => {
    const result = recipeCalories([item('jus', 200, 'ml', ref(ciqual(45)))], 2, U)
    expect(result.total).toBeCloseTo(90)
    expect(result.counted[0].assumedDensity).toBe(true)
    expect(result.complete).toBe(true)
  })

  it('liste ce qui ne peut pas être compté', () => {
    const result = recipeCalories(
      [
        item('farine', 100, 'g', ref(ciqual(346))),
        item('épice mystère', 5, 'g', ref()),
        item('oignon', 2, 'piece', ref(ciqual(36))),
        item('vanille', 1, 'gousse', ref(ciqual(null))),
      ],
      1,
      U,
    )
    expect(result.total).toBeCloseTo(346)
    expect(result.complete).toBe(false)
    expect(result.missing).toEqual([
      { name: 'épice mystère', reason: 'no-kcal' },
      { name: 'oignon', reason: 'no-piece-weight' },
      { name: 'vanille', reason: 'no-kcal' },
    ])
  })

  it('ignore les facultatifs et les « selon goût »', () => {
    const result = recipeCalories(
      [
        item('rhum', 1, 'cs', ref(ciqual(234)), true),
        item('sel', null, null, ref()),
        item('sucre', 10, 'g', ref(ciqual(400))),
      ],
      1,
      U,
    )
    expect(result.total).toBeCloseTo(40)
    expect(result.complete).toBe(true)
  })
})

describe('formatKcal', () => {
  it('arrondit', () => {
    expect(formatKcal(452.4)).toBe('452 kcal')
    expect(formatKcal(1834)).toBe('1 830 kcal')
  })
})
