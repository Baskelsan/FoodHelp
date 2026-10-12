import type { Unit } from './db-types.ts'

// Mêmes valeurs que la migration initiale
export const UNITS: Unit[] = [
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

export const U = new Map(UNITS.map((u) => [u.code, u]))
export const u = (code: string) => U.get(code)!
