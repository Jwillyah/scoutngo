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
