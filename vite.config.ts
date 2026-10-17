import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

/*
 * WHICH BUILD IS THIS.
 *
 * A whole pass was spent disagreeing about screenshots because there was no
 * way to tell, from a phone, whether the screen in front of you was the code
 * that had just been pushed. There is no service worker in this app, but iOS
 * Safari and a home-screen app both hold index.html for a long time, and a
 * stale bundle looks exactly like a fix that did not work.
 *
 * So the short commit hash is compiled in and shown in Settings. Read at build
 * time from git, falling back to the platform's own commit variables on Vercel
 * where .git may not be present, and to "dev" when neither exists.
 */
function buildId(): string {
  const fromEnv =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    process.env.COMMIT_REF
  if (typeof fromEnv === 'string' && fromEnv.length >= 7) return fromEnv.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    // No git and no CI variable: a tarball, or a fresh unversioned checkout.
    return 'dev'
  }
}

/**
 * WHICH REPOSITORY THIS IS, so the running app can ask what is on origin.
 *
 * Read from the git remote rather than written down, so a fork checks its own
 * origin and not this one. Empty when there is no remote, and the app then
 * says it cannot check rather than checking the wrong thing.
 */
function repoSlug(): string {
  const fromEnv = process.env.VERCEL_GIT_REPO_OWNER
  const name = process.env.VERCEL_GIT_REPO_SLUG
  if (typeof fromEnv === 'string' && typeof name === 'string' && fromEnv !== '') {
    return `${fromEnv}/${name}`
  }
  try {
    const url = execSync('git remote get-url origin', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
    const match = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/.exec(url)
    return match === null ? '' : `${match[1]}/${match[2]}`
  } catch {
    return ''
  }
}

/**
 * WHETHER THE COMMIT THIS WAS BUILT FROM HAD BEEN PUSHED.
 *
 * A local build of unpushed work is the thing that cost three days: it looks
 * exactly like a deployed build, on the same laptop, serving the same screen.
 * Compiled in so the stamp can say so out loud rather than leaving somebody to
 * compare hashes by hand.
 *
 * On a deploy this is always true: the platform builds from a pushed commit.
 * It is the LOCAL case this exists to catch.
 */
function buildPushed(): boolean {
  if (typeof process.env.VERCEL_GIT_COMMIT_SHA === 'string') return true
  try {
    const on = execSync('git branch -r --contains HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
    return on !== ''
  } catch {
    return false
  }
}

/** Whether the working tree had uncommitted changes when this was built. */
function buildDirty(): boolean {
  try {
    return (
      execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim() !== ''
    )
  } catch {
    return false
  }
}

// https://vite.dev/config/
/**
 * Stamps the build id into index.html.
 *
 * `define` does not reach HTML, and the id has to be IN THE DOCUMENT rather
 * than only in the bundle: the whole point is that a phone holding a stale
 * index.html can be told so, and it can only be told by something it
 * re-fetches. The hashed bundle URLs are named BY that document, so a stale
 * document never loads the new bundle at all.
 */
function stampBuildId(id: string) {
  return {
    name: 'scoutngo-build-stamp',
    transformIndexHtml(html: string) {
      return html.replace('__BUILD_ID__', id)
    },
  }
}

export default defineConfig({
  plugins: [react(), stampBuildId(buildId())],
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
    __BUILD_DIRTY__: JSON.stringify(buildDirty()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_PUSHED__: JSON.stringify(buildPushed()),
    __REPO_SLUG__: JSON.stringify(repoSlug()),
  },
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
