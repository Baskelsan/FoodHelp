import { useMemo, useSyncExternalStore } from 'react'

// Routage par hash (#/recettes/…) : compatible GitHub Pages, sans configuration serveur

export type Route =
  | { name: 'recipes' }
  | { name: 'recipe-new' }
  | { name: 'recipe-import' }
  | { name: 'recipe'; id: string }
  | { name: 'recipe-edit'; id: string }
  | { name: 'inventory' }
  | { name: 'inventory-new' }
  | { name: 'inventory-item'; id: string }
  | { name: 'shopping' }
  | { name: 'shopping-generate' }
  | { name: 'aisles' }
  | { name: 'ingredient'; id: string }
  | { name: 'account' }

export const paths = {
  recipes: '/recettes',
  recipeNew: '/recettes/nouvelle',
  recipeImport: '/recettes/importer',
  recipe: (id: string) => `/recettes/${id}`,
  recipeEdit: (id: string) => `/recettes/${id}/modifier`,
  inventory: '/stock',
  inventoryNew: '/stock/nouveau',
  inventoryItem: (id: string) => `/stock/${id}`,
  shopping: '/courses',
  shoppingGenerate: '/courses/recettes',
  aisles: '/courses/rayons',
  ingredient: (id: string) => `/ingredients/${id}`,
  account: '/compte',
}

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#/, '').split('/').filter(Boolean)
  if (parts[0] === 'compte') return { name: 'account' }
  if (parts[0] === 'stock') {
    if (parts[1] === 'nouveau') return { name: 'inventory-new' }
    if (parts[1]) return { name: 'inventory-item', id: parts[1] }
    return { name: 'inventory' }
  }
  if (parts[0] === 'courses') {
    if (parts[1] === 'recettes') return { name: 'shopping-generate' }
    if (parts[1] === 'rayons') return { name: 'aisles' }
    return { name: 'shopping' }
  }
  if (parts[0] === 'ingredients' && parts[1]) return { name: 'ingredient', id: parts[1] }
  if (parts[0] === 'recettes' && parts[1]) {
    if (parts[1] === 'nouvelle') return { name: 'recipe-new' }
    if (parts[1] === 'importer') return { name: 'recipe-import' }
    if (parts[2] === 'modifier') return { name: 'recipe-edit', id: parts[1] }
    return { name: 'recipe', id: parts[1] }
  }
  return { name: 'recipes' }
}

function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback)
  return () => window.removeEventListener('hashchange', callback)
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  return useMemo(() => parseRoute(hash), [hash])
}

/** Change de page ; `replace` évite d'empiler l'entrée dans l'historique. */
export function navigate(path: string, { replace = false } = {}) {
  if (replace) window.location.replace(`#${path}`)
  else window.location.hash = path
}

export type Tab = 'recipes' | 'inventory' | 'shopping' | 'account'

/** Onglet de la barre du bas auquel appartient une route. */
export function tabOf(route: Route): Tab {
  switch (route.name) {
    case 'inventory':
    case 'inventory-new':
    case 'inventory-item':
      return 'inventory'
    case 'shopping':
    case 'shopping-generate':
    case 'aisles':
    case 'ingredient':
      return 'shopping'
    case 'account':
      return 'account'
    default:
      return 'recipes'
  }
}

/** Lien interne vers une route. */
export function href(path: string): string {
  return `#${path}`
}
