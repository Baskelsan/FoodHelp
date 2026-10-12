import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Le site est servi sous https://baskelsan.github.io/FoodHelp/
const base = '/FoodHelp/'

export default defineConfig({
  base,
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Icônes (manifest + apple-touch-icon) générées depuis public/icon.svg
      // (theme-color clair/sombre déjà défini dans index.html)
      pwaAssets: { config: true, overrideManifestIcons: true, injectThemeColor: false },
      manifest: {
        name: 'FoodHelp',
        short_name: 'FoodHelp',
        description: 'Mes recettes, mon stock et ma liste de courses',
        lang: 'fr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f7f5f0',
        theme_color: '#f7f5f0',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
    }),
  ],
})
