/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

// Read rather than `import pkg from './package.json'`: tsconfig.node.json does
// not enable resolveJsonModule, and import attributes would tie this config to
// a specific Node JSON-parsing mode.
const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Which build, not which release. The version only moves when somebody
    // bumps package.json, so it cannot answer "did my phone take the update?"
    // — and on an installed app that is the first question worth asking about
    // any bug report. Minutes, UTC: enough to tell two builds apart, short
    // enough to read off a screenshot.
    __BUILD_STAMP__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
  test: {
    globals: true,
    // The scoring engines are pure and run fastest with no DOM at all, so node
    // stays the default. A suite that needs one opts in with a
    // `// @vitest-environment happy-dom` docblock at the top of the file —
    // Vitest 4 dropped environmentMatchGlobs, and the docblock says which
    // environment a file runs in where somebody reading that file will see it.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt', not 'autoUpdate'. autoUpdate bakes skipWaiting() into the
      // generated worker, so a new build takes over the moment it installs —
      // but nothing reloads the open page, and the navigation route below
      // serves the *precached* index.html. The result was a release that
      // showed the previous build on first launch, every time, with no signal.
      //
      // 'prompt' holds the new worker in `waiting` until the user accepts.
      // Press is a scorekeeper used mid-round with no signal; a silent reload
      // while someone is entering a score on the 14th is worse than the
      // staleness it fixes. App.tsx starts at view 'home' with round null and
      // has no restore-on-mount, so any reload bounces the user to Home, and
      // an in-progress Setup (component state, never persisted) is lost
      // outright. So the refresh is always the user's tap, never ours.
      registerType: 'prompt',
      // We register from UpdatePrompt.tsx via virtual:pwa-register/react.
      // Leaving this at its 'auto' default would ALSO emit registerSW.js and
      // register a second time.
      injectRegister: null,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // A build artifact for Netlify's form scanner, not an app asset.
        globIgnores: ['**/__forms.html'],
      },
      includeAssets: ['app-icon.svg', 'favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Press — Golf Side Games',
        short_name: 'Press',
        description: 'Track golf side games: match play, skins, Stableford, Wolf and more.',
        theme_color: '#14694e',
        background_color: '#0b3d2e',
        display: 'standalone',
        // 'portrait' locked the installed app so it would not rotate at all,
        // regardless of CSS. Landscape is supported now — see the landscape
        // media query in index.css.
        orientation: 'any',
        start_url: '/',
        icons: [
          {
            src: 'app-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
})
