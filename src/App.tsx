import type { Session } from '@supabase/supabase-js'
import AccountScreen from './AccountScreen.tsx'
import LoginScreen from './auth/LoginScreen.tsx'
import { useSession } from './auth/useSession.ts'
import IngredientScreen from './ingredients/IngredientScreen.tsx'
import InventoryFormScreen from './inventory/InventoryFormScreen.tsx'
import InventoryScreen from './inventory/InventoryScreen.tsx'
import { href, paths, tabOf, useRoute, type Route, type Tab } from './lib/router.ts'
import { supabaseConfigured } from './lib/supabase.ts'
import RecipeDetailScreen from './recipes/RecipeDetailScreen.tsx'
import RecipeFormScreen from './recipes/RecipeFormScreen.tsx'
import RecipeImportScreen from './recipes/RecipeImportScreen.tsx'
import RecipeListScreen from './recipes/RecipeListScreen.tsx'
import AislesScreen from './shopping/AislesScreen.tsx'
import ShoppingGenerateScreen from './shopping/ShoppingGenerateScreen.tsx'
import ShoppingScreen from './shopping/ShoppingScreen.tsx'

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

const TABS: { tab: Tab; path: string; icon: string; label: string }[] = [
  { tab: 'recipes', path: paths.recipes, icon: '📖', label: 'Recettes' },
  { tab: 'inventory', path: paths.inventory, icon: '🧺', label: 'Stock' },
  { tab: 'shopping', path: paths.shopping, icon: '🛒', label: 'Courses' },
  { tab: 'account', path: paths.account, icon: '👤', label: 'Compte' },
]

function Shell({ session }: { session: Session }) {
  const route = useRoute()
  const current = tabOf(route)

  return (
    <div className="app has-tabbar">
      <Screen route={route} session={session} />
      <nav className="tabbar" aria-label="Navigation principale">
        {TABS.map(({ tab, path, icon, label }) => (
          <a
            key={tab}
            href={href(path)}
            className={tab === current ? 'tab tab-active' : 'tab'}
            aria-current={tab === current ? 'page' : undefined}
          >
            <span aria-hidden="true">{icon}</span>
            {label}
          </a>
        ))}
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
    case 'inventory':
      return <InventoryScreen />
    case 'inventory-new':
      return <InventoryFormScreen />
    case 'inventory-item':
      return <InventoryFormScreen key={route.id} id={route.id} />
    case 'shopping':
      return <ShoppingScreen />
    case 'shopping-generate':
      return <ShoppingGenerateScreen />
    case 'aisles':
      return <AislesScreen />
    case 'ingredient':
      return <IngredientScreen key={route.id} id={route.id} />
    case 'account':
      return <AccountScreen session={session} />
  }
}
