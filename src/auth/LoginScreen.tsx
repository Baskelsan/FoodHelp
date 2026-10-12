import { useEffect, useState, type FormEvent } from 'react'
import { isAuthError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase.ts'

const OTP_LENGTH = 6
// Supabase refuse un nouvel envoi au même email pendant 60 s
const RESEND_DELAY_S = 60
const LAST_EMAIL_KEY = 'foodhelp-last-email'

function readLastEmail(): string {
  try {
    return localStorage.getItem(LAST_EMAIL_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveLastEmail(email: string) {
  try {
    localStorage.setItem(LAST_EMAIL_KEY, email)
  } catch {
    // stockage indisponible : simple confort, on ignore
  }
}

function errorMessage(error: unknown): string {
  if (isAuthError(error)) {
    switch (error.code) {
      case 'otp_expired':
        return 'Code invalide ou expiré.'
      case 'otp_disabled':
      case 'signup_disabled':
      case 'user_not_found':
        return 'Aucun compte n’existe pour cet email.'
      case 'email_address_invalid':
      case 'validation_failed':
        return 'Adresse email invalide.'
      case 'over_email_send_rate_limit':
        return 'Trop d’emails envoyés. Réessaie un peu plus tard.'
      case 'over_request_rate_limit':
        return 'Trop de tentatives. Réessaie un peu plus tard.'
    }
    if (error.name === 'AuthRetryableFetchError') {
      return 'Impossible de joindre le serveur. Vérifie ta connexion.'
    }
    return `Erreur : ${error.message}`
  }
  return 'Une erreur inattendue est survenue.'
}

export default function LoginScreen() {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState(readLastEmail)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  async function sendCode() {
    setBusy(true)
    setError(null)
    const cleanEmail = email.trim().toLowerCase()
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      // Le compte est créé à la main dans le dashboard : personne ne peut s'inscrire
      options: { shouldCreateUser: false },
    })
    setBusy(false)
    if (error) {
      setError(errorMessage(error))
      return
    }
    setEmail(cleanEmail)
    saveLastEmail(cleanEmail)
    setCode('')
    setStep('code')
    setResendIn(RESEND_DELAY_S)
  }

  async function verifyCode(token: string) {
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    // En cas de succès, useSession reçoit la session et l'écran change
    if (error) {
      setBusy(false)
      setCode('')
      setError(errorMessage(error))
    }
  }

  function onEmailSubmit(event: FormEvent) {
    event.preventDefault()
    void sendCode()
  }

  function onCodeSubmit(event: FormEvent) {
    event.preventDefault()
    if (code.length === OTP_LENGTH) void verifyCode(code)
  }

  function onCodeChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, OTP_LENGTH)
    setCode(digits)
    // Validation automatique (pratique avec le remplissage auto d'iOS)
    if (digits.length === OTP_LENGTH && !busy) void verifyCode(digits)
  }

  function changeEmail() {
    setStep('email')
    setCode('')
    setError(null)
  }

  return (
    <div className="app center-screen">
      <main className="login">
        <h1>FoodHelp</h1>

        {step === 'email' ? (
          <form key="email" className="stack" onSubmit={onEmailSubmit}>
            <p className="muted">Entre ton email, tu recevras un code de connexion.</p>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button type="submit" className="button" disabled={busy || !email.trim()}>
              {busy ? 'Envoi…' : 'Recevoir un code'}
            </button>
          </form>
        ) : (
          <form key="code" className="stack" onSubmit={onCodeSubmit}>
            <p className="muted">
              Code envoyé à <strong>{email}</strong>. Il peut mettre une minute à arriver
              (pense à regarder les spams).
            </p>
            <label className="field">
              <span>Code à {OTP_LENGTH} chiffres</span>
              <input
                className="code-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={OTP_LENGTH}
                autoFocus
                value={code}
                onChange={(e) => onCodeChange(e.target.value)}
                disabled={busy}
              />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button
              type="submit"
              className="button"
              disabled={busy || code.length !== OTP_LENGTH}
            >
              {busy ? 'Vérification…' : 'Se connecter'}
            </button>
            <div className="row">
              <button
                type="button"
                className="link-button"
                onClick={() => void sendCode()}
                disabled={busy || resendIn > 0}
              >
                {resendIn > 0 ? `Renvoyer le code (${resendIn} s)` : 'Renvoyer le code'}
              </button>
              <button type="button" className="link-button" onClick={changeEmail} disabled={busy}>
                Changer d’email
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  )
}
