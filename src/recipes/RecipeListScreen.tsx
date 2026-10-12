import { useMemo, useState } from 'react'
import { listRecipes } from '../lib/data.ts'
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

export default function RecipeListScreen() {
  const { data: recipes, error, loading, reload } = useAsync(listRecipes, [])
  const [query, setQuery] = useState(lastQuery)
  const [tag, setTag] = useState<string | null>(lastTag)

  lastQuery = query
  lastTag = tag

  const allTags = useMemo(
    () => [...new Set((recipes ?? []).flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, 'fr')),
    [recipes],
  )

  const visible = useMemo(() => {
    const q = normalize(query.trim())
    return (recipes ?? []).filter(
      (r) => (!q || normalize(r.title).includes(q)) && (!tag || r.tags.includes(tag)),
    )
  }, [recipes, query, tag])

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
          {visible.map((r) => {
            const total = (r.prep_minutes ?? 0) + (r.cook_minutes ?? 0)
            return (
              <li key={r.id}>
                <a className="list-item" href={href(paths.recipe(r.id))}>
                  <span className="list-title">{r.title}</span>
                  <span className="list-meta muted">
                    {r.servings} portion{r.servings > 1 ? 's' : ''}
                    {total > 0 && ` · ${formatDuration(total)}`}
                    {r.tags.length > 0 && ` · ${r.tags.join(', ')}`}
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      </main>
    </>
  )
}
