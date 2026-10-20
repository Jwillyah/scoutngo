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
/**
 * The commit a build platform says this is, or null when nothing says so.
 *
 * ONE PLACE, because three different functions were each deciding separately
 * whether they were on a platform, and buildDirty was reaching a different
 * answer from buildId in the same environment.
 */
function platformCommit(): string | null {
  const sha =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    process.env.COMMIT_REF
  return typeof sha === 'string' && sha.length >= 7 ? sha.slice(0, 7) : null
}

function buildId(): string {
  const fromEnv = platformCommit()
  if (fromEnv !== null) return fromEnv
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
  if (platformCommit() !== null) return true
  try {
    const on = execSync('git branch -r --contains HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
    return on !== ''
  } catch {
    return false
  }
}

/**
 * Whether the working tree had uncommitted changes when this was built.
 *
 * THE PLATFORM IS BELIEVED, exactly as buildId already believes it.
 *
 * WHAT WAS REPORTED. "The build stamp says dd4fef1+ and the tree was clean. A
 * stamp that warns when nothing is wrong is a stamp I stop reading, which is
 * the exact failure it exists to prevent."
 *
 * The detection itself is sound: a pristine clone of that very commit, with
 * npm ci and a build run in it, reports nothing from `git status --porcelain`
 * and stamps `dd4fef1` with no plus. Checked, not assumed.
 *
 * What differs on a deploy is the WORKING DIRECTORY, not the source. The
 * platform checks out a named commit and then puts its own things beside it,
 * and `git status` answers about the directory rather than about the code. So
 * the plus was reporting the build system's housekeeping as the author's
 * uncommitted work.
 *
 * ON A PLATFORM BUILD THE SOURCE IS THAT COMMIT, BY DEFINITION. buildId
 * already takes the platform's word for which commit this is; asking git a
 * different question in the same environment, and trusting that answer more,
 * is two sources for one fact. One source: if the platform named the commit,
 * the tree is that commit.
 *
 * LOCALLY IT STILL MEANS WHAT IT SAYS, and it still counts untracked files: a
 * new source file that is imported but never committed makes a build that
 * matches no commit just as surely as an edit to a tracked one does.
 */
function buildDirty(): boolean {
  if (platformCommit() !== null) return false
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
      if (!html.includes('__BUILD_ID__')) {
        /*
         * The placeholder is the only thing that puts the id in the
         * document. If it is ever renamed out of index.html this plugin
         * would silently stamp nothing, the meta tag would read
         * "__BUILD_ID__", and every running copy would compare its real id
         * against that string and declare itself stale forever.
         */
        throw new Error('index.html has no __BUILD_ID__ placeholder to stamp')
      }
      return html.replace('__BUILD_ID__', id)
    },
  }
}

/*
 * ONE BUILD ID, COMPUTED ONCE.
 *
 * It was `stampBuildId(buildId())` and `__BUILD_ID__: JSON.stringify(buildId())`
 * -- two calls, each shelling out to git or reading the platform's environment
 * at a different moment in the same build. Two sources for one fact, which is
 * shape A in docs/failure-modes.md, and this is the worst place in the app to
 * have one: the whole stale-build check works by comparing the id in the
 * DOCUMENT against the id in the BUNDLE. If those two ever disagreed, every
 * copy of the app would compare a build against itself, conclude it was stale,
 * and say so forever -- or, now that a cold load adopts a newer build by
 * itself, reload in a loop.
 *
 * They agree today. The point is that nothing made them agree.
 */
const BUILD_ID_ONCE = buildId()

export default defineConfig({
  plugins: [react(), stampBuildId(BUILD_ID_ONCE)],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID_ONCE),
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
