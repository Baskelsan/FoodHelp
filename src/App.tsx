import type { Session } from '@supabase/supabase-js'
import AccountScreen from './AccountScreen.tsx'
import LoginScreen from './auth/LoginScreen.tsx'
import { useSession } from './auth/useSession.ts'
import { href, paths, useRoute, type Route } from './lib/router.ts'
import { supabaseConfigured } from './lib/supabase.ts'
import RecipeDetailScreen from './recipes/RecipeDetailScreen.tsx'
import RecipeFormScreen from './recipes/RecipeFormScreen.tsx'
import RecipeImportScreen from './recipes/RecipeImportScreen.tsx'
import RecipeListScreen from './recipes/RecipeListScreen.tsx'

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
  return session ? <Shell session={session} /> : <LoginScreen />
}

function Shell({ session }: { session: Session }) {
  const route = useRoute()

  return (
    <div className="app has-tabbar">
      <Screen route={route} session={session} />
      <nav className="tabbar" aria-label="Navigation principale">
        <a
          href={href(paths.recipes)}
          className={route.name === 'account' ? 'tab' : 'tab tab-active'}
          aria-current={route.name !== 'account' ? 'page' : undefined}
        >
          <span aria-hidden="true">📖</span>
          Recettes
        </a>
        <a
          href={href(paths.account)}
          className={route.name === 'account' ? 'tab tab-active' : 'tab'}
          aria-current={route.name === 'account' ? 'page' : undefined}
        >
          <span aria-hidden="true">👤</span>
          Compte
        </a>
      </nav>
    </div>
  )
}

function Screen({ route, session }: { route: Route; session: Session }) {
  switch (route.name) {
    case 'recipes':
      return <RecipeListScreen />
    case 'recipe-new':
      return <RecipeFormScreen />
    case 'recipe-import':
      return <RecipeImportScreen />
    case 'recipe':
      return <RecipeDetailScreen key={route.id} id={route.id} />
    case 'recipe-edit':
      return <RecipeFormScreen key={route.id} id={route.id} />
    case 'account':
      return <AccountScreen session={session} />
  }
}
