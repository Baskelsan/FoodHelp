import { useState, type FormEvent } from 'react'
import type { Aisle, Ingredient, Unit } from '../lib/db-types.ts'
import { describeError, fetchUnits, getIngredient, listAisles, updateIngredient } from '../lib/data.ts'
import { parseQuantity } from '../lib/units.ts'
import { useAsync } from '../lib/useAsync.ts'

async function load(id: string) {
  const [ingredient, units, aisles] = await Promise.all([getIngredient(id), fetchUnits(), listAisles()])
  return { ingredient, units, aisles }
}

function goBack() {
  // Ouverte depuis la liste de courses ou le stock : on y retourne
  if (window.history.length > 1) window.history.back()
  else window.location.hash = '/courses'
}

export default function IngredientScreen({ id }: { id: string }) {
  const { data, error, loading, reload } = useAsync(() => load(id), [id])

  if (loading && !data) {
    return (
      <main className="app-main">
        <p className="muted">Chargement…</p>
      </main>
    )
  }
  if (error || !data?.ingredient) {
    return (
      <main className="app-main">
        <button type="button" className="back-link link-like" onClick={goBack}>‹ Retour</button>
        <p className="error" role="alert">{error ?? 'Cet ingrédient n’existe pas (ou plus).'}</p>
        {error && (
          <button type="button" className="button button-secondary" onClick={reload}>
            Réessayer
          </button>
        )}
      </main>
    )
  }
  return <IngredientForm ingredient={data.ingredient} units={data.units} aisles={data.aisles} />
}

const numberText = (n: number | null) => (n === null ? '' : String(n).replace('.', ','))

function IngredientForm({
  ingredient,
  units,
  aisles,
}: {
  ingredient: Ingredient
  units: Unit[]
  aisles: Aisle[]
}) {
  const [name, setName] = useState(ingredient.name)
  const [defaultUnit, setDefaultUnit] = useState(ingredient.default_unit)
  const [aisleId, setAisleId] = useState(ingredient.aisle_id ?? '')
  const [pieceWeight, setPieceWeight] = useState(numberText(ingredient.piece_weight_g))
  const [density, setDensity] = useState(numberText(ingredient.density_g_per_ml))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function optionalPositive(value: string, label: string): number | null | 'invalid' {
    if (!value.trim()) return null
    const n = parseQuantity(value)
    if (n === null || n <= 0) {
      setError(`${label} : nombre positif attendu.`)
      return 'invalid'
    }
    return n
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Le nom est obligatoire.')
      return
    }
    const piece = optionalPositive(pieceWeight, 'Poids par pièce')
    const dens = optionalPositive(density, 'Densité')
    if (piece === 'invalid' || dens === 'invalid') return

    setSaving(true)
    try {
      await updateIngredient(ingredient.id, {
        name: name.trim(),
        default_unit: defaultUnit,
        aisle_id: aisleId || null,
        piece_weight_g: piece,
        density_g_per_ml: dens,
      })
      goBack()
    } catch (e) {
      const message = describeError(e)
      setError(message.includes('duplicate') ? 'Un autre ingrédient porte déjà ce nom.' : message)
      setSaving(false)
    }
  }

  return (
    <>
      <header className="app-header">
        <button type="button" className="back-link link-like" onClick={goBack}>‹ Retour</button>
        <h1>{ingredient.name}</h1>
      </header>
      <main className="app-main">
        <form className="stack" onSubmit={onSubmit} noValidate>
          <label className="field">
            <span>Nom</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label className="field">
            <span>Rayon</span>
            <select value={aisleId} onChange={(e) => setAisleId(e.target.value)}>
              <option value="">Sans rayon</option>
              {aisles.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Unité habituelle</span>
            <select value={defaultUnit} onChange={(e) => setDefaultUnit(e.target.value)}>
              {units.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="fieldset">
            <legend>Conversions</legend>
            <p className="muted hint">
              Facultatif. Permet de passer des pièces ou des ml aux grammes (mise à l’échelle,
              stock, calories).
            </p>
            <label className="field">
              <span>Poids d’une pièce (g)</span>
              <input
                inputMode="decimal"
                placeholder="ex. 55 pour un œuf"
                value={pieceWeight}
                onChange={(e) => setPieceWeight(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Densité (g par ml)</span>
              <input
                inputMode="decimal"
                placeholder="ex. 1,03 pour le lait, 0,92 pour l’huile"
                value={density}
                onChange={(e) => setDensity(e.target.value)}
              />
            </label>
          </fieldset>

          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" className="button" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      </main>
    </>
  )
}
