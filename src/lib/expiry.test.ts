import { describe, expect, it } from 'vitest'
import { daysUntil, expiryOf } from './expiry.ts'

// 12 octobre 2026 en milieu de journée
const TODAY = new Date(2026, 9, 12, 15, 30)

describe('daysUntil', () => {
  it('compte en jours calendaires', () => {
    expect(daysUntil('2026-10-12', TODAY)).toBe(0)
    expect(daysUntil('2026-10-13', TODAY)).toBe(1)
    expect(daysUntil('2026-10-10', TODAY)).toBe(-2)
    expect(daysUntil('2026-11-01', TODAY)).toBe(20)
  })
})

describe('expiryOf', () => {
  it('sans date', () => {
    expect(expiryOf(null, null, TODAY).state).toBe('none')
  })

  it('DLC', () => {
    expect(expiryOf('2026-10-10', 'DLC', TODAY)).toMatchObject({
      state: 'expired',
      label: 'DLC dépassée depuis 2 j',
    })
    expect(expiryOf('2026-10-12', 'DLC', TODAY)).toMatchObject({ state: 'soon', label: 'DLC aujourd’hui' })
    expect(expiryOf('2026-10-13', 'DLC', TODAY)).toMatchObject({ state: 'soon', label: 'DLC demain' })
    expect(expiryOf('2026-10-15', 'DLC', TODAY)).toMatchObject({ state: 'soon', label: 'DLC dans 3 j' })
    expect(expiryOf('2026-10-16', 'DLC', TODAY).state).toBe('ok')
  })

  it('DDM : seulement signalée une fois dépassée', () => {
    expect(expiryOf('2026-10-11', 'DDM', TODAY)).toMatchObject({ state: 'soon', label: 'DDM dépassée' })
    expect(expiryOf('2026-10-13', 'DDM', TODAY).state).toBe('ok')
  })
})
