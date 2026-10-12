import LoginScreen from './auth/LoginScreen.tsx'
import { useSession } from './auth/useSession.ts'
import HomeScreen from './HomeScreen.tsx'
import { supabaseConfigured } from './lib/supabase.ts'

export default function App() {
  if (!supabaseConfigured) {
    return (
      <div className="app center-screen">
        <main className="login">
          <h1>FoodHelp</h1>
          <p className="error" role="alert">
            Configuration manquante : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent être
            définies (.env.local en local, secrets GitHub pour le déploiement).
          </p>
        </main>
      </div>
    )
  }
  return <AuthGate />
}

function AuthGate() {
  const { session, loading } = useSession()

  if (loading) {
    return (
      <div className="app center-screen">
        <p className="muted">Chargement…</p>
      </div>
    )
  }
  return session ? <HomeScreen session={session} /> : <LoginScreen />
}
