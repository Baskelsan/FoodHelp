const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

const buildDate = new Date(__BUILD_DATE__).toLocaleString('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>FoodHelp</h1>
      </header>

      <main className="app-main">
        <section className="card">
          <p>Le squelette de l’app est en place.</p>
          <p className="muted">
            {isStandalone
              ? 'Ouverte depuis l’écran d’accueil ✅'
              : 'Ouverte dans le navigateur. Pour l’installer : Partager → Sur l’écran d’accueil.'}
          </p>
        </section>

        <label className="field">
          <span>Champ de test (pas de zoom iOS)</span>
          <input type="text" placeholder="Ex. 425 ml de lait" />
        </label>

        <button type="button" className="button">
          Gros bouton
        </button>
      </main>

      <footer className="app-footer muted">Version du {buildDate}</footer>
    </div>
  )
}
