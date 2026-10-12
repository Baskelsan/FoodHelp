import { useState, type FormEvent } from 'react'
import type { Aisle } from '../lib/db-types.ts'
import { createAisle, deleteAisle, describeError, listAisles, updateAisle } from '../lib/data.ts'
import { href, paths } from '../lib/router.ts'
import { useAsync } from '../lib/useAsync.ts'

export default function AislesScreen() {
  const { data: aisles, error, loading, reload } = useAsync(listAisles, [])
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
    } catch (e) {
      setActionError(describeError(e))
    } finally {
      reload()
      setBusy(false)
    }
  }

  /** Échange deux rayons et renumérote toute la liste (positions 0, 1, 2…). */
  function move(index: number, delta: number) {
    if (!aisles) return
    const target = index + delta
    if (target < 0 || target >= aisles.length) return
    const next = [...aisles]
    ;[next[index], next[target]] = [next[target], next[index]]
    void run(async () => {
      await Promise.all(
        next.map((a, position) =>
          a.position === position ? null : updateAisle(a.id, { position }),
        ),
      )
    })
  }

  function rename(aisle: Aisle, name: string) {
    const clean = name.trim()
    if (!clean || clean === aisle.name) return
    void run(() => updateAisle(aisle.id, { name: clean }))
  }

  function remove(aisle: Aisle) {
    if (!window.confirm(`Supprimer le rayon « ${aisle.name} » ? Ses articles passeront dans « Sans rayon ».`)) {
      return
    }
    void run(() => deleteAisle(aisle.id))
  }

  function onAdd(event: FormEvent) {
    event.preventDefault()
    if (!newName.trim()) return
    const position = aisles?.length ? Math.max(...aisles.map((a) => a.position)) + 1 : 0
    void run(async () => {
      await createAisle(newName, position)
      setNewName('')
    })
  }

  return (
    <>
      <header className="app-header">
        <a className="back-link" href={href(paths.shopping)}>‹ Courses</a>
        <h1>Rayons</h1>
        <p className="muted header-meta">Dans l’ordre de ton magasin : la liste suit cet ordre.</p>
      </header>

      <main className="app-main">
        {loading && !aisles && <p className="muted">Chargement…</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {actionError && <p className="error" role="alert">{actionError}</p>}

        <ul className="list">
          {(aisles ?? []).map((aisle, i) => (
            <li key={aisle.id} className="aisle-row">
              <input
                defaultValue={aisle.name}
                aria-label={`Nom du rayon ${i + 1}`}
                onBlur={(e) => rename(aisle, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
                disabled={busy}
              />
              <div className="row-buttons">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Monter ${aisle.name}`}
                  disabled={busy || i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Descendre ${aisle.name}`}
                  disabled={busy || i === (aisles?.length ?? 0) - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="icon-button icon-danger"
                  aria-label={`Supprimer ${aisle.name}`}
                  disabled={busy}
                  onClick={() => remove(aisle)}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>

        <form className="aisle-row" onSubmit={onAdd}>
          <input
            placeholder="Nouveau rayon"
            aria-label="Nom du nouveau rayon"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={busy}
          />
          <button type="submit" className="button button-small" disabled={busy || !newName.trim()}>
            Ajouter
          </button>
        </form>
      </main>
    </>
  )
}
