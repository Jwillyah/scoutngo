import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  /*
   * Bind to every interface so a phone on the same wifi can reach the dev
   * server. Without this Vite listens on localhost only and prints
   * "Network: use --host to expose", and `vercel dev` has nothing to proxy to
   * from another device.
   */
  server: { host: true },
  // The maplibre worker is an ES module and imports a sibling chunk, so it has
  // to stay ESM after bundling.
  worker: { format: 'es' },
  test: {
    /*
     * .vercel holds the project link and, after `vercel build`, a compiled copy of
     * every function under .vercel/output. Those are build artefacts, and vitest
     * would otherwise collect and run them as a second, broken set of the same
     * tests.
     */
    exclude: [...configDefaults.exclude, '.vercel/**'],
  },
})
