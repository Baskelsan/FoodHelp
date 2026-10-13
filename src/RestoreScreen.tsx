import { useMemo, useState, type ChangeEvent } from 'react'
import {
  parseBackup,
  restorePayload,
  type ParsedBackup,
  type RestoreSummary,
} from './lib/backup.ts'
import { describeError, listInventory, listRecipes, listShopping, restoreBackup } from './lib/data.ts'
import { href, paths } from './lib/router.ts'
import { useAsync } from './lib/useAsync.ts'
import { normalize } from './recipes/RecipeListScreen.tsx'

async function loadCurrent() {
  const [recipes, inventory, shopping] = await Promise.all([listRecipes(), listInventory(), listShopping()])
  return {
    titles: new Set(recipes.map((r) => normalize(r.title.trim()))),
    inventoryCount: inventory.length,
    shoppingCount: shopping.length,
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

export default function RestoreScreen() {
  const current = useAsync(loadCurrent, [])
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [summary, setSummary] = useState<RestoreSummary | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const { parsed, error } = useMemo(
    () => (text.trim() ? parseBackup(text) : { parsed: null, error: null }),
    [text],
  )

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setSummary(null)
    setActionError(null)
    setFileName(file.name)
    setText(await file.text())
  }

  return (
    <>
      <header className="app-header">
        <a className="back-link" href={href(paths.account)}>‹ Compte</a>
        <h1>Restaurer une sauvegarde</h1>
        <p className="muted header-meta">
          Les données de la sauvegarde sont ajoutées aux tiennes : rien n’est supprimé ni écrasé.
        </p>
      </header>

      <main className="app-main">
        {!summary && (
          <>
            <label className="button button-secondary file-button">
              {fileName ? `Fichier : ${fileName}` : 'Choisir un fichier de sauvegarde'}
              <input type="file" accept=".json,application/json,text/plain" onChange={onFile} />
            </label>
            <details>
              <summary className="muted small">ou coller le contenu JSON</summary>
              <textarea
                className="import-input"
                rows={6}
                aria-label="Contenu de la sauvegarde"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={text}
                onChange={(e) => {
                  setFileName(null)
                  setText(e.target.value)
                }}
              />
            </details>
          </>
        )}

        {error && <p className="error" role="alert">{error}</p>}
        {current.error && <p className="error" role="alert">{current.error}</p>}

        {parsed && current.data && !summary && (
          <RestoreForm
            key={text}
            parsed={parsed}
            existingTitles={current.data.titles}
            hasInventory={current.data.inventoryCount > 0}
            hasShopping={current.data.shoppingCount > 0}
            restoring={restoring}
            onRestore={async (payload) => {
              setRestoring(true)
              setActionError(null)
              try {
                setSummary(await restoreBackup(payload))
              } catch (e) {
                setActionError(describeError(e))
              } finally {
                setRestoring(false)
              }
            }}
          />
        )}
        {actionError && (
          <p className="error" role="alert">
            Restauration annulée, rien n’a été modifié : {actionError}
          </p>
        )}

        {summary && (
          <section className="card stack-sm">
            <h2>Restauration terminée ✅</h2>
            <ul className="backup-summary">
              <li>{plural(summary.recipes, 'recette')} ajoutée{summary.recipes > 1 ? 's' : ''}</li>
              <li>
                {plural(summary.ingredients_created, 'ingrédient')} créé
                {summary.ingredients_created > 1 ? 's' : ''},{' '}
                {summary.ingredients_completed} complété{summary.ingredients_completed > 1 ? 's' : ''}
              </li>
              <li>{plural(summary.aisles, 'rayon')} ajouté{summary.aisles > 1 ? 's' : ''}</li>
              <li>{plural(summary.inventory, 'produit')} ajouté{summary.inventory > 1 ? 's' : ''} au stock</li>
              <li>
                {plural(summary.shopping_list, 'article')} ajouté{summary.shopping_list > 1 ? 's' : ''} à la
                liste
              </li>
            </ul>
            <a className="button" href={href(paths.recipes)}>
              Voir mes recettes
            </a>
          </section>
        )}
      </main>
    </>
  )
}

interface RestoreFormProps {
  parsed: ParsedBackup
  existingTitles: Set<string>
  hasInventory: boolean
  hasShopping: boolean
  restoring: boolean
  onRestore: (payload: ReturnType<typeof restorePayload>) => void
}

function RestoreForm({
  parsed,
  existingTitles,
  hasInventory,
  hasShopping,
  restoring,
  onRestore,
}: RestoreFormProps) {
  const { backup, recipes } = parsed
  const isDuplicate = (i: number) => existingTitles.has(normalize(recipes[i].payload.title.trim()))

  const [ingredients, setIngredients] = useState(true)
  // Recettes : celles qui n'existent pas déjà et sans erreur
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(recipes.flatMap((r, i) => (r.errors.length === 0 && !isDuplicate(i) ? [i] : []))),
  )
  // Stock et liste : ajoutés seulement s'ils sont vides, pour éviter les doublons
  const [inventory, setInventory] = useState(!hasInventory && backup.inventory.length > 0)
  const [shopping, setShopping] = useState(!hasShopping && backup.shopping_list.length > 0)
  const [showRecipes, setShowRecipes] = useState(false)

  function toggleRecipe(i: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const nothing = !ingredients && selected.size === 0 && !inventory && !shopping
  const date = backup.exported_at
    ? new Date(backup.exported_at).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
    : null

  function submit() {
    if (!window.confirm('Ajouter le contenu choisi de cette sauvegarde à tes données ?')) return
    onRestore(restorePayload(parsed, { ingredients, recipes: selected, inventory, shopping }))
  }

  return (
    <section className="stack">
      {date && <p className="muted small">Sauvegarde du {date}.</p>}

      <label className="card checkbox restore-option">
        <input type="checkbox" checked={ingredients} onChange={(e) => setIngredients(e.target.checked)} />
        <span>
          <strong>Rayons et ingrédients</strong>
          <span className="muted small block">
            {plural(backup.aisles.length, 'rayon')}, {plural(backup.ingredients.length, 'ingrédient')} :
            créés s’ils manquent, sinon complétés (rayon, CIQUAL, conversions).
          </span>
        </span>
      </label>

      <div className="card restore-option-block">
        <div className="checkbox">
          <span>
            <strong>Recettes</strong>
            <span className="muted small block">
              {selected.size} sur {recipes.length} sélectionnée{selected.size > 1 ? 's' : ''} (celles
              déjà présentes sont décochées).
            </span>
          </span>
        </div>
        {recipes.length > 0 && (
          <button type="button" className="link-button" onClick={() => setShowRecipes(!showRecipes)}>
            {showRecipes ? 'Masquer la liste' : 'Choisir les recettes'}
          </button>
        )}
        {showRecipes && (
          <ul className="restore-recipes">
            {recipes.map((r, i) => (
              <li key={i}>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    disabled={r.errors.length > 0}
                    onChange={() => toggleRecipe(i)}
                  />
                  <span>
                    {r.title}
                    {isDuplicate(i) && <span className="muted small"> · déjà présente</span>}
                    {r.errors.length > 0 && <span className="error small"> · {r.errors[0]}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="card checkbox restore-option">
        <input
          type="checkbox"
          checked={inventory}
          disabled={backup.inventory.length === 0}
          onChange={(e) => setInventory(e.target.checked)}
        />
        <span>
          <strong>Stock</strong>
          <span className="muted small block">
            {plural(backup.inventory.length, 'produit')}
            {hasInventory && ' · ton stock actuel n’est pas vide : risque de doublons'}
          </span>
        </span>
      </label>

      <label className="card checkbox restore-option">
        <input
          type="checkbox"
          checked={shopping}
          disabled={backup.shopping_list.length === 0}
          onChange={(e) => setShopping(e.target.checked)}
        />
        <span>
          <strong>Liste de courses</strong>
          <span className="muted small block">
            {plural(backup.shopping_list.length, 'article')}
            {hasShopping && ' · ta liste actuelle n’est pas vide : risque de doublons'}
          </span>
        </span>
      </label>

      <button type="button" className="button" onClick={submit} disabled={restoring || nothing}>
        {restoring ? 'Restauration…' : 'Restaurer'}
      </button>
    </section>
  )
}
