import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { href, paths } from './lib/router.ts'
import { supabase } from './lib/supabase.ts'
import { clearShoppingCache } from './shopping/useShoppingList.ts'

const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

const buildDate = new Date(__BUILD_DATE__).toLocaleString('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

export default function AccountScreen({ session }: { session: Session }) {
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    setSigningOut(true)
    // scope local : ne déconnecte que cet appareil
    await supabase.auth.signOut({ scope: 'local' })
    clearShoppingCache()
  }

  return (
    <>
      <header className="app-header">
        <h1>Compte</h1>
      </header>

      <main className="app-main">
        <section className="card">
          <p>
            Connecté en tant que <strong>{session.user.email}</strong>.
          </p>
          <p className="muted">
            {isStandalone
              ? 'Ouverte depuis l’écran d’accueil ✅'
              : 'Ouverte dans le navigateur. Pour l’installer : Partager → Sur l’écran d’accueil.'}
          </p>
        </section>

        <button
          type="button"
          className="button button-secondary"
          onClick={signOut}
          disabled={signingOut}
        >
          {signingOut ? 'Déconnexion…' : 'Se déconnecter'}
        </button>

        <a className="button button-secondary" href={href(paths.caloriesTodo)}>
          Calories à compléter
        </a>

        <p className="muted small">Version du {buildDate}</p>
        <p className="muted small">
          Données nutritionnelles : Table de composition nutritionnelle des aliments Ciqual 2025,
          Anses, sous{' '}
          <a href="https://www.etalab.gouv.fr/licence-ouverte-open-licence/" target="_blank" rel="noreferrer">
            Licence Ouverte
          </a>
          .
        </p>
      </main>
    </>
  )
}
