import { useMemo, useState } from 'react'
import type { InventoryItem, Unit } from '../lib/db-types.ts'
import { deleteInventoryItem, describeError, fetchUnits, listInventory } from '../lib/data.ts'
import { expiryOf, type Expiry } from '../lib/expiry.ts'
import { href, paths } from '../lib/router.ts'
import { formatQuantity } from '../lib/units.ts'
import { useAsync } from '../lib/useAsync.ts'
import { normalize } from '../recipes/RecipeListScreen.tsx'

async function load() {
  const [items, units] = await Promise.all([listInventory(), fetchUnits()])
  return { items, units }
}

interface Row {
  item: InventoryItem
  expiry: Expiry
}

export default function InventoryScreen() {
  const { data, error, loading, reload } = useAsync(load, [])
  const [query, setQuery] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const units = useMemo(() => new Map((data?.units ?? []).map((u) => [u.code, u])), [data])

  const { urgent, others } = useMemo(() => {
    const q = normalize(query.trim())
    const rows: Row[] = (data?.items ?? [])
      .filter((item) => !q || normalize(item.ingredient.name).includes(q))
      .map((item) => ({ item, expiry: expiryOf(item.expires_on, item.date_type) }))
    const urgent = rows
      .filter((r) => r.expiry.state === 'expired' || r.expiry.state === 'soon')
      .sort((a, b) => a.expiry.days! - b.expiry.days!)
    const others = rows
      .filter((r) => r.expiry.state === 'ok' || r.expiry.state === 'none')
      .sort((a, b) => a.item.ingredient.name.localeCompare(b.item.ingredient.name, 'fr'))
    return { urgent, others }
  }, [data, query])

  async function markDone(item: InventoryItem) {
    setRemoving(item.id)
    setActionError(null)
    try {
      await deleteInventoryItem(item.id)
      reload()
    } catch (e) {
      setActionError(describeError(e))
    } finally {
      setRemoving(null)
    }
  }

  const total = data?.items.length ?? 0

  return (
    <>
      <header className="app-header header-row">
        <h1>Stock</h1>
        <a className="button button-small" href={href(paths.inventoryNew)}>
          + Ajouter
        </a>
      </header>

      <main className="app-main">
        {total > 5 && (
          <input
            type="search"
            placeholder="Rechercher dans le stock"
            aria-label="Rechercher dans le stock"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}

        {loading && !data && <p className="muted">Chargement…</p>}
        {error && (
          <div className="stack">
            <p className="error" role="alert">{error}</p>
            <button type="button" className="button button-secondary" onClick={reload}>
              Réessayer
            </button>
          </div>
        )}
        {actionError && <p className="error" role="alert">{actionError}</p>}

        {data && total === 0 && (
          <div className="card empty">
            <p>Ton stock est vide.</p>
            <a className="button" href={href(paths.inventoryNew)}>
              Ajouter un produit
            </a>
          </div>
        )}

        {urgent.length > 0 && (
          <section>
            <h2>À consommer vite</h2>
            <ul className="list">
              {urgent.map((row) => (
                <InventoryRow
                  key={row.item.id}
                  row={row}
                  units={units}
                  removing={removing === row.item.id}
                  onDone={() => markDone(row.item)}
                />
              ))}
            </ul>
          </section>
        )}

        {others.length > 0 && (
          <section>
            {urgent.length > 0 && <h2>Le reste</h2>}
            <ul className="list">
              {others.map((row) => (
                <InventoryRow
                  key={row.item.id}
                  row={row}
                  units={units}
                  removing={removing === row.item.id}
                  onDone={() => markDone(row.item)}
                />
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  )
}

function InventoryRow({
  row,
  units,
  removing,
  onDone,
}: {
  row: Row
  units: Map<string, Unit>
  removing: boolean
  onDone: () => void
}) {
  const { item, expiry } = row
  const unit = item.unit ? units.get(item.unit) : undefined
  const quantity = item.quantity !== null && unit ? formatQuantity(item.quantity, unit, units) : null

  return (
    <li className={`stock-row expiry-${expiry.state}`}>
      <a className="stock-main" href={href(paths.inventoryItem(item.id))}>
        <span className="list-title">{item.ingredient.name}</span>
        <span className="stock-meta">
          {quantity && <span>{quantity}</span>}
          {expiry.label && <span className="expiry-label">{expiry.label}</span>}
          {item.note && <span className="muted">{item.note}</span>}
        </span>
      </a>
      <button
        type="button"
        className="button button-small button-secondary"
        onClick={onDone}
        disabled={removing}
        aria-label={`Retirer ${item.ingredient.name} du stock (terminé)`}
      >
        {removing ? '…' : 'Terminé'}
      </button>
    </li>
  )
}
