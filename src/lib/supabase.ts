import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Faux si les variables d'environnement n'ont pas été fournies au build. */
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
