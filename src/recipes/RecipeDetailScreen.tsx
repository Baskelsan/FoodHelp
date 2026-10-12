import { useMemo, useState, type FormEvent } from 'react'
import type { RecipeIngredient, RecipeWithIngredients, Unit } from '../lib/db-types.ts'
import { deleteRecipe, describeError, fetchUnits, getRecipe } from '../lib/data.ts'
import { href, navigate, paths } from '../lib/router.ts'
import {
  formatQuantity,
  formatServings,
  limitingFactor,
  parseQuantity,
} from '../lib/units.ts'
import { useAsync } from '../lib/useAsync.ts'
import { formatDuration } from './RecipeListScreen.tsx'

async function loadRecipe(id: string) {
  const [recipe, units] = await Promise.all([getRecipe(id), fetchUnits()])
  return { recipe, units }
}

export default function RecipeDetailScreen({ id }: { id: string }) {
  const { data, error, loading, reload } = useAsync(() => loadRecipe(id), [id])

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
        <a className="back-link" href={href(paths.recipes)}>‹ Recettes</a>
        <p className="error" role="alert">{error}</p>
        <button type="button" className="button button-secondary" onClick={reload}>
          Réessayer
        </button>
      </main>
    )
  }
  if (!data.recipe) {
    return (
      <main className="app-main">
        <a className="back-link" href={href(paths.recipes)}>‹ Recettes</a>
        <p>Cette recette n’existe pas (ou plus).</p>
      </main>
    )
  }
  return <RecipeView recipe={data.recipe} units={data.units} />
}

interface Scale {
  factor: number
  /** Texte affiché quand la recette est calculée depuis un ingrédient limitant */
  reason: string | null
}

