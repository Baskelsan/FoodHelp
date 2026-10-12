import { describe, expect, it } from 'vitest'
import type { Unit } from './db-types.ts'
import {
  convert,
  formatQuantity,
  formatServings,
  limitingFactor,
  parseQuantity,
  roundForDisplay,
} from './units.ts'

// Mêmes valeurs que la migration initiale
const UNITS: Unit[] = [
  ['g', 'g', 'g', 'g', 1],
  ['kg', 'kg', 'kg', 'g', 1000],
  ['pincee', 'pincée', 'pincées', 'g', 0.4],
  ['ml', 'ml', 'ml', 'ml', 1],
  ['cl', 'cl', 'cl', 'ml', 10],
  ['dl', 'dl', 'dl', 'ml', 100],
  ['l', 'l', 'l', 'ml', 1000],
  ['cc', 'c. à café', 'c. à café', 'ml', 5],
  ['cs', 'c. à soupe', 'c. à soupe', 'ml', 15],
  ['tasse', 'tasse', 'tasses', 'ml', 250],
  ['verre', 'verre', 'verres', 'ml', 200],
  ['piece', 'pièce', 'pièces', 'piece', 1],
  ['gousse', 'gousse', 'gousses', 'piece', 1],
].map(([code, label, label_plural, base_unit, to_base], i) => ({
  code,
  label,
  label_plural,
  base_unit,
  to_base,
  sort_order: i,
})) as Unit[]

const U = new Map(UNITS.map((u) => [u.code, u]))
const u = (code: string) => U.get(code)!

describe('convert', () => {
  it('convertit dans une même dimension', () => {
    expect(convert(30, u('cl'), u('ml'))).toBe(300)
    expect(convert(2, u('cs'), u('cc'))).toBe(6)
    expect(convert(1.5, u('kg'), u('g'))).toBe(1500)
  })

  it('passe par les grammes entre dimensions quand l’ingrédient le permet', () => {
    const oeuf = { density_g_per_ml: null, piece_weight_g: 55 }
    expect(convert(110, u('g'), u('piece'), oeuf)).toBe(2)
    const huile = { density_g_per_ml: 0.92, piece_weight_g: null }
    expect(convert(100, u('ml'), u('g'), huile)).toBeCloseTo(92)
  })

  it('renvoie null quand la conversion est impossible', () => {
    expect(convert(100, u('ml'), u('g'))).toBeNull()
    expect(convert(2, u('piece'), u('g'), { density_g_per_ml: 1, piece_weight_g: null })).toBeNull()
  })
})

describe('limitingFactor', () => {
  it('calcule le facteur depuis un ingrédient limitant', () => {
    expect(
      limitingFactor({ quantity: 425, unit: u('ml') }, { quantity: 500, unit: u('ml') }),
    ).toBeCloseTo(0.85)
    expect(
      limitingFactor({ quantity: 2, unit: u('piece') }, { quantity: 3, unit: u('piece') }),
    ).toBeCloseTo(2 / 3)
  })

  it('accepte une autre unité de la même dimension', () => {
    expect(
      limitingFactor({ quantity: 25, unit: u('cl') }, { quantity: 500, unit: u('ml') }),
    ).toBeCloseTo(0.5)
  })

  it('renvoie null si impossible ou quantité nulle', () => {
    expect(
      limitingFactor({ quantity: 200, unit: u('g') }, { quantity: 500, unit: u('ml') }),
    ).toBeNull()
    expect(
      limitingFactor({ quantity: 0, unit: u('ml') }, { quantity: 500, unit: u('ml') }),
    ).toBeNull()
  })
})

describe('roundForDisplay', () => {
  it('arrondit au quart pour les pièces et cuillères', () => {
    expect(roundForDisplay(2 / 3, u('piece'))).toBe(0.75)
    expect(roundForDisplay(0.05, u('cs'))).toBe(0.25)
  })

  it('arrondit g / ml selon l’ordre de grandeur', () => {
    expect(roundForDisplay(212.5, u('g'))).toBe(215)
    expect(roundForDisplay(42.4, u('ml'))).toBe(42)
    expect(roundForDisplay(7.3, u('g'))).toBe(7.5)
  })
})

describe('formatQuantity', () => {
  it('formate avec unité et pluriel', () => {
    expect(formatQuantity(250, u('g'), U)).toBe('250 g')
    expect(formatQuantity(1.5, u('cs'), U)).toBe('1 ½ c. à soupe')
    expect(formatQuantity(0.5, u('gousse'), U)).toBe('½ gousse')
    expect(formatQuantity(3, u('gousse'), U)).toBe('3 gousses')
    expect(formatQuantity(2, u('tasse'), U)).toBe('2 tasses')
  })

  it('n’affiche que le nombre pour les pièces', () => {
    expect(formatQuantity(3, u('piece'), U)).toBe('3')
    expect(formatQuantity(2 / 3, u('piece'), U)).toBe('¾')
  })

  it('passe en kg / l au-delà de 1000 et revient en g / ml en dessous', () => {
    expect(formatQuantity(1500, u('g'), U)).toBe('1,5 kg')
    expect(formatQuantity(120, u('cl'), U)).toBe('1,2 l')
    expect(formatQuantity(0.25, u('kg'), U)).toBe('250 g')
    expect(formatQuantity(0.5, u('l'), U)).toBe('500 ml')
  })
})

describe('formatServings', () => {
  it('affiche un entier ou une décimale', () => {
    expect(formatServings(4)).toBe('4')
    expect(formatServings(3.4)).toBe('3,4')
    expect(formatServings(10 / 3)).toBe('3,3')
  })
})

describe('parseQuantity', () => {
  it('lit les formats courants', () => {
    expect(parseQuantity('1,5')).toBe(1.5)
    expect(parseQuantity('1.5')).toBe(1.5)
    expect(parseQuantity(' 425 ')).toBe(425)
    expect(parseQuantity('1/2')).toBe(0.5)
    expect(parseQuantity('1 1/2')).toBe(1.5)
    expect(parseQuantity('.5')).toBe(0.5)
  })

  it('refuse les saisies invalides', () => {
    expect(parseQuantity('')).toBeNull()
    expect(parseQuantity('abc')).toBeNull()
    expect(parseQuantity('1/0')).toBeNull()
    expect(parseQuantity('-2')).toBeNull()
  })
})
