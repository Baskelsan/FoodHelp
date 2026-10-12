import { createClient } from '@supabase/supabase-js'

const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Seule l'origine compte : tolère une URL collée avec un chemin (ex. .../rest/v1/)
function projectOrigin(raw: string | undefined): string {
  try {
    return raw ? new URL(raw.trim()).origin : ''
  } catch {
    return ''
  }
}
const url = projectOrigin(import.meta.env.VITE_SUPABASE_URL)

/** Faux si les variables d'environnement n'ont pas été fournies (ou sont invalides) au build. */
export const supabaseConfigured = Boolean(url && anonKey)

// Sans configuration, App affiche un message d'erreur et n'appelle jamais ce client :
// les valeurs de repli évitent seulement que createClient lève une exception au chargement.
export const supabase = createClient(url || 'http://localhost', anonKey || 'missing', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Connexion par code OTP uniquement, jamais par lien magique
    detectSessionInUrl: false,
    storageKey: 'foodhelp-auth',
  },
})
