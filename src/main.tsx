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

/*
 * THE PAGE DOES NOT PINCH-ZOOM UNDER THE MAP. iOS Safari ignores
 * user-scalable=no in the viewport tag, and a pinch that the page also takes
 * is a page that scales round the map while the map scales too (29 Oct, the
 * snapping). Its own `gesturestart` is the one hook it honours. MapLibre's
 * pinch reads touch events, which this leaves alone. Chrome has no such event,
 * so this is the one part of the pinch fix the emulation cannot exercise.
 */
document.addEventListener('gesturestart', (event) => event.preventDefault())

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
