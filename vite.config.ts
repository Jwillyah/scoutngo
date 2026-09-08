import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The maplibre worker is an ES module and imports a sibling chunk, so it has
  // to stay ESM after bundling.
  worker: { format: 'es' },
  test: {
    /*
     * `netlify dev` bundles every function into .netlify/functions-serve. Those
     * are compiled copies, and vitest would otherwise collect and run them as a
     * second, broken set of the same tests.
     */
    exclude: [...configDefaults.exclude, '.netlify/**'],
  },
})
