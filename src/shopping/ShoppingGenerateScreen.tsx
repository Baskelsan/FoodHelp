import { useMemo, useState } from 'react'
import type { RecipeSummary, Unit } from '../lib/db-types.ts'
import {
  describeError,
  fetchUnits,
  getRecipe,
  insertShoppingItems,
  listInventory,
  listRecipes,
  listShopping,
  updateShoppingItem,
} from '../lib/data.ts'
import { href, navigate, paths } from '../lib/router.ts'
import {
  collectNeeds,
  mergeIntoList,
  subtractStock,
  type RecipeNeedSource,
  type ShoppingLine,
} from '../lib/shopping.ts'
import type { Conversion } from '../lib/units.ts'
import { formatQuantity, formatServings } from '../lib/units.ts'
import { useAsync } from '../lib/useAsync.ts'
import { normalize } from '../recipes/RecipeListScreen.tsx'

async function loadChoices() {
  const [recipes, units] = await Promise.all([listRecipes(), fetchUnits()])
  return { recipes, units }
}

interface Preview {
  lines: ShoppingLine[]
  convs: Map<string, Conversion>
}

export default function ShoppingGenerateScreen() {
  const { data, error, loading, reload } = useAsync(loadChoices, [])
  const [selected, setSelected] = useState<Map<string, number>>(new Map())
  const [query, setQuery] = useState('')
  const [includeOptional, setIncludeOptional] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const units = useMemo(() => new Map((data?.units ?? []).map((u) => [u.code, u])), [data])

  function toggleRecipe(recipe: RecipeSummary) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(recipe.id)) next.delete(recipe.id)
      else next.set(recipe.id, recipe.servings)
      return next
    })
  }

  function setServings(id: string, servings: number) {
    setSelected((prev) => new Map(prev).set(id, Math.max(1, servings)))
  }

  async function compute() {
    setBusy(true)
    setActionError(null)
    try {
      const ids = [...selected.keys()]
      const [recipes, inventory] = await Promise.all([
        Promise.all(ids.map((id) => getRecipe(id))),
        listInventory(),
      ])
      const sources: RecipeNeedSource[] = []
      const convs = new Map<string, Conversion>()
      for (const recipe of recipes) {
        if (!recipe) continue
        sources.push({
          recipeId: recipe.id,
          factor: selected.get(recipe.id)! / recipe.servings,
          items: recipe.recipe_ingredients.map((ri) => {
            const conv = {
              density_g_per_ml: ri.ingredient.density_g_per_ml,
              piece_weight_g: ri.ingredient.piece_weight_g,
            }
            convs.set(ri.ingredient.id, conv)
            return {
              ingredientId: ri.ingredient.id,
              name: ri.ingredient.name,
              conv,
              quantity: ri.quantity,
              unit: ri.unit,
              optional: ri.optional,
            }
          }),
        })
      }
      const needs = collectNeeds(sources, units, { includeOptional })
      const lines = subtractStock(
        needs,
        inventory.map((i) => ({ ingredientId: i.ingredient_id, quantity: i.quantity, unit: i.unit })),
        units,
      ).sort((a, b) => Number(a.inStock) - Number(b.inStock) || a.name.localeCompare(b.name, 'fr'))
      setPreview({ lines, convs })
      setChosen(new Set(lines.filter((l) => !l.inStock).map((l) => l.key)))
    } catch (e) {
      setActionError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  async function addToList() {
    if (!preview) return
    setBusy(true)
    setActionError(null)
    try {
      const existing = await listShopping()
      const changes = mergeIntoList(
        preview.lines.filter((l) => chosen.has(l.key)),
        existing.map((e) => ({
          id: e.id,
          ingredientId: e.ingredient_id,
          quantity: e.quantity,
          unit: e.unit,
          checked: e.checked,
          recipeId: e.recipe_id,
        })),
        units,
        preview.convs,
      )
      for (const { id, ...patch } of changes.updates) await updateShoppingItem(id, patch)
      await insertShoppingItems(changes.inserts)
      navigate(paths.shopping, { replace: true })
    } catch (e) {
      setActionError(describeError(e))
      setBusy(false)
    }
  }

  if (loading && !data) {
    return (
      <main className="app-main">
        <p className="muted">Chargement…</p>
      </main>
    )
  }
  if (error || !data) {
    return (
      <main className="app-main">
        <a className="back-link" href={href(paths.shopping)}>‹ Courses</a>
        <p className="error" role="alert">{error}</p>
        <button type="button" className="button button-secondary" onClick={reload}>
          Réessayer
        </button>
      </main>
    )
  }

  if (preview) {
    return (
      <>
        <header className="app-header">
          <button type="button" className="back-link link-like" onClick={() => setPreview(null)}>
            ‹ Choix des recettes
          </button>
          <h1>À ajouter</h1>
        </header>
        <main className="app-main">
          {preview.lines.length === 0 && <p className="muted">Aucun ingrédient dans ces recettes.</p>}
          <ul className="list">
            {preview.lines.map((line) => (
              <PreviewLine
                key={line.key}
                line={line}
                units={units}
                checked={chosen.has(line.key)}
                onToggle={() =>
                  setChosen((prev) => {
                    const next = new Set(prev)
                    if (next.has(line.key)) next.delete(line.key)
                    else next.add(line.key)
                    return next
                  })
                }
              />
            ))}
          </ul>
          {actionError && <p className="error" role="alert">{actionError}</p>}
          <button
            type="button"
            className="button"
            onClick={addToList}
            disabled={busy || chosen.size === 0}
          >
            {busy
              ? 'Ajout…'
              : `Ajouter ${chosen.size} article${chosen.size > 1 ? 's' : ''} à la liste`}
          </button>
        </main>
      </>
    )
  }

  const q = normalize(query.trim())
  const visible = data.recipes.filter((r) => !q || normalize(r.title).includes(q))

  return (
    <>
      <header className="app-header">
        <a className="back-link" href={href(paths.shopping)}>‹ Courses</a>
        <h1>Depuis des recettes</h1>
      </header>
      <main className="app-main">
        {data.recipes.length === 0 ? (
          <p className="muted">Aucune recette pour l’instant.</p>
        ) : (
          <input
            type="search"
            placeholder="Rechercher une recette"
            aria-label="Rechercher une recette"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}

        <ul className="list">
          {visible.map((recipe) => {
            const servings = selected.get(recipe.id)
            return (
              <li key={recipe.id} className="card pick-recipe">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={servings !== undefined}
                    onChange={() => toggleRecipe(recipe)}
                  />
                  <span className="list-title">{recipe.title}</span>
                </label>
                {servings !== undefined && (
                  <div className="servings servings-small">
                    <button
                      type="button"
                      className="round-button"
                      aria-label={`Une portion de moins pour ${recipe.title}`}
                      disabled={servings <= 1}
                      onClick={() => setServings(recipe.id, servings - 1)}
                    >
                      −
                    </button>
                    <span>
                      {formatServings(servings)} portion{servings > 1 ? 's' : ''}
                    </span>
                    <button
                      type="button"
                      className="round-button"
                      aria-label={`Une portion de plus pour ${recipe.title}`}
                      onClick={() => setServings(recipe.id, servings + 1)}
                    >
                      +
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={includeOptional}
            onChange={(e) => setIncludeOptional(e.target.checked)}
          />
          Inclure les ingrédients facultatifs
        </label>

        {actionError && <p className="error" role="alert">{actionError}</p>}
        <button
          type="button"
          className="button"
          onClick={compute}
          disabled={busy || selected.size === 0}
        >
          {busy
            ? 'Calcul…'
            : `Calculer (${selected.size} recette${selected.size > 1 ? 's' : ''})`}
        </button>
      </main>
    </>
  )
}

function PreviewLine({
  line,
  units,
  checked,
  onToggle,
}: {
  line: ShoppingLine
  units: Map<string, Unit>
  checked: boolean
  onToggle: () => void
}) {
  const unit = line.unit ? units.get(line.unit) : undefined
  const qty = line.quantity !== null && unit ? formatQuantity(line.quantity, unit, units) : null
  const fromStock =
    !line.inStock && line.fromStock > 0 && unit ? formatQuantity(line.fromStock, unit, units) : null

  return (
    <li className="card preview-line">
      <label className="checkbox">
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span>
          <span className="list-title">{line.name}</span>
          {qty && <span> · {qty}</span>}
          {line.inStock && <span className="badge badge-ok">déjà en stock</span>}
          {fromStock && <span className="muted small"> ({fromStock} déjà en stock)</span>}
        </span>
      </label>
    </li>
  )
}
