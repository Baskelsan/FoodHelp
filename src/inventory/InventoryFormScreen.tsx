import { useState, type FormEvent } from 'react'
import type { DateType, IngredientSummary, InventoryItem, Unit } from '../lib/db-types.ts'
import {
  addInventoryItems,
  deleteInventoryItem,
  describeError,
  fetchUnits,
  findOrCreateIngredient,
  getInventoryItem,
  listIngredients,
  updateInventoryItem,
} from '../lib/data.ts'
import { href, navigate, paths } from '../lib/router.ts'
import { parseQuantity } from '../lib/units.ts'
import { useAsync } from '../lib/useAsync.ts'

async function load(id: string | undefined) {
  const [item, units, catalog] = await Promise.all([
    id ? getInventoryItem(id) : Promise.resolve(null),
    fetchUnits(),
    listIngredients(),
  ])
  return { item, units, catalog }
}

export default function InventoryFormScreen({ id }: { id?: string }) {
  const { data, error, loading, reload } = useAsync(() => load(id), [id])

  if (loading && !data) {
    return (
      <main className="app-main">
        <p className="muted">Chargement…</p>
      </main>
    )
  }
  if (error || !data || (id && !data.item)) {
    return (
      <main className="app-main">
        <a className="back-link" href={href(paths.inventory)}>‹ Stock</a>
        <p className="error" role="alert">{error ?? 'Ce produit n’est plus dans le stock.'}</p>
        {error && (
          <button type="button" className="button button-secondary" onClick={reload}>
            Réessayer
          </button>
        )}
      </main>
    )
  }
  return <InventoryForm item={data.item} units={data.units} catalog={data.catalog} />
}

function InventoryForm({
  item,
  units,
  catalog,
}: {
  item: InventoryItem | null
  units: Unit[]
  catalog: IngredientSummary[]
}) {
  const [name, setName] = useState(item?.ingredient.name ?? '')
  const [quantity, setQuantity] = useState(item?.quantity?.toString().replace('.', ',') ?? '')
  const [unit, setUnit] = useState(item?.unit ?? item?.ingredient.default_unit ?? 'piece')
  const [unitTouched, setUnitTouched] = useState(!!item)
  const [expiresOn, setExpiresOn] = useState(item?.expires_on ?? '')
  const [dateType, setDateType] = useState<DateType>(item?.date_type ?? 'DLC')
  const [note, setNote] = useState(item?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onNameChange(value: string) {
    setName(value)
    const known = catalog.find((c) => c.name.toLowerCase() === value.trim().toLowerCase())
    if (known && !unitTouched) setUnit(known.default_unit)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Indique le produit.')
      return
    }
    const qty = quantity.trim() ? parseQuantity(quantity) : null
    if (quantity.trim() && (qty === null || qty <= 0)) {
      setError('Quantité invalide (ex. 2, 1,5 ou 1/2), ou laisse vide.')
      return
    }
    setSaving(true)
    try {
      const ingredient = await findOrCreateIngredient(name, unit, catalog)
      const values = {
        ingredient_id: ingredient.id,
        quantity: qty,
        unit: qty === null ? null : unit,
        expires_on: expiresOn || null,
        date_type: expiresOn ? dateType : null,
        note: note.trim() || null,
      }
      if (item) await updateInventoryItem(item.id, values)
      else await addInventoryItems([values])
      navigate(paths.inventory, { replace: true })
    } catch (e) {
      setError(describeError(e))
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!item || !window.confirm(`Retirer « ${item.ingredient.name} » du stock ?`)) return
    setSaving(true)
    try {
      await deleteInventoryItem(item.id)
      navigate(paths.inventory, { replace: true })
    } catch (e) {
      setError(describeError(e))
      setSaving(false)
    }
  }

  return (
    <>
      <header className="app-header">
        <a className="back-link" href={href(paths.inventory)}>‹ Annuler</a>
        <h1>{item ? 'Modifier' : 'Ajouter au stock'}</h1>
      </header>
      <main className="app-main">
        <form className="stack" onSubmit={onSubmit} noValidate>
          <datalist id="inventory-catalog">
            {catalog.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
          <label className="field">
            <span>Produit</span>
            <input
              list="inventory-catalog"
              placeholder="ex. lait"
              autoCapitalize="sentences"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
            />
          </label>

          <div className="field">
            <span>Quantité (facultative)</span>
            <div className="ingredient-inputs">
              <input
                inputMode="decimal"
                placeholder="Qté"
                aria-label="Quantité"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <select
                aria-label="Unité"
                value={unit}
                onChange={(e) => {
                  setUnit(e.target.value)
                  setUnitTouched(true)
                }}
              >
                {units.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            <span className="muted small">Sans quantité, le produit compte comme « j’en ai ».</span>
          </div>

          <div className="field">
            <span>Date (facultative)</span>
            <div className="date-row">
              <input
                type="date"
                aria-label="Date de péremption"
                value={expiresOn}
                onChange={(e) => setExpiresOn(e.target.value)}
              />
              <div className="segmented" role="radiogroup" aria-label="Type de date">
                {(['DLC', 'DDM'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={dateType === t}
                    className={dateType === t ? 'segment segment-active' : 'segment'}
                    onClick={() => setDateType(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <span className="muted small">
              DLC « à consommer jusqu’au » · DDM « à consommer de préférence avant ».
            </span>
          </div>

          <label className="field">
            <span>Note</span>
            <input
              placeholder="ex. entamé, au congélateur"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" className="button" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          {item && (
            <>
              <a className="link-button center" href={href(paths.ingredient(item.ingredient.id))}>
                Fiche de l’ingrédient (rayon, conversions)
              </a>
              <button
                type="button"
                className="button button-danger"
                onClick={onDelete}
                disabled={saving}
              >
                Retirer du stock
              </button>
            </>
          )}
        </form>
      </main>
    </>
  )
}
