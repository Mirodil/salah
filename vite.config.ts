import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// Only the environment is read here, so declare just that instead of pulling in all of @types/node.
declare const process: { env: Record<string, string | undefined> };

// GitHub Pages serves a project site from /<repo>/, so the deploy workflow sets BASE_PATH=/salah/.
// Everywhere else (dev, tests, a custom domain) the app lives at the root.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  build: { chunkSizeWarningLimit: 2000 },
  test: { include: ['tests/**/*.test.ts'], env: { TZ: 'UTC' } },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,woff}'],
        importScripts: ['notification-sw.js'],
        navigateFallback: 'index.html',
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: 'Salah Times',
        short_name: 'Salah',
        description: 'Salah times, Qibla direction and moon phase for your exact location and elevation.',
        display: 'standalone',
        orientation: 'any',
        // start_url and scope default to `base`
        theme_color: '#0b1530',
        background_color: '#0b1530',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