function RecipeView({ recipe, units }: { recipe: RecipeWithIngredients; units: Unit[] }) {
  const unitsByCode = useMemo(() => new Map(units.map((u) => [u.code, u])), [units])
  const [scale, setScale] = useState<Scale>({ factor: 1, reason: null })
  const [limitingId, setLimitingId] = useState<string | null>(null)
  const [doneSteps, setDoneSteps] = useState<Set<number>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const servings = recipe.servings * scale.factor

  function setServings(n: number) {
    setScale({ factor: n / recipe.servings, reason: null })
    setLimitingId(null)
  }

  function toggleStep(index: number) {
    setDoneSteps((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  async function onDelete() {
    if (!window.confirm(`Supprimer « ${recipe.title} » ? Cette action est définitive.`)) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteRecipe(recipe.id)
      navigate(paths.recipes, { replace: true })
    } catch (e) {
      setDeleteError(describeError(e))
      setDeleting(false)
    }
  }

  const sections = groupBySection(recipe.recipe_ingredients)

  return (
    <>
      <header className="app-header">
        <a className="back-link" href={href(paths.recipes)}>‹ Recettes</a>
        <h1>{recipe.title}</h1>
        {(recipe.prep_minutes || recipe.cook_minutes || recipe.tags.length > 0) && (
          <p className="muted header-meta">
            {[
              recipe.prep_minutes ? `Préparation ${formatDuration(recipe.prep_minutes)}` : null,
              recipe.cook_minutes ? `Cuisson ${formatDuration(recipe.cook_minutes)}` : null,
              recipe.tags.length ? recipe.tags.join(', ') : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </header>

      <main className="app-main">
        {recipe.description && <p className="description">{recipe.description}</p>}

        <section className="card stack-sm">
          <div className="servings">
            <button
              type="button"
              className="round-button"
              aria-label="Une portion de moins"
              disabled={servings <= 1}
              onClick={() => setServings(Math.max(1, Math.ceil(servings) - 1))}
            >
              −
            </button>
            <span className="servings-value">
              {formatServings(servings)} portion{servings >= 2 ? 's' : ''}
            </span>
            <button
              type="button"
              className="round-button"
              aria-label="Une portion de plus"
              onClick={() => setServings(Math.floor(servings) + 1)}
            >
              +
            </button>
          </div>
          {scale.reason && <p className="muted center">{scale.reason}</p>}
          {scale.factor !== 1 && (
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setScale({ factor: 1, reason: null })
                setLimitingId(null)
              }}
            >
              Revenir à la recette d’origine ({recipe.servings} portion
              {recipe.servings > 1 ? 's' : ''})
            </button>
          )}
        </section>

        <section>
          <h2>Ingrédients</h2>
          {recipe.recipe_ingredients.length === 0 && <p className="muted">Aucun ingrédient.</p>}
          <p className="muted hint">
            Touche un ingrédient pour recalculer la recette selon ce que tu as.
          </p>
          {sections.map(([section, items]) => (
            <div key={section ?? ''}>
              {section && <h3>{section}</h3>}
              <ul className="ingredients">
                {items.map((ri) => (
                  <IngredientRow
                    key={ri.id}
                    item={ri}
                    factor={scale.factor}
                    unitsByCode={unitsByCode}
                    units={units}
                    open={limitingId === ri.id}
                    onToggle={() => setLimitingId(limitingId === ri.id ? null : ri.id)}
                    onApply={(factor, reason) => {
                      setScale({ factor, reason })
                      setLimitingId(null)
                    }}
                  />
                ))}
              </ul>
            </div>
          ))}
        </section>

        {recipe.steps.length > 0 && (
          <section>
            <h2>Étapes</h2>
            <ol className="steps">
              {recipe.steps.map((step, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className={doneSteps.has(i) ? 'step step-done' : 'step'}
                    aria-pressed={doneSteps.has(i)}
                    onClick={() => toggleStep(i)}
                  >
                    <span className="step-number">{i + 1}</span>
                    <span>
                      {step.text}
                      {step.minutes ? <span className="muted"> ({step.minutes} min)</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}

        {recipe.notes && (
          <section>
            <h2>Notes</h2>
            <p className="pre-line">{recipe.notes}</p>
          </section>
        )}

        {recipe.source && (
          <p className="muted">
            Source :{' '}
            {/^https?:\/\//.test(recipe.source) ? (
              <a href={recipe.source} target="_blank" rel="noreferrer">
                {recipe.source}
              </a>
            ) : (
              recipe.source
            )}
          </p>
        )}

        <div className="actions">
          <a className="button" href={href(paths.recipeEdit(recipe.id))}>
            Modifier
          </a>
          <button
            type="button"
            className="button button-danger"
            onClick={onDelete}
            disabled={deleting}
          >
            {deleting ? 'Suppression…' : 'Supprimer'}
          </button>
        </div>
        {deleteError && <p className="error" role="alert">{deleteError}</p>}
      </main>
    </>
  )
}

function groupBySection(items: RecipeIngredient[]): [string | null, RecipeIngredient[]][] {
  const groups = new Map<string | null, RecipeIngredient[]>()
  for (const item of items) {
    const list = groups.get(item.section) ?? []
    list.push(item)
    groups.set(item.section, list)
  }
  return [...groups]
}

interface IngredientRowProps {
  item: RecipeIngredient
  factor: number
  unitsByCode: Map<string, Unit>
  units: Unit[]
  open: boolean
  onToggle: () => void
  onApply: (factor: number, reason: string) => void
}

function IngredientRow({
  item,
  factor,
  unitsByCode,
  units,
  open,
  onToggle,
  onApply,
}: IngredientRowProps) {
  const unit = item.unit ? unitsByCode.get(item.unit) : undefined
  const scalable = item.quantity !== null && unit !== undefined

  let quantityText = ''
  if (item.quantity !== null) {
    quantityText = unit
      ? formatQuantity(item.quantity * factor, unit, unitsByCode)
      : `${item.quantity * factor} ${item.unit ?? ''}`
  }

  const content = (
    <>
      <span className="ingredient-qty">{quantityText}</span>
      <span className="ingredient-name">
        {item.ingredient.name}
        {item.optional && <span className="badge">facultatif</span>}
        {item.note && <span className="muted">, {item.note}</span>}
        {item.quantity === null && <span className="muted"> (selon goût)</span>}
      </span>
    </>
  )

  return (
    <li>
      {scalable ? (
        <button type="button" className="ingredient" aria-expanded={open} onClick={onToggle}>
          {content}
        </button>
      ) : (
        <div className="ingredient">{content}</div>
      )}
      {open && scalable && (
        <LimitingForm item={item} unit={unit} units={units} unitsByCode={unitsByCode} onApply={onApply} onCancel={onToggle} />
      )}
    </li>
  )
}

/** « de lait », mais « d’œuf », « d’huile » (et « de haricots », h aspiré) */
function withDe(name: string): string {
  const hAspire = /^h(a|â|o[mu])/i.test(name)
  return !hAspire && /^[aàâeéèêëiîïoôœuùûyh]/i.test(name) ? `d’${name}` : `de ${name}`
}

interface LimitingFormProps {
  item: RecipeIngredient
  unit: Unit
  units: Unit[]
  unitsByCode: Map<string, Unit>
  onApply: (factor: number, reason: string) => void
  onCancel: () => void
}

function LimitingForm({ item, unit, units, unitsByCode, onApply, onCancel }: LimitingFormProps) {
  const [amount, setAmount] = useState('')
  const [unitCode, setUnitCode] = useState(unit.code)
  const [error, setError] = useState<string | null>(null)

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const quantity = parseQuantity(amount)
    const availableUnit = unitsByCode.get(unitCode)
    if (!quantity || !availableUnit) {
      setError('Indique une quantité valide.')
      return
    }
    const factor = limitingFactor(
      { quantity, unit: availableUnit },
      { quantity: item.quantity!, unit },
      item.ingredient,
    )
    if (factor === null) {
      setError(
        `Impossible de convertir des ${availableUnit.label_plural} en ${unit.label_plural} pour « ${item.ingredient.name} » : il manque sa densité ou son poids par pièce.`,
      )
      return
    }
    const have = availableUnit.code === 'piece' ? `${amount.trim()}` : `${amount.trim()} ${availableUnit.label}`
    onApply(factor, `Calculée pour ${have} ${withDe(item.ingredient.name.toLowerCase())}.`)
  }

  return (
    <form className="limiting" onSubmit={onSubmit}>
      <label className="field">
        <span>J’ai :</span>
        <div className="row-inputs">
          <input
            type="text"
            inputMode="decimal"
            placeholder="Quantité"
            autoFocus
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              setError(null)
            }}
          />
          <select value={unitCode} onChange={(e) => setUnitCode(e.target.value)} aria-label="Unité">
            {units.map((u) => (
              <option key={u.code} value={u.code}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button type="button" className="link-button" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="button button-small">
          Recalculer
        </button>
      </div>
    </form>
  )
}
