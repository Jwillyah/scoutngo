import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// maplibre-gl's stylesheet must load BEFORE ours. It styles .maplibregl-map and
// .maplibregl-ctrl-* with single class selectors, the same specificity we use to
// theme them, so whichever sheet lands last wins. Importing it from MapView.tsx
// put it last and silently beat every override in app.css.
import 'maplibre-gl/dist/maplibre-gl.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/app.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/*
 * THE APP SHELL, FOR A COLD LAUNCH WITH NO SIGNAL. Production builds only: the
 * dev server has no sw.js and no hashed assets to keep. What the worker does,
 * and why it cannot pin an old build, is in src/sw/shellRoutes.ts; the proof
 * that a new deploy is still adopted is scripts/audit-sw-update.mjs.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      /* No worker means no offline cold launch, and everything else works as before. */
    })
  })
}
