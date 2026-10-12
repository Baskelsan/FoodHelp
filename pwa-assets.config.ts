import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // Fond opaque : iOS remplit la transparence en noir
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#2f7d4f' } },
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#2f7d4f' } },
  },
  images: ['public/icon.svg'],
})
