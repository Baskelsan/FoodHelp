import { useMemo, useState, type FormEvent } from 'react'
import type { Aisle, ShoppingListItem, Unit } from '../lib/db-types.ts'
import {
  addInventoryItems,
  deleteShoppingItems,
  describeError,
  fetchUnits,
  findOrCreateIngredient,
  insertShoppingItems,
  listIngredients,
  updateShoppingItem,
} from '../lib/data.ts'
import { href, paths } from '../lib/router.ts'
import { mergeIntoList } from '../lib/shopping.ts'
import { formatQuantity, parseQuantity, type Conversion } from '../lib/units.ts'
import { useAsync } from '../lib/useAsync.ts'
import { useShoppingList } from './useShoppingList.ts'

const NO_AISLE = '__none__'

function itemName(item: ShoppingListItem): string {
  return item.ingredient?.name ?? item.label ?? '?'
}

function itemQuantity(item: ShoppingListItem, units: Map<string, Unit>): string | null {
  if (item.quantity === null || !item.unit) return null
  const unit = units.get(item.unit)
  return unit ? formatQuantity(item.quantity, unit, units) : `${item.quantity} ${item.unit}`
}

/** Articles non cochés groupés par rayon, dans l'ordre des rayons. */
function groupByAisle(items: ShoppingListItem[], aisles: Aisle[]) {
  const groups = new Map<string, ShoppingListItem[]>()
  for (const item of items) {
    const key = item.ingredient?.aisle_id ?? NO_AISLE
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  const ordered: { id: string; name: string; items: ShoppingListItem[] }[] = []
  for (const aisle of aisles) {
    const list = groups.get(aisle.id)
    if (list) ordered.push({ id: aisle.id, name: aisle.name, items: list })
    groups.delete(aisle.id)
  }
  // Rayon supprimé ou inconnu : regroupé avec « Sans rayon »
  const rest = [...groups.values()].flat()
  if (rest.length) ordered.push({ id: NO_AISLE, name: 'Sans rayon', items: rest })
  for (const group of ordered) {
    group.items.sort((a, b) => itemName(a).localeCompare(itemName(b), 'fr'))
  }
  return ordered
}

export default function ShoppingScreen() {
  const list = useShoppingList()
  const unitsQuery = useAsync(fetchUnits, [])
  const units = useMemo(
    () => new Map((unitsQuery.data ?? []).map((u) => [u.code, u])),
    [unitsQuery.data],
  )
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const items = list.items ?? []
  const unchecked = items.filter((i) => !i.checked)
  const checked = items.filter((i) => i.checked)
  const groups = groupByAisle(unchecked, list.aisles)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      await list.reload()
    } catch (e) {
      setActionError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  function removeItem(item: ShoppingListItem) {
    void run(() => deleteShoppingItems([item.id]))
  }

  function finishShopping() {
    const toStock = checked.filter((i) => i.ingredient_id)
    const message =
      `Terminer les courses ?\n\n${checked.length} article${checked.length > 1 ? 's' : ''} ` +
      `coché${checked.length > 1 ? 's' : ''} ${checked.length > 1 ? 'seront retirés' : 'sera retiré'} de la liste` +
      (toStock.length ? `, dont ${toStock.length} ajouté${toStock.length > 1 ? 's' : ''} au stock.` : '.')
    if (!window.confirm(message)) return
    void run(async () => {
      await addInventoryItems(
        toStock.map((i) => ({ ingredient_id: i.ingredient_id!, quantity: i.quantity, unit: i.unit })),
      )
      await deleteShoppingItems(checked.map((i) => i.id))
    })
  }

  function clearChecked() {
    if (!window.confirm('Retirer les articles cochés sans les ajouter au stock ?')) return
    void run(() => deleteShoppingItems(checked.map((i) => i.id)))
  }

  const savedTime = list.savedAt
    ? new Date(list.savedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
    : null

  return (
    <>
      <header className="app-header header-row">
        <h1>Courses</h1>
        <div className="header-actions">
          <a className="button button-small button-secondary" href={href(paths.aisles)}>
            Rayons
          </a>
          <a className="button button-small" href={href(paths.shoppingGenerate)}>
            + Recettes
          </a>
        </div>
      </header>

      <main className="app-main">
        {list.offline && (
          <p className="offline-banner" role="status">
            Hors ligne{savedTime ? ` · liste du ${savedTime}` : ''}.
            {list.pendingCount > 0 &&
              ` ${list.pendingCount} coche${list.pendingCount > 1 ? 's' : ''} en attente d’envoi.`}
          </p>
        )}

        <AddItemForm
          units={unitsQuery.data ?? []}
          unitsByCode={units}
          items={items}
          disabled={busy}
          onAdded={list.reload}
        />

        {list.loading && !list.items && <p className="muted">Chargement…</p>}
        {list.error && (
          <div className="stack">
            <p className="error" role="alert">{list.error}</p>
            <button type="button" className="button button-secondary" onClick={list.reload}>
              Réessayer
            </button>
          </div>
        )}
        {actionError && <p className="error" role="alert">{actionError}</p>}

        {list.items && items.length === 0 && (
          <div className="card empty">
            <p>La liste est vide.</p>
            <a className="button" href={href(paths.shoppingGenerate)}>
              Ajouter depuis des recettes
            </a>
          </div>
        )}

        {groups.map((group) => (
          <section key={group.id}>
            <h2 className="aisle-title">{group.name}</h2>
            <ul className="shopping-list">
              {group.items.map((item) => (
                <ShoppingRow
                  key={item.id}
                  item={item}
                  quantity={itemQuantity(item, units)}
                  onToggle={() => void list.toggle(item.id)}
                  onRemove={() => removeItem(item)}
                  disabled={busy}
                />
              ))}
            </ul>
          </section>
        ))}

        {checked.length > 0 && (
          <section>
            <h2 className="aisle-title">Dans le panier ({checked.length})</h2>
            <ul className="shopping-list">
              {checked.map((item) => (
                <ShoppingRow
                  key={item.id}
                  item={item}
                  quantity={itemQuantity(item, units)}
                  onToggle={() => void list.toggle(item.id)}
                  onRemove={() => removeItem(item)}
                  disabled={busy}
                />
              ))}
            </ul>
            <div className="stack-sm finish">
              <button type="button" className="button" onClick={finishShopping} disabled={busy || list.offline}>
                Terminer les courses
              </button>
              <button type="button" className="link-button" onClick={clearChecked} disabled={busy || list.offline}>
                Retirer les cochés sans les mettre en stock
              </button>
              {list.offline && (
                <p className="muted small center">Disponible au retour du réseau.</p>
              )}
            </div>
          </section>
        )}
      </main>
    </>
  )
}

interface ShoppingRowProps {
  item: ShoppingListItem
  quantity: string | null
  onToggle: () => void
  onRemove: () => void
  disabled: boolean
}

function ShoppingRow({ item, quantity, onToggle, onRemove, disabled }: ShoppingRowProps) {
  return (
    <li className={item.checked ? 'shopping-row shopping-row-checked' : 'shopping-row'}>
      <button
        type="button"
        className="shopping-toggle"
        role="checkbox"
        aria-checked={item.checked}
        onClick={onToggle}
      >
        <span className="tick" aria-hidden="true">{item.checked ? '✓' : ''}</span>
        <span className="shopping-name">{itemName(item)}</span>
        {quantity && <span className="shopping-qty">{quantity}</span>}
      </button>
      {item.ingredient && (
        <a
          className="icon-button"
          href={href(paths.ingredient(item.ingredient.id))}
          aria-label={`Fiche de ${itemName(item)} (rayon, conversions)`}
        >
          ✎
        </a>
      )}
      <button
        type="button"
        className="icon-button icon-danger"
        aria-label={`Retirer ${itemName(item)} de la liste`}
        onClick={onRemove}
        disabled={disabled}
      >
        ✕
      </button>
    </li>
  )
}

function AddItemForm({
  units,
  unitsByCode,
  items,
  disabled,
  onAdded,
}: {
  units: Unit[]
  unitsByCode: Map<string, Unit>
  items: ShoppingListItem[]
  disabled: boolean
  onAdded: () => Promise<void>
}) {
  const catalog = useAsync(listIngredients, [])
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('piece')
  const [unitTouched, setUnitTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onNameChange(value: string) {
    setName(value)
    const known = catalog.data?.find((c) => c.name.toLowerCase() === value.trim().toLowerCase())
    if (known && !unitTouched) setUnit(known.default_unit)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    const qty = quantity.trim() ? parseQuantity(quantity) : null
    if (quantity.trim() && (qty === null || qty <= 0)) {
      setError('Quantité invalide (ex. 2, 1,5 ou 1/2).')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const ingredient = await findOrCreateIngredient(name, unit, catalog.data ?? [])
      // Même règle que depuis les recettes : cumul avec un article compatible déjà listé
      const convs = new Map<string, Conversion>()
      for (const item of items) {
        if (item.ingredient) convs.set(item.ingredient.id, item.ingredient)
      }
      const changes = mergeIntoList(
        [
          {
            key: ingredient.id,
            ingredientId: ingredient.id,
            name: ingredient.name,
            quantity: qty,
            unit: qty === null ? null : unit,
            inStock: false,
            fromStock: 0,
            recipeIds: [],
          },
        ],
        items.map((i) => ({
          id: i.id,
          ingredientId: i.ingredient_id,
          quantity: i.quantity,
          unit: i.unit,
          checked: i.checked,
          recipeId: i.recipe_id,
        })),
        unitsByCode,
        convs,
      )
      for (const { id, ...patch } of changes.updates) await updateShoppingItem(id, patch)
      await insertShoppingItems(changes.inserts)
      setName('')
      setQuantity('')
      setUnitTouched(false)
      catalog.reload()
      await onAdded()
    } catch (e) {
      setError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card add-item" onSubmit={onSubmit}>
      <datalist id="shopping-catalog">
        {(catalog.data ?? []).map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
      <input
        list="shopping-catalog"
        placeholder="Ajouter un article"
        aria-label="Article à ajouter"
        autoCapitalize="sentences"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        disabled={saving || disabled}
      />
      {name.trim() && (
        <div className="add-item-details">
          <input
            className="qty-input"
            inputMode="decimal"
            placeholder="Qté"
            aria-label="Quantité (facultative)"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            disabled={saving || disabled}
          />
          <select
            aria-label="Unité"
            value={unit}
            onChange={(e) => {
              setUnit(e.target.value)
              setUnitTouched(true)
            }}
            disabled={saving || disabled}
          >
            {units.map((u) => (
              <option key={u.code} value={u.code}>
                {u.label}
              </option>
            ))}
          </select>
          <button type="submit" className="button button-small" disabled={saving || disabled}>
            {saving ? '…' : 'Ajouter'}
          </button>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  )
}
