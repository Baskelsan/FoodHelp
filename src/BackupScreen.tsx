import { useMemo, useState } from 'react'
import { backupFileName, buildBackup } from './lib/backup.ts'
import {
  describeError,
  listAisles,
  listAllIngredients,
  listInventory,
  listRecipesForBackup,
  listShopping,
} from './lib/data.ts'
import { href, paths } from './lib/router.ts'
import { useAsync } from './lib/useAsync.ts'

async function load() {
  const [recipes, ingredients, aisles, inventory, shopping] = await Promise.all([
    listRecipesForBackup(),
    listAllIngredients(),
    listAisles(),
    listInventory(),
    listShopping(),
  ])
  return buildBackup({ recipes, ingredients, aisles, inventory, shopping })
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

/**
 * Fichier à partager. iOS refuse parfois application/json dans la feuille de
 * partage : on retombe alors sur text/plain (le nom garde l'extension .json).
 */
function shareableFile(json: string, name: string): File | null {
  if (!navigator.canShare) return null
  for (const type of ['application/json', 'text/plain']) {
    const file = new File([json], name, { type })
    if (navigator.canShare({ files: [file] })) return file
  }
  return null
}

function download(json: string, name: string) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export default function BackupScreen() {
  const { data: backup, error, loading, reload } = useAsync(load, [])
  const [status, setStatus] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const json = useMemo(() => (backup ? JSON.stringify(backup, null, 2) : ''), [backup])
  const sizeKb = Math.max(1, Math.round(new Blob([json]).size / 1024))
  const name = backup ? backupFileName(new Date(backup.exported_at)) : ''

  async function save() {
    setStatus(null)
    setActionError(null)
    const file = shareableFile(json, name)
    if (!file) {
      download(json, name)
      setStatus('Fichier téléchargé.')
      return
    }
    try {
      await navigator.share({ files: [file], title: name })
      setStatus('Sauvegarde partagée.')
    } catch (e) {
      // Partage annulé par l'utilisateur : rien à signaler
      if (e instanceof DOMException && e.name === 'AbortError') return
      setActionError(describeError(e))
    }
  }

  async function copy() {
    setStatus(null)
    setActionError(null)
    try {
      await navigator.clipboard.writeText(json)
      setStatus('JSON copié dans le presse-papiers.')
    } catch {
      setActionError('Copie impossible sur cet appareil : utilise « Enregistrer ou partager ».')
    }
  }

  return (
    <>
      <header className="app-header">
        <a className="back-link" href={href(paths.account)}>‹ Compte</a>
        <h1>Sauvegarde</h1>
        <p className="muted header-meta">
          Exporte toutes tes données dans un fichier JSON, à garder dans Fichiers ou iCloud.
        </p>
      </header>

      <main className="app-main">
        {loading && !backup && <p className="muted">Préparation de la sauvegarde…</p>}
        {error && (
          <div className="stack">
            <p className="error" role="alert">{error}</p>
            <button type="button" className="button button-secondary" onClick={reload}>
              Réessayer
            </button>
          </div>
        )}

        {backup && (
          <>
            <section className="card stack-sm">
              <ul className="backup-summary">
                <li>{plural(backup.recipes.length, 'recette')}</li>
                <li>{plural(backup.ingredients.length, 'ingrédient')} (rayons, conversions, calories)</li>
                <li>{plural(backup.aisles.length, 'rayon')}</li>
                <li>{plural(backup.inventory.length, 'produit')} en stock</li>
                <li>{plural(backup.shopping_list.length, 'article')} dans la liste de courses</li>
              </ul>
              <p className="muted small">
                {name} · {sizeKb} Ko
              </p>
            </section>

            <button type="button" className="button" onClick={save}>
              Enregistrer ou partager
            </button>
            <button type="button" className="button button-secondary" onClick={copy}>
              Copier le JSON
            </button>

            {status && <p className="center" role="status">✅ {status}</p>}
            {actionError && <p className="error" role="alert">{actionError}</p>}

            <p className="muted small">
              Pour restaurer tes recettes, colle ce fichier dans Recettes → Importer. La restauration
              complète (stock, rayons, liste) arrivera avec la sauvegarde automatique.
            </p>
          </>
        )}
      </main>
    </>
  )
}
