import { useMemo, useState, type FormEvent } from 'react'
import type {
  IngredientSummary,
  RecipeStep,
  RecipeWithIngredients,
  SaveRecipePayload,
  Unit,
} from '../lib/db-types.ts'
import { describeError, fetchUnits, getRecipe, listIngredients, saveRecipe } from '../lib/data.ts'
import { href, navigate, paths } from '../lib/router.ts'
import { parseQuantity } from '../lib/units.ts'
import { useAsync } from '../lib/useAsync.ts'

let nextKey = 0
const newKey = () => ++nextKey

interface DraftIngredient {
  key: number
  name: string
  quantity: string
  unit: string
  /** Vrai si l'unité a été choisie à la main (sinon on propose celle du catalogue) */
  unitTouched: boolean
  optional: boolean
  note: string
  section: string | null
}

interface DraftStep {
  key: number
  step: RecipeStep
}

interface Draft {
  title: string
  description: string
  servings: string
  prep: string
  cook: string
  tags: string
  source: string
  notes: string
  ingredients: DraftIngredient[]
  steps: DraftStep[]
}

function emptyIngredient(): DraftIngredient {
  return {
    key: newKey(),
    name: '',
    quantity: '',
    unit: 'g',
    unitTouched: false,
    optional: false,
    note: '',
    section: null,
  }
}

function emptyStep(): DraftStep {
  return { key: newKey(), step: { text: '' } }
}

function toDraft(recipe: RecipeWithIngredients | null): Draft {
  if (!recipe) {
    return {
      title: '',
      description: '',
      servings: '2',
      prep: '',
      cook: '',
      tags: '',
      source: '',
      notes: '',
      ingredients: [emptyIngredient()],
      steps: [emptyStep()],
    }
  }
  return {
    title: recipe.title,
    description: recipe.description ?? '',
    servings: String(recipe.servings),
    prep: recipe.prep_minutes?.toString() ?? '',
    cook: recipe.cook_minutes?.toString() ?? '',
    tags: recipe.tags.join(', '),
    source: recipe.source ?? '',
    notes: recipe.notes ?? '',
    ingredients: recipe.recipe_ingredients.map((ri) => ({
      key: newKey(),
      name: ri.ingredient.name,
      quantity: ri.quantity?.toString().replace('.', ',') ?? '',
      unit: ri.unit ?? ri.ingredient.default_unit,
      unitTouched: true,
      optional: ri.optional,
      note: ri.note ?? '',
      section: ri.section,
    })),
    steps: recipe.steps.map((step) => ({ key: newKey(), step })),
  }
}

function parseMinutes(value: string): number | null | 'invalid' {
  if (!value.trim()) return null
  const n = Number(value.trim())
  return Number.isInteger(n) && n >= 0 ? n : 'invalid'
}

/** Construit le paramètre de save_recipe, ou renvoie la liste des erreurs. */
function toPayload(draft: Draft, id: string | undefined): SaveRecipePayload | string[] {
  const errors: string[] = []
  if (!draft.title.trim()) errors.push('Le titre est obligatoire.')

  const servings = Number(draft.servings)
  if (!Number.isInteger(servings) || servings < 1) {
    errors.push('Le nombre de portions doit être un entier supérieur ou égal à 1.')
  }
  const prep = parseMinutes(draft.prep)
  const cook = parseMinutes(draft.cook)
  if (prep === 'invalid' || cook === 'invalid') {
    errors.push('Les temps doivent être des nombres entiers de minutes.')
  }

  const ingredients: SaveRecipePayload['ingredients'] = []
  draft.ingredients.forEach((row, i) => {
    const name = row.name.trim()
    if (!name) {
      if (row.quantity.trim() || row.note.trim()) {
        errors.push(`Ingrédient n° ${i + 1} : le nom est obligatoire.`)
      }
      return
    }
    let quantity: number | null = null
    if (row.quantity.trim()) {
      quantity = parseQuantity(row.quantity)
      if (quantity === null || quantity <= 0) {
        errors.push(`« ${name} » : quantité invalide (ex. 250, 1,5 ou 1/2).`)
        return
      }
    }
    ingredients.push({
      name,
      quantity,
      unit: quantity === null ? null : row.unit,
      optional: row.optional,
      section: row.section,
      note: row.note.trim() || null,
    })
  })

  if (errors.length) return errors
  return {
    ...(id ? { id } : {}),
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    servings,
    prep_minutes: prep as number | null,
    cook_minutes: cook as number | null,
    steps: draft.steps
      .map((s) => ({ ...s.step, text: s.step.text.trim() }))
      .filter((s) => s.text),
    notes: draft.notes.trim() || null,
    source: draft.source.trim() || null,
    tags: [...new Set(draft.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))],
    ingredients,
  }
}

