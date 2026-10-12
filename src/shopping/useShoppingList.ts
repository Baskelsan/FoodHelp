import { useCallback, useEffect, useRef, useState } from 'react'
import type { Aisle, ShoppingListItem } from '../lib/db-types.ts'
import { describeError, listAisles, listShopping, updateShoppingItem } from '../lib/data.ts'

// La dernière liste est gardée sur le téléphone pour rester consultable sans réseau
// au magasin ; les coches faites hors ligne sont envoyées au retour du réseau.

const CACHE_KEY = 'foodhelp-shopping-cache'
const PENDING_KEY = 'foodhelp-shopping-pending'

interface Cache {
  items: ShoppingListItem[]
  aisles: Aisle[]
  savedAt: string
}

/** Coches en attente d'envoi : id de l'article -> état coché */
type Pending = Record<string, boolean>

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // stockage plein ou indisponible : la liste restera seulement en mémoire
  }
}

/** À appeler à la déconnexion : ne laisse pas la liste sur l'appareil. */
export function clearShoppingCache() {
  try {
    localStorage.removeItem(CACHE_KEY)
    localStorage.removeItem(PENDING_KEY)
  } catch {
    // rien à faire
  }
}

function applyPending(items: ShoppingListItem[], pending: Pending): ShoppingListItem[] {
  return items.map((item) => (item.id in pending ? { ...item, checked: pending[item.id] } : item))
}

export function useShoppingList() {
  const cache = useRef(read<Cache>(CACHE_KEY))
  const [items, setItems] = useState<ShoppingListItem[] | null>(() =>
    cache.current ? applyPending(cache.current.items, read<Pending>(PENDING_KEY) ?? {}) : null,
  )
  const [aisles, setAisles] = useState<Aisle[]>(cache.current?.aisles ?? [])
  const [savedAt, setSavedAt] = useState<string | null>(cache.current?.savedAt ?? null)
  const [offline, setOffline] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingCount, setPendingCount] = useState(
    () => Object.keys(read<Pending>(PENDING_KEY) ?? {}).length,
  )

  const save = useCallback((nextItems: ShoppingListItem[], nextAisles: Aisle[]) => {
    const savedAt = new Date().toISOString()
    write(CACHE_KEY, { items: nextItems, aisles: nextAisles, savedAt } satisfies Cache)
    setSavedAt(savedAt)
  }, [])

  /** Envoie les coches en attente ; renvoie celles qui n'ont pas pu partir. */
  const flush = useCallback(async (): Promise<Pending> => {
    const pending = read<Pending>(PENDING_KEY) ?? {}
    for (const [id, checked] of Object.entries(pending)) {
      try {
        await updateShoppingItem(id, { checked })
        delete pending[id]
      } catch {
        break
      }
    }
    write(PENDING_KEY, pending)
    setPendingCount(Object.keys(pending).length)
    return pending
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const pending = await flush()
      const [fresh, freshAisles] = await Promise.all([listShopping(), listAisles()])
      const merged = applyPending(fresh, pending)
      setItems(merged)
      setAisles(freshAisles)
      save(merged, freshAisles)
      setOffline(Object.keys(pending).length > 0)
    } catch (e) {
      setOffline(true)
      if (!cache.current) setError(describeError(e))
    } finally {
      setLoading(false)
    }
  }, [flush, save])

  useEffect(() => {
    void reload()
    const onOnline = () => void reload()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [reload])

  const itemsRef = useRef(items)
  itemsRef.current = items

  const toggle = useCallback(
    async (id: string) => {
      const next = (itemsRef.current ?? []).map((i) =>
        i.id === id ? { ...i, checked: !i.checked } : i,
      )
      itemsRef.current = next
      setItems(next)
      const checked = next.find((i) => i.id === id)?.checked ?? false
      save(next, aisles)

      const pending = read<Pending>(PENDING_KEY) ?? {}
      pending[id] = checked
      write(PENDING_KEY, pending)
      setPendingCount(Object.keys(pending).length)

      const remaining = await flush()
      setOffline(Object.keys(remaining).length > 0)
    },
    [aisles, flush, save],
  )

  return { items, aisles, savedAt, offline, error, loading, pendingCount, reload, toggle }
}
