import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer'
import { VitePWA } from 'vite-plugin-pwa'
import { parentHubManifestApiPlugin } from './vite-plugin-parent-hub-manifest.ts'
import { matchApiPlugin } from './vite-plugin-match-api.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    parentHubManifestApiPlugin(mode),
    matchApiPlugin(mode),
    // Optimize public/imported images before the SW precache hashes them.
    ViteImageOptimizer({
      includePublic: true,
      png: { compressionLevel: 9, palette: true },
      jpeg: { quality: 80 },
      jpg: { quality: 80 },
      webp: { quality: 80 },
      avif: { quality: 50 },
      logStats: true,
    }),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      // Registration is handled in-app via workbox-window (push + Parent Hub).
      injectRegister: false,
      // Dynamic per-team manifest lives at /api/manifest — do not emit a static one.
      manifest: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,avif,woff2}'],
        // Keep SW lean; push + routing logic lives in src/sw.ts
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    modulePreload: {
      resolveDependencies: (_filename, deps) =>
        deps.filter((dep) => !dep.includes('recharts')),
    },
    // Vite 8 / Rolldown: codeSplitting.groups replaces Rollup's manualChunks.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/](?:react|react-dom|scheduler)(?:[\\/]|$)/,
              priority: 20,
            },
            {
              name: 'recharts',
              test: /node_modules[\\/](?:recharts|victory-vendor|d3-)/,
              priority: 15,
            },
          ],
        },
      },
    },
  },
}))
