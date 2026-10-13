import { useState } from 'react'
import type { IngredientSummary } from '../lib/db-types.ts'
import {
  describeError,
  listIngredientsWithoutKcal,
  suggestCiqual,
  updateIngredient,
  type CiqualSuggestion,
} from '../lib/data.ts'
import { formatKcal } from '../lib/calories.ts'
import { href, paths } from '../lib/router.ts'
import { useAsync } from '../lib/useAsync.ts'

async function load() {
  const ingredients = await listIngredientsWithoutKcal()
  const suggestions = await suggestCiqual(ingredients.map((i) => i.name))
  const byName = new Map<string, CiqualSuggestion[]>()
  for (const s of suggestions) byName.set(s.query, [...(byName.get(s.query) ?? []), s])
  return { ingredients, byName }
}

export default function CaloriesTodoScreen() {
  const { data, error, loading, reload } = useAsync(load, [])
  // Ingrédients reliés pendant la visite : retirés de la liste sans recharger
  const [done, setDone] = useState<Map<string, string>>(new Map())
  const [saving, setSaving] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function link(ingredient: IngredientSummary, suggestion: CiqualSuggestion) {
    setSaving(ingredient.id)
    setActionError(null)
    try {
      await updateIngredient(ingredient.id, { ciqual_code: suggestion.alim_code })
      setDone((prev) => new Map(prev).set(ingredient.id, suggestion.name_fr))
    } catch (e) {
      setActionError(describeError(e))
    } finally {
      setSaving(null)
    }
  }

  const remaining = (data?.ingredients ?? []).filter((i) => !done.has(i.id))

  return (
    <>
      <header className="app-header">
        <a className="back-link" href={href(paths.account)}>‹ Compte</a>
        <h1>Calories à compléter</h1>
        <p className="muted header-meta">
          Relie chaque ingrédient à un aliment de la table CIQUAL. Touche la bonne proposition,
          ou « Autre » pour chercher.
        </p>
      </header>

      <main className="app-main">
        {loading && !data && <p className="muted">Recherche des correspondances…</p>}
        {error && (
          <div className="stack">
            <p className="error" role="alert">{error}</p>
            <button type="button" className="button button-secondary" onClick={reload}>
              Réessayer
            </button>
          </div>
        )}
        {actionError && <p className="error" role="alert">{actionError}</p>}

        {data && remaining.length === 0 && (
          <div className="card empty">
            <p>Tous tes ingrédients ont des calories. 🎉</p>
          </div>
        )}

        {done.size > 0 && (
          <p className="muted small">
            {done.size} ingrédient{done.size > 1 ? 's' : ''} relié{done.size > 1 ? 's' : ''} pendant
            cette visite.
          </p>
        )}

        <ul className="list">
          {remaining.map((ingredient) => {
            const suggestions = data?.byName.get(ingredient.name) ?? []
            return (
              <li key={ingredient.id} className="card todo-item">
                <span className="list-title">{ingredient.name}</span>
                {suggestions.length === 0 && (
                  <span className="muted small">Aucune correspondance trouvée.</span>
                )}
                <div className="suggestions">
                  {suggestions.map((s) => (
                    <button
                      key={s.alim_code}
                      type="button"
                      className="suggestion"
                      disabled={saving === ingredient.id}
                      onClick={() => link(ingredient, s)}
                    >
                      <span>{s.name_fr}</span>
                      <span className="muted small">
                        {s.kcal_100g === null ? 'kcal inconnues' : `${formatKcal(s.kcal_100g)} / 100 g`}
                      </span>
                    </button>
                  ))}
                  <a className="suggestion suggestion-other" href={href(paths.ingredient(ingredient.id))}>
                    Autre… (rechercher ou saisir)
                  </a>
                </div>
              </li>
            )
          })}
        </ul>
      </main>
    </>
  )
}
