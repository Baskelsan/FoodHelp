import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase.ts'

const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

const buildDate = new Date(__BUILD_DATE__).toLocaleString('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

export default function HomeScreen({ session }: { session: Session }) {
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    setSigningOut(true)
    // scope local : ne déconnecte que cet appareil
    await supabase.auth.signOut({ scope: 'local' })
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>FoodHelp</h1>
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

        <button type="button" className="button button-secondary" onClick={signOut} disabled={signingOut}>
          {signingOut ? 'Déconnexion…' : 'Se déconnecter'}
        </button>
      </main>

      <footer className="app-footer muted">Version du {buildDate}</footer>
    </div>
  )
}