function move<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta
  if (target < 0 || target >= list.length) return list
  const next = [...list]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

async function loadForm(id: string | undefined) {
  const [recipe, units, catalog] = await Promise.all([
    id ? getRecipe(id) : Promise.resolve(null),
    fetchUnits(),
    listIngredients(),
  ])
  return { recipe, units, catalog }
}

export default function RecipeFormScreen({ id }: { id?: string }) {
  const { data, error, loading, reload } = useAsync(() => loadForm(id), [id])
  const backPath = id ? paths.recipe(id) : paths.recipes

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
        <a className="back-link" href={href(backPath)}>‹ Retour</a>
        <p className="error" role="alert">{error}</p>
        <button type="button" className="button button-secondary" onClick={reload}>
          Réessayer
        </button>
      </main>
    )
  }
  if (id && !data.recipe) {
    return (
      <main className="app-main">
        <a className="back-link" href={href(paths.recipes)}>‹ Recettes</a>
        <p>Cette recette n’existe pas (ou plus).</p>
      </main>
    )
  }
  return (
    <RecipeForm
      key={id ?? 'new'}
      id={id}
      initial={toDraft(data.recipe)}
      units={data.units}
      catalog={data.catalog}
      backPath={backPath}
    />
  )
}

interface RecipeFormProps {
  id: string | undefined
  initial: Draft
  units: Unit[]
  catalog: IngredientSummary[]
  backPath: string
}

