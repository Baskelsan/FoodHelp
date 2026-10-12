import type { DateType } from './db-types.ts'

/**
 * expired : DLC dépassée (rouge)
 * soon    : DLC dans les prochains jours, ou DDM dépassée (orange)
 * ok      : rien à signaler
 * none    : pas de date
 */
export type ExpiryState = 'expired' | 'soon' | 'ok' | 'none'

export interface Expiry {
  state: ExpiryState
  label: string | null
  /** Jours restants (négatif si dépassé), null sans date */
  days: number | null
}

/** Nombre de jours avant la DLC à partir duquel on prévient */
export const SOON_DAYS = 3

/** Date locale à minuit depuis "AAAA-MM-JJ" */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function daysUntil(iso: string, today: Date = new Date()): number {
  const ms = parseLocalDate(iso).getTime() - startOfDay(today).getTime()
  return Math.round(ms / 86_400_000)
}

const shortDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

export function expiryOf(
  expiresOn: string | null,
  dateType: DateType | null,
  today: Date = new Date(),
): Expiry {
  if (!expiresOn || !dateType) return { state: 'none', label: null, days: null }
  const days = daysUntil(expiresOn, today)

  if (dateType === 'DDM') {
    if (days < 0) return { state: 'soon', label: 'DDM dépassée', days }
    return { state: 'ok', label: `DDM ${shortDate.format(parseLocalDate(expiresOn))}`, days }
  }

  if (days < 0) {
    return { state: 'expired', label: `DLC dépassée depuis ${-days} j`, days }
  }
  if (days === 0) return { state: 'soon', label: 'DLC aujourd’hui', days }
  if (days === 1) return { state: 'soon', label: 'DLC demain', days }
  if (days <= SOON_DAYS) return { state: 'soon', label: `DLC dans ${days} j`, days }
  return { state: 'ok', label: `DLC ${shortDate.format(parseLocalDate(expiresOn))}`, days }
}
