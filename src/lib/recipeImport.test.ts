import { describe, expect, it } from 'vitest'
import { extractJson, parseImport, resolveUnit } from './recipeImport.ts'

const CREPES = {
  format: 'foodhelp',
  version: 1,
  recipes: [
    {
      title: 'Crêpes',
      description: 'Crêpes fines.',
      servings: 4,
      prep_minutes: 10,
      cook_minutes: 20,
      tags: ['Dessert', 'rapide', 'dessert'],
      source: 'Claude',
      notes: 'Laisser reposer.',
      ingredients: [
        { name: 'farine de blé', quantity: 250, unit: 'g' },
        { name: 'œuf', quantity: 3, unit: 'piece', piece_weight_g: 55 },
        { name: 'lait', quantity: 500, unit: 'ml', density_g_per_ml: 1.03 },
        { name: 'rhum', quantity: 1, unit: 'cs', optional: true, section: 'Pâte' },
        { name: 'sel', quantity: null, unit: null },
      ],
      steps: [{ text: 'Mélanger.' }, { text: 'Cuire.', minutes: 20 }],
    },
  ],
}

describe('extractJson', () => {
  it('lit un JSON brut', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
  })

  it('lit un bloc ```json entouré de texte', () => {
    const text = 'Voici la recette :\n```json\n{"a":1}\n```\nBon appétit !'
    expect(extractJson(text)).toEqual({ a: 1 })
  })

  it('lit un objet entouré de texte sans bloc', () => {
    expect(extractJson('Voilà {"a":[1,2]} fin')).toEqual({ a: [1, 2] })
  })

  it('échoue sur un texte sans JSON', () => {
    expect(() => extractJson('pas de json ici')).toThrow()
  })
})

describe('resolveUnit', () => {
  it('reconnaît codes, libellés et anglais', () => {
    expect(resolveUnit('cs')).toBe('cs')
    expect(resolveUnit('c. à soupe')).toBe('cs')
    expect(resolveUnit('Cuillère à café')).toBe('cc')
    expect(resolveUnit('tbsp')).toBe('cs')
    expect(resolveUnit('Grammes')).toBe('g')
    expect(resolveUnit('pièces')).toBe('piece')
    expect(resolveUnit('boîte')).toBe('boite')
    expect(resolveUnit('louche')).toBeNull()
  })
})

describe('parseImport', () => {
  it('lit une recette complète', () => {
    const result = parseImport(JSON.stringify(CREPES))
    expect(result.error).toBeNull()
    expect(result.recipes).toHaveLength(1)
    const [r] = result.recipes
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([])
    expect(r.payload).toMatchObject({
      title: 'Crêpes',
      servings: 4,
      prep_minutes: 10,
      cook_minutes: 20,
      tags: ['dessert', 'rapide'],
      steps: [{ text: 'Mélanger.' }, { text: 'Cuire.', minutes: 20 }],
    })
    expect(r.payload.ingredients).toEqual([
      { name: 'farine de blé', quantity: 250, unit: 'g', optional: false, section: null, note: null },
      { name: 'œuf', quantity: 3, unit: 'piece', optional: false, section: null, note: null, piece_weight_g: 55 },
      { name: 'lait', quantity: 500, unit: 'ml', optional: false, section: null, note: null, density_g_per_ml: 1.03 },
      { name: 'rhum', quantity: 1, unit: 'cs', optional: true, section: 'Pâte', note: null },
      { name: 'sel', quantity: null, unit: null, optional: false, section: null, note: null },
    ])
  })

  it('accepte une recette seule, une liste et un bloc entouré de texte', () => {
    const one = CREPES.recipes[0]
    expect(parseImport(JSON.stringify(one)).recipes).toHaveLength(1)
    expect(parseImport(JSON.stringify([one, one])).recipes).toHaveLength(2)
    expect(parseImport('Voici :\n```json\n' + JSON.stringify(CREPES) + '\n```').recipes).toHaveLength(1)
  })

  it('corrige les petits écarts avec des avertissements', () => {
    const result = parseImport(
      JSON.stringify({
        recipes: [
          {
            title: 'Test',
            servings: '2,5',
            ingredients: [
              { name: 'sucre', quantity: '1/2', unit: 'tasse' },
              { name: 'oignon', quantity: 2 },
              { name: 'huile', quantity: 2, unit: 'c. à soupe', density_g_per_ml: 'beaucoup' },
            ],
            steps: ['Étape en texte simple'],
          },
        ],
      }),
    )
    const [r] = result.recipes
    expect(r.errors).toEqual([])
    expect(r.payload.servings).toBe(3)
    expect(r.payload.ingredients.map((i) => [i.quantity, i.unit])).toEqual([
      [0.5, 'tasse'],
      [2, 'piece'],
      [2, 'cs'],
    ])
    expect(r.payload.ingredients[2]).not.toHaveProperty('density_g_per_ml')
    expect(r.payload.steps).toEqual([{ text: 'Étape en texte simple' }])
    expect(r.warnings).toHaveLength(3)
  })

  it('signale les erreurs bloquantes', () => {
    const result = parseImport(
      JSON.stringify([
        {
          ingredients: [
            { name: 'beurre', quantity: 1, unit: 'louche' },
            { quantity: 2, unit: 'g' },
            { name: 'sel', quantity: 'beaucoup', unit: 'g' },
          ],
        },
      ]),
    )
    const [r] = result.recipes
    expect(r.title).toBe('Recette n° 1')
    expect(r.errors).toEqual([
      'Titre manquant.',
      '« beurre » : unité inconnue « louche ».',
      'Ingrédient n° 2 : nom manquant.',
      '« sel » : quantité invalide ("beaucoup").',
    ])
  })

  it('renvoie une erreur globale pour un texte illisible ou vide', () => {
    expect(parseImport('').error).toBeNull()
    expect(parseImport('bonjour').error).toMatch(/illisible/)
    expect(parseImport('{"foo": 1}').error).toMatch(/Aucune recette/)
    expect(parseImport('{"recipes": []}').error).toMatch(/vide/)
  })

  it('prévient pour un format ou une version inattendus', () => {
    const result = parseImport(JSON.stringify({ ...CREPES, format: 'autre', version: 2 }))
    expect(result.recipes).toHaveLength(1)
    expect(result.warnings).toHaveLength(2)
  })
})
