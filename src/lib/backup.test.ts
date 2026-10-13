import { describe, expect, it } from 'vitest'
import { backupFileName, buildBackup, type BackupInput } from './backup.ts'
import type { Ingredient } from './db-types.ts'
import { parseImport } from './recipeImport.ts'

const ingredient = (id: string, name: string, patch: Partial<Ingredient> = {}): Ingredient => ({
  id,
  name,
  default_unit: 'g',
  aisle_id: null,
  ciqual_code: null,
  kcal_per_100g: null,
  density_g_per_ml: null,
  piece_weight_g: null,
  ...patch,
})

const OEUF = ingredient('i-oeuf', 'Œuf', { default_unit: 'piece', piece_weight_g: 55, ciqual_code: 22000, aisle_id: 'a-frais' })
const LAIT = ingredient('i-lait', 'Lait', { default_unit: 'ml', density_g_per_ml: 1.03, aisle_id: 'a-frais' })
const FARINE = ingredient('i-farine', 'Farine', { kcal_per_100g: 350 })
const SEL = ingredient('i-sel', 'Sel')

const ref = (i: Ingredient) => ({
  name: i.name,
  density_g_per_ml: i.density_g_per_ml,
  piece_weight_g: i.piece_weight_g,
})

const INPUT: BackupInput = {
  recipes: [
    {
      title: 'Crêpes',
      description: 'Les crêpes du dimanche.',
      servings: 4,
      prep_minutes: 10,
      cook_minutes: null,
      steps: [{ text: 'Mélanger.' }, { text: 'Cuire.', minutes: 20 }],
      notes: null,
      source: 'Claude',
      tags: ['dessert'],
      recipe_ingredients: [
        { position: 1, quantity: 3, unit: 'piece', optional: false, section: 'Pâte', note: null, ingredient: ref(OEUF) },
        { position: 0, quantity: 250, unit: 'g', optional: false, section: 'Pâte', note: 'tamisée', ingredient: ref(FARINE) },
        { position: 2, quantity: 500, unit: 'ml', optional: false, section: null, note: null, ingredient: ref(LAIT) },
        { position: 3, quantity: null, unit: 'g', optional: true, section: null, note: null, ingredient: ref(SEL) },
      ],
    },
  ],
  ingredients: [SEL, OEUF, LAIT, FARINE],
  aisles: [
    { id: 'a-sec', name: 'Épicerie', position: 1 },
    { id: 'a-frais', name: 'Crèmerie', position: 0 },
  ],
  inventory: [
    {
      id: 'inv-1',
      ingredient_id: 'i-lait',
      quantity: 1,
      unit: 'l',
      expires_on: '2026-10-20',
      date_type: 'DLC',
      note: null,
      created_at: '',
      ingredient: { ...LAIT },
    },
  ],
  shopping: [
    {
      id: 's-1',
      ingredient_id: 'i-oeuf',
      label: null,
      quantity: 6,
      unit: 'piece',
      checked: true,
      recipe_id: null,
      created_at: '',
      ingredient: { ...OEUF },
    },
  ],
}

describe('buildBackup', () => {
  const backup = buildBackup(INPUT, new Date('2026-10-13T20:00:00Z'))

  it('produit l’enveloppe et toutes les sections', () => {
    expect(backup).toMatchObject({
      format: 'foodhelp-backup',
      version: 1,
      exported_at: '2026-10-13T20:00:00.000Z',
    })
    expect(backup.aisles).toEqual([
      { name: 'Crèmerie', position: 0 },
      { name: 'Épicerie', position: 1 },
    ])
    expect(backup.ingredients.map((i) => [i.name, i.aisle])).toEqual([
      ['Farine', null],
      ['Lait', 'Crèmerie'],
      ['Œuf', 'Crèmerie'],
      ['Sel', null],
    ])
    expect(backup.ingredients.find((i) => i.name === 'Œuf')).toMatchObject({ ciqual_code: 22000, piece_weight_g: 55 })
    expect(backup.inventory).toEqual([
      { ingredient: 'Lait', quantity: 1, unit: 'l', expires_on: '2026-10-20', date_type: 'DLC', note: null },
    ])
    expect(backup.shopping_list).toEqual([{ ingredient: 'Œuf', quantity: 6, unit: 'piece', checked: true }])
  })

  it('exporte les recettes au format d’import, dans l’ordre et sans champs vides', () => {
    const [recipe] = backup.recipes
    expect(recipe).not.toHaveProperty('notes')
    expect(recipe).not.toHaveProperty('cook_minutes')
    expect(recipe.ingredients).toEqual([
      { name: 'Farine', quantity: 250, unit: 'g', note: 'tamisée', section: 'Pâte' },
      { name: 'Œuf', quantity: 3, unit: 'piece', section: 'Pâte', piece_weight_g: 55 },
      { name: 'Lait', quantity: 500, unit: 'ml', density_g_per_ml: 1.03 },
      { name: 'Sel', quantity: null, unit: null, optional: true },
    ])
  })

  it('se réimporte telle quelle par l’écran d’import', () => {
    const result = parseImport(JSON.stringify(backup, null, 2))
    expect(result.error).toBeNull()
    expect(result.warnings).toEqual([])
    const [r] = result.recipes
    expect(r.errors).toEqual([])
    expect(r.payload).toMatchObject({
      title: 'Crêpes',
      description: 'Les crêpes du dimanche.',
      servings: 4,
      prep_minutes: 10,
      cook_minutes: null,
      tags: ['dessert'],
      source: 'Claude',
      steps: [{ text: 'Mélanger.' }, { text: 'Cuire.', minutes: 20 }],
    })
    expect(r.payload.ingredients.map((i) => [i.name, i.quantity, i.unit, i.optional, i.section, i.note])).toEqual([
      ['Farine', 250, 'g', false, 'Pâte', 'tamisée'],
      ['Œuf', 3, 'piece', false, 'Pâte', null],
      ['Lait', 500, 'ml', false, null, null],
      ['Sel', null, null, true, null, null],
    ])
    expect(r.payload.ingredients[1].piece_weight_g).toBe(55)
    expect(r.payload.ingredients[2].density_g_per_ml).toBe(1.03)
  })
})

describe('backupFileName', () => {
  it('date locale', () => {
    expect(backupFileName(new Date(2026, 9, 3, 23, 59))).toBe('foodhelp-sauvegarde-2026-10-03.json')
  })
})
