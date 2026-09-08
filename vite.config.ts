import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The maplibre worker is an ES module and imports a sibling chunk, so it has
  // to stay ESM after bundling.
  worker: { format: 'es' },
})
