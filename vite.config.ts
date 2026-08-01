import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative base so the build works when served from a sub-path
  // (e.g. GitHub Pages at /ClaudeProjet/). Safe together with HashRouter.
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Life RPG – Dein Skill-Tree fürs echte Leben',
        short_name: 'Life RPG',
        description:
          'Level dich in Wissen, Kommunikation, Gesundheit, Purpose und Finanzen – dein Leben als Skill-Tree.',
        lang: 'de',
        theme_color: '#0a0e1a',
        background_color: '#0a0e1a',
        display: 'standalone',
        // Relative so the app keeps working if the repository is renamed.
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // The app shell is cached; Supabase traffic always goes to the network,
        // which is what makes the outbox — not a stale cache — the offline story.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
