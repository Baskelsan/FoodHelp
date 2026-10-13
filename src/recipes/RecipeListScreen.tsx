import { useMemo, useState } from 'react'
import { formatKcal, recipeCalories } from '../lib/calories.ts'
import type { RecipeListEntry } from '../lib/db-types.ts'
import { fetchUnits, listRecipeEntries } from '../lib/data.ts'
import { href, paths } from '../lib/router.ts'
import { useAsync } from '../lib/useAsync.ts'

/** Minuscules sans accents, pour une recherche tolérante. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

// Conservés en mémoire pour retrouver la recherche en revenant d'une fiche
let lastQuery = ''
let lastTag: string | null = null

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m}` : `${h} h`
}

type SortKey = 'title' | 'time' | 'kcal' | 'recent'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'title', label: 'Nom (A → Z)' },
  { key: 'time', label: 'Temps total' },
  { key: 'kcal', label: 'Calories par portion' },
  { key: 'recent', label: 'Plus récentes' },
]

const SORT_KEY = 'foodhelp-recipe-sort'

function readSort(): SortKey {
  try {
    const saved = localStorage.getItem(SORT_KEY)
    return SORTS.some((s) => s.key === saved) ? (saved as SortKey) : 'title'
  } catch {
    return 'title'
  }
}

interface Row {
  recipe: RecipeListEntry
  /** Temps total en minutes, null si inconnu */
  minutes: number | null
  /** kcal / portion, null si aucun ingrédient compté */
  kcal: number | null
  kcalComplete: boolean
}

/** Trie en mettant les valeurs inconnues à la fin. */
function compareNullable(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a - b
}

async function loadList() {
  const [recipes, units] = await Promise.all([listRecipeEntries(), fetchUnits()])
  const byCode = new Map(units.map((u) => [u.code, u]))
  return recipes.map((recipe): Row => {
    const calories = recipeCalories(
      recipe.recipe_ingredients.map((ri) => ({
        name: ri.ingredient.name,
        quantity: ri.quantity,
        unit: ri.unit,
        optional: ri.optional,
        ingredient: ri.ingredient,
      })),
      recipe.servings,
      byCode,
    )
    const minutes =
      recipe.prep_minutes === null && recipe.cook_minutes === null
        ? null
        : (recipe.prep_minutes ?? 0) + (recipe.cook_minutes ?? 0)
    return {
      recipe,
      minutes,
      kcal: calories.counted.length > 0 ? calories.perServing : null,
      kcalComplete: calories.complete,
    }
  })
}

export default function RecipeListScreen() {
  const { data: rows, error, loading, reload } = useAsync(loadList, [])
  const [query, setQuery] = useState(lastQuery)
  const [tag, setTag] = useState<string | null>(lastTag)
  const [sort, setSort] = useState<SortKey>(readSort)

  lastQuery = query
  lastTag = tag

  function changeSort(value: SortKey) {
    setSort(value)
    try {
      localStorage.setItem(SORT_KEY, value)
    } catch {
      // simple confort
    }
  }

  const recipes = useMemo(() => rows?.map((r) => r.recipe), [rows])

  const allTags = useMemo(
    () => [...new Set((recipes ?? []).flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, 'fr')),
    [recipes],
  )

  const visible = useMemo(() => {
    const q = normalize(query.trim())
    const filtered = (rows ?? []).filter(
      ({ recipe: r }) => (!q || normalize(r.title).includes(q)) && (!tag || r.tags.includes(tag)),
    )
    const byTitle = (a: Row, b: Row) => a.recipe.title.localeCompare(b.recipe.title, 'fr')
    const compare: Record<SortKey, (a: Row, b: Row) => number> = {
      title: byTitle,
      time: (a, b) => compareNullable(a.minutes, b.minutes) || byTitle(a, b),
      kcal: (a, b) => compareNullable(a.kcal, b.kcal) || byTitle(a, b),
      recent: (a, b) => b.recipe.created_at.localeCompare(a.recipe.created_at),
    }
    return [...filtered].sort(compare[sort])
  }, [rows, query, tag, sort])

  return (
    <>
      <header className="app-header header-row">
        <h1>Recettes</h1>
        <div className="header-actions">
          <a className="button button-small button-secondary" href={href(paths.recipeImport)}>
            Importer
          </a>
          <a className="button button-small" href={href(paths.recipeNew)}>
            + Nouvelle
          </a>
        </div>
      </header>

      <main className="app-main">
        <input
          type="search"
          placeholder="Rechercher une recette"
          aria-label="Rechercher une recette"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {(recipes?.length ?? 0) > 1 && (
          <label className="sort-row">
            <span className="muted small">Trier par</span>
            <select value={sort} onChange={(e) => changeSort(e.target.value as SortKey)}>
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {allTags.length > 0 && (
          <div className="chips" role="group" aria-label="Filtrer par tag">
            {allTags.map((t) => (
              <button
                key={t}
                type="button"
                className={t === tag ? 'chip chip-active' : 'chip'}
                aria-pressed={t === tag}
                onClick={() => setTag(t === tag ? null : t)}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {loading && !recipes && <p className="muted">Chargement…</p>}

        {error && (
          <div className="stack">
            <p className="error" role="alert">{error}</p>
            <button type="button" className="button button-secondary" onClick={reload}>
              Réessayer
            </button>
          </div>
        )}

        {recipes && recipes.length === 0 && (
          <div className="card empty">
            <p>Aucune recette pour l’instant.</p>
            <a className="button" href={href(paths.recipeNew)}>
              Créer ma première recette
            </a>
          </div>
        )}

        {recipes && recipes.length > 0 && visible.length === 0 && (
          <p className="muted">Aucune recette ne correspond.</p>
        )}

        <ul className="list">
          {visible.map(({ recipe: r, minutes, kcal, kcalComplete }) => (
            <li key={r.id}>
              <a className="list-item" href={href(paths.recipe(r.id))}>
                <span className="list-title">{r.title}</span>
                <span className="list-meta muted">
                  {r.servings} portion{r.servings > 1 ? 's' : ''}
                  {minutes ? ` · ${formatDuration(minutes)}` : ''}
                  {kcal !== null && ` · ${kcalComplete ? '' : '≥ '}${formatKcal(kcal)}/portion`}
                  {r.tags.length > 0 && ` · ${r.tags.join(', ')}`}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </main>
    </>
  )
}