function RecipeForm({ id, initial, units, catalog, backPath }: RecipeFormProps) {
  const [draft, setDraft] = useState(initial)
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const catalogByName = useMemo(
    () => new Map(catalog.map((c) => [c.name.toLowerCase(), c])),
    [catalog],
  )

  function set<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [field]: value }))
  }

  function updateIngredient(key: number, patch: Partial<DraftIngredient>) {
    setDraft((d) => ({
      ...d,
      ingredients: d.ingredients.map((row) => {
        if (row.key !== key) return row
        const next = { ...row, ...patch }
        // Ingrédient connu : on propose son unité habituelle
        if (patch.name !== undefined && !next.unitTouched) {
          const known = catalogByName.get(patch.name.trim().toLowerCase())
          if (known) next.unit = known.default_unit
        }
        return next
      }),
    }))
  }

  function updateStep(key: number, text: string) {
    setDraft((d) => ({
      ...d,
      steps: d.steps.map((s) => (s.key === key ? { ...s, step: { ...s.step, text } } : s)),
    }))
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const payload = toPayload(draft, id)
    if (Array.isArray(payload)) {
      setErrors(payload)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setErrors([])
    setSaving(true)
    try {
      const savedId = await saveRecipe(payload)
      navigate(paths.recipe(savedId), { replace: true })
    } catch (e) {
      setErrors([describeError(e)])
      setSaving(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <>
      <header className="app-header">
        <a className="back-link" href={href(backPath)}>‹ Annuler</a>
        <h1>{id ? 'Modifier la recette' : 'Nouvelle recette'}</h1>
      </header>

      <main className="app-main">
        <form className="stack" onSubmit={onSubmit} noValidate>
          {errors.length > 0 && (
            <ul className="error-box" role="alert">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          <label className="field">
            <span>Titre</span>
            <input value={draft.title} onChange={(e) => set('title', e.target.value)} required />
          </label>

          <label className="field">
            <span>Description</span>
            <textarea
              rows={2}
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </label>

          <div className="grid-3">
            <label className="field">
              <span>Portions</span>
              <input
                inputMode="numeric"
                value={draft.servings}
                onChange={(e) => set('servings', e.target.value)}
              />
            </label>
            <label className="field">
              <span>Prépa (min)</span>
              <input
                inputMode="numeric"
                value={draft.prep}
                onChange={(e) => set('prep', e.target.value)}
              />
            </label>
            <label className="field">
              <span>Cuisson (min)</span>
              <input
                inputMode="numeric"
                value={draft.cook}
                onChange={(e) => set('cook', e.target.value)}
              />
            </label>
          </div>

          <fieldset className="fieldset">
            <legend>Ingrédients</legend>
            <datalist id="ingredient-catalog">
              {catalog.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>

            {draft.ingredients.map((row, i) => (
              <div className="edit-row" key={row.key}>
                <div className="ingredient-inputs">
                  <input
                    className="qty-input"
                    inputMode="decimal"
                    placeholder="Qté"
                    aria-label={`Quantité de l’ingrédient ${i + 1}`}
                    value={row.quantity}
                    onChange={(e) => updateIngredient(row.key, { quantity: e.target.value })}
                  />
                  <select
                    aria-label={`Unité de l’ingrédient ${i + 1}`}
                    value={row.unit}
                    onChange={(e) =>
                      updateIngredient(row.key, { unit: e.target.value, unitTouched: true })
                    }
                  >
                    {units.map((u) => (
                      <option key={u.code} value={u.code}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  list="ingredient-catalog"
                  placeholder="Ingrédient (ex. lait)"
                  aria-label={`Nom de l’ingrédient ${i + 1}`}
                  autoCapitalize="sentences"
                  value={row.name}
                  onChange={(e) => updateIngredient(row.key, { name: e.target.value })}
                />
                <input
                  placeholder="Précision (ex. coupé en dés)"
                  aria-label={`Précision pour l’ingrédient ${i + 1}`}
                  value={row.note}
                  onChange={(e) => updateIngredient(row.key, { note: e.target.value })}
                />
                <div className="row-tools">
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={row.optional}
                      onChange={(e) => updateIngredient(row.key, { optional: e.target.checked })}
                    />
                    Facultatif
                  </label>
                  <RowButtons
                    label={`l’ingrédient ${i + 1}`}
                    first={i === 0}
                    last={i === draft.ingredients.length - 1}
                    onUp={() => set('ingredients', move(draft.ingredients, i, -1))}
                    onDown={() => set('ingredients', move(draft.ingredients, i, 1))}
                    onRemove={() =>
                      set(
                        'ingredients',
                        draft.ingredients.filter((r) => r.key !== row.key),
                      )
                    }
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              className="button button-secondary"
              onClick={() => set('ingredients', [...draft.ingredients, emptyIngredient()])}
            >
              + Ajouter un ingrédient
            </button>
            <p className="muted hint">Laisse la quantité vide pour « selon goût ».</p>
          </fieldset>

          <fieldset className="fieldset">
            <legend>Étapes</legend>
            {draft.steps.map((s, i) => (
              <div className="edit-row" key={s.key}>
                <label className="field">
                  <span>Étape {i + 1}</span>
                  <textarea
                    rows={3}
                    value={s.step.text}
                    onChange={(e) => updateStep(s.key, e.target.value)}
                  />
                </label>
                <div className="row-tools row-tools-end">
                  <RowButtons
                    label={`l’étape ${i + 1}`}
                    first={i === 0}
                    last={i === draft.steps.length - 1}
                    onUp={() => set('steps', move(draft.steps, i, -1))}
                    onDown={() => set('steps', move(draft.steps, i, 1))}
                    onRemove={() =>
                      set(
                        'steps',
                        draft.steps.filter((x) => x.key !== s.key),
                      )
                    }
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              className="button button-secondary"
              onClick={() => set('steps', [...draft.steps, emptyStep()])}
            >
              + Ajouter une étape
            </button>
          </fieldset>

          <label className="field">
            <span>Tags (séparés par des virgules)</span>
            <input
              placeholder="ex. dessert, rapide"
              autoCapitalize="none"
              value={draft.tags}
              onChange={(e) => set('tags', e.target.value)}
            />
          </label>

          <label className="field">
            <span>Notes</span>
            <textarea rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
          </label>

          <label className="field">
            <span>Source (lien ou livre)</span>
            <input
              autoCapitalize="none"
              value={draft.source}
              onChange={(e) => set('source', e.target.value)}
            />
          </label>

          <button type="submit" className="button" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      </main>
    </>
  )
}

interface RowButtonsProps {
  label: string
  first: boolean
  last: boolean
  onUp: () => void
  onDown: () => void
  onRemove: () => void
}

function RowButtons({ label, first, last, onUp, onDown, onRemove }: RowButtonsProps) {
  return (
    <div className="row-buttons">
      <button type="button" className="icon-button" aria-label={`Monter ${label}`} disabled={first} onClick={onUp}>
        ↑
      </button>
      <button type="button" className="icon-button" aria-label={`Descendre ${label}`} disabled={last} onClick={onDown}>
        ↓
      </button>
      <button type="button" className="icon-button icon-danger" aria-label={`Supprimer ${label}`} onClick={onRemove}>
        ✕
      </button>
    </div>
  )
}
