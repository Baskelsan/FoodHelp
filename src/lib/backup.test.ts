import { describe, expect, it } from 'vitest'
import { backupFileName, parseBackup, restorePayload } from './backup.ts'

// Extrait d'une sauvegarde telle que produite par la fonction SQL private.build_backup
const BACKUP = {
  format: 'foodhelp-backup',
  version: 1,
  exported_at: '2026-10-13T20:00:00+00:00',
  aisles: [
    { name: 'Crèmerie', position: 0 },
    { name: 'Épicerie', position: 1 },
  ],
  recipes: [
    {
      tags: ['dessert'],
      steps: [{ text: 'Mélanger.' }, { text: 'Cuire.', minutes: 20 }],
      title: 'Crêpes',
      source: 'Claude',
      servings: 4,
      description: 'Du dimanche',
      ingredients: [
        { name: 'Farine', note: 'tamisée', unit: 'g', section: 'Pâte', quantity: 250 },
        { name: 'Œuf', unit: 'piece', section: 'Pâte', quantity: 3, piece_weight_g: 55 },
        { name: 'Lait', unit: 'ml', quantity: 500, density_g_per_ml: 1.03 },
        { name: 'Sel', optional: true },
      ],
      prep_minutes: 10,
    },
    { title: '', ingredients: [{ name: 'X', quantity: 1, unit: 'louche' }] },
  ],
  inventory: [
    { note: null, unit: 'l', quantity: 1, date_type: 'DLC', expires_on: '2026-10-20', ingredient: 'Lait' },
  ],
  ingredients: [
    { name: 'Œuf', aisle: 'Crèmerie', ciqual_code: 22000, default_unit: 'piece', kcal_per_100g: null, piece_weight_g: 55, density_g_per_ml: null },
  ],
  shopping_list: [{ unit: 'piece', checked: true, quantity: 6, ingredient: 'Œuf' }],
}

describe('parseBackup', () => {
  it('lit une sauvegarde et relit ses recettes comme à l’import', () => {
    const { parsed, error } = parseBackup(JSON.stringify(BACKUP, null, 2))
    expect(error).toBeNull()
    expect(parsed!.backup.aisles).toHaveLength(2)
    const [crepes, broken] = parsed!.recipes
    expect(crepes.errors).toEqual([])
    expect(crepes.payload).toMatchObject({
      title: 'Crêpes',
      servings: 4,
      prep_minutes: 10,
      cook_minutes: null,
      tags: ['dessert'],
      steps: [{ text: 'Mélanger.' }, { text: 'Cuire.', minutes: 20 }],
    })
    expect(crepes.payload.ingredients.map((i) => [i.name, i.quantity, i.unit, i.optional])).toEqual([
      ['Farine', 250, 'g', false],
      ['Œuf', 3, 'piece', false],
      ['Lait', 500, 'ml', false],
      ['Sel', null, null, true],
    ])
    expect(broken.errors.length).toBeGreaterThan(0)
  })

  it('refuse les fichiers qui ne sont pas des sauvegardes', () => {
    expect(parseBackup('n’importe quoi').error).toMatch(/illisible/)
    expect(parseBackup('[1,2]').error).toMatch(/pas une sauvegarde/)
    expect(parseBackup('{"format":"foodhelp","recipes":[]}').error).toMatch(/Importer/)
    expect(parseBackup('{"format":"autre"}').error).toMatch(/foodhelp-backup/)
  })

  it('tolère des sections absentes', () => {
    const { parsed } = parseBackup('{"format":"foodhelp-backup","version":1}')
    expect(parsed!.backup).toMatchObject({ recipes: [], ingredients: [], aisles: [], inventory: [], shopping_list: [] })
  })
})

describe('restorePayload', () => {
  const { parsed } = parseBackup(JSON.stringify(BACKUP))

  it('ne garde que les sections et recettes choisies (sans recette en erreur)', () => {
    const payload = restorePayload(parsed!, {
      ingredients: true,
      recipes: new Set([0, 1]),
      inventory: false,
      shopping: true,
    })
    expect(payload.format).toBe('foodhelp-backup')
    expect(payload.aisles).toHaveLength(2)
    expect(payload.ingredients).toHaveLength(1)
    expect(payload.recipes.map((r) => r.title)).toEqual(['Crêpes'])
    expect(payload.inventory).toEqual([])
    expect(payload.shopping_list).toHaveLength(1)
  })

  it('peut ne restaurer que le stock', () => {
    const payload = restorePayload(parsed!, {
      ingredients: false,
      recipes: new Set(),
      inventory: true,
      shopping: false,
    })
    expect(payload).toMatchObject({ aisles: [], ingredients: [], recipes: [], shopping_list: [] })
    expect(payload.inventory).toHaveLength(1)
  })
})

describe('backupFileName', () => {
  it('date locale', () => {
    expect(backupFileName(new Date(2026, 9, 3, 23, 59))).toBe('foodhelp-sauvegarde-2026-10-03.json')
  })
})
