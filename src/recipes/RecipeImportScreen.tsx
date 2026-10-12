import { useMemo, useState } from 'react'
import { describeError, listRecipes, saveRecipe } from '../lib/data.ts'
import { parseImport, type ParsedRecipe } from '../lib/recipeImport.ts'
import { href, paths } from '../lib/router.ts'
import { useAsync } from '../lib/useAsync.ts'
import { normalize } from './RecipeListScreen.tsx'

type Status = { state: 'saving' } | { state: 'done'; id: string } | { state: 'error'; message: string }

const canPaste = typeof navigator !== 'undefined' && !!navigator.clipboard?.readText

export default function RecipeImportScreen() {
  const existing = useAsync(listRecipes, [])
  const [input, setInput] = useState('')
  const [overrides, setOverrides] = useState<Record<number, boolean>>({})
  const [statuses, setStatuses] = useState<Record<number, Status>>({})
  const [importing, setImporting] = useState(false)
  const [pasteError, setPasteError] = useState<string | null>(null)

  const result = useMemo(() => parseImport(input), [input])
  const existingTitles = useMemo(
    () => new Set((existing.data ?? []).map((r) => normalize(r.title.trim()))),
    [existing.data],
  )

  const isDuplicate = (r: ParsedRecipe) => existingTitles.has(normalize(r.payload.title.trim()))
  const isSelected = (r: ParsedRecipe, i: number) =>
    r.errors.length === 0 && (overrides[i] ?? !isDuplicate(r))

  const selectedCount = result.recipes.filter(isSelected).length
  const finished = Object.keys(statuses).length > 0 && !importing

  function changeInput(value: string) {
    setInput(value)
    setOverrides({})
    setStatuses({})
    setPasteError(null)
  }

  async function paste() {
    try {
      changeInput(await navigator.clipboard.readText())
    } catch {
      setPasteError('Accès au presse-papiers refusé : colle le texte dans le champ.')
    }
  }

  async function runImport() {
    setImporting(true)
    for (const [i, recipe] of result.recipes.entries()) {
      if (!isSelected(recipe, i)) continue
      setStatuses((s) => ({ ...s, [i]: { state: 'saving' } }))
      try {
        const id = await saveRecipe(recipe.payload)
        setStatuses((s) => ({ ...s, [i]: { state: 'done', id } }))
      } catch (e) {
        setStatuses((s) => ({ ...s, [i]: { state: 'error', message: describeError(e) } }))
      }
    }
    setImporting(false)
    existing.reload()
  }

  const doneCount = Object.values(statuses).filter((s) => s.state === 'done').length

  return (
    <>
      <header className="app-header">
        <a className="back-link" href={href(paths.recipes)}>‹ Recettes</a>
        <h1>Importer des recettes</h1>
      </header>

      <main className="app-main">
        <p className="muted">
          Colle le JSON exporté depuis Claude (format FoodHelp). Le texte autour du bloc est
          ignoré.
        </p>

        <textarea
          className="import-input"
          rows={8}
          placeholder='{"format": "foodhelp", "version": 1, "recipes": [ … ] }'
          aria-label="Texte à importer"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={input}
          onChange={(e) => changeInput(e.target.value)}
          disabled={importing}
        />

        <div className="row">
          {canPaste && (
            <button type="button" className="link-button" onClick={paste} disabled={importing}>
              Coller depuis le presse-papiers
            </button>
          )}
          {input && (
            <button
              type="button"
              className="link-button"
              onClick={() => changeInput('')}
              disabled={importing}
            >
              Effacer
            </button>
          )}
        </div>
        {pasteError && <p className="error" role="alert">{pasteError}</p>}

        {result.error && <p className="error" role="alert">{result.error}</p>}
        {result.warnings.map((w) => (
          <p key={w} className="muted">⚠️ {w}</p>
        ))}
        {existing.error && (
          <p className="muted">
            Impossible de vérifier les doublons ({existing.error}).
          </p>
        )}

        {result.recipes.length > 0 && (
          <ul className="list">
            {result.recipes.map((recipe, i) => (
              <ImportItem
                key={i}
                recipe={recipe}
                selected={isSelected(recipe, i)}
                duplicate={isDuplicate(recipe)}
                status={statuses[i]}
                disabled={importing || finished}
                onToggle={(value) => setOverrides((o) => ({ ...o, [i]: value }))}
              />
            ))}
          </ul>
        )}

        {result.recipes.length > 0 && !finished && (
          <button
            type="button"
            className="button"
            onClick={runImport}
            disabled={importing || selectedCount === 0}
          >
            {importing
              ? 'Import en cours…'
              : `Importer ${selectedCount} recette${selectedCount > 1 ? 's' : ''}`}
          </button>
        )}

        {finished && (
          <div className="card stack-sm">
            <p>
              {doneCount} recette{doneCount > 1 ? 's' : ''} importée{doneCount > 1 ? 's' : ''}.
            </p>
            <a className="button" href={href(paths.recipes)}>
              Voir mes recettes
            </a>
            <button type="button" className="link-button" onClick={() => changeInput('')}>
              Importer d’autres recettes
            </button>
          </div>
        )}
      </main>
    </>
  )
}

interface ImportItemProps {
  recipe: ParsedRecipe
  selected: boolean
  duplicate: boolean
  status: Status | undefined
  disabled: boolean
  onToggle: (selected: boolean) => void
}

function ImportItem({ recipe, selected, duplicate, status, disabled, onToggle }: ImportItemProps) {
  const { payload, errors, warnings } = recipe
  const ingredientNames = payload.ingredients.map((i) => i.name).join(', ')

  return (
    <li className="card import-item">
      <label className="checkbox import-check">
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled || errors.length > 0}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="list-title">{recipe.title}</span>
      </label>

      <p className="muted small">
        {payload.servings} portion{payload.servings > 1 ? 's' : ''} ·{' '}
        {payload.ingredients.length} ingrédient{payload.ingredients.length > 1 ? 's' : ''} ·{' '}
        {payload.steps.length} étape{payload.steps.length > 1 ? 's' : ''}
        {payload.tags.length > 0 && ` · ${payload.tags.join(', ')}`}
      </p>
      {ingredientNames && <p className="small import-ingredients">{ingredientNames}</p>}

      {duplicate && (
        <p className="small warning">
          Une recette porte déjà ce titre : décochée pour éviter un doublon.
        </p>
      )}
      {errors.length > 0 && (
        <ul className="small error import-messages">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="small muted import-messages">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {status?.state === 'saving' && <p className="small muted">Import…</p>}
      {status?.state === 'done' && (
        <p className="small">
          ✅ Importée · <a href={href(paths.recipe(status.id))}>Ouvrir</a>
        </p>
      )}
      {status?.state === 'error' && (
        <p className="small error" role="alert">Échec : {status.message}</p>
      )}
    </li>
  )
}
