import { execSync } from 'node:child_process'
import { cpSync, createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
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
/*
 * THE SERVICE WORKER, BUILT AS /sw.js. See src/sw/shellRoutes.ts for what it
 * does and why it cannot hold an old build.
 *
 * Emitted as its own chunk at a fixed name (a worker's URL must not carry a
 * hash, or the browser could never find the next one), then finished in
 * generateBundle: the placeholder becomes the exact list of hashed files this
 * build wrote, and the first line names the build. Build only: the dev server
 * registers no worker.
 */
function serviceWorker(id: string) {
  return {
    name: 'scoutngo-service-worker',
    apply: 'build' as const,
    buildStart(this: { emitFile: (file: { type: 'chunk'; id: string; fileName: string }) => string }) {
      this.emitFile({ type: 'chunk', id: 'src/sw/sw.ts', fileName: 'sw.js' })
    },
    generateBundle(
      _options: unknown,
      bundle: Record<string, { type: string; fileName: string; code?: string; imports?: string[] }>,
    ) {
      const sw = bundle['sw.js']
      if (sw === undefined || sw.type !== 'chunk' || typeof sw.code !== 'string') {
        throw new Error('the service worker chunk sw.js was not built')
      }
      if (!sw.code.includes('__SCOUTNGO_SW_ASSETS__')) {
        /* Same reason as the build stamp: a renamed placeholder would ship an empty shell. */
        throw new Error('sw.js has no __SCOUTNGO_SW_ASSETS__ placeholder to fill')
      }
      if ((sw.imports ?? []).length > 0) {
        /* A worker that imports a shared chunk would need module workers. Keep it whole. */
        throw new Error(`sw.js imports other chunks: ${(sw.imports ?? []).join(', ')}`)
      }
      const assets = Object.values(bundle)
        .map((file) => file.fileName)
        .filter((name) => name.startsWith('assets/'))
        .map((name) => `/${name}`)
        .sort()
      sw.code =
        `/* scoutngo service worker, build ${id} */\n` +
        sw.code.replace('__SCOUTNGO_SW_ASSETS__', JSON.stringify(assets).replace(/'/g, "\\'"))
    },
  }
}

/*
 * CESIUM'S RUNTIME FILES, FROM THIS ORIGIN.
 *
 * The 3D view (src/three/) is CesiumJS, and Cesium loads its web workers and
 * a few data files at run time from CESIUM_BASE_URL. They are served from
 * here, at /cesium/<version>/, so the only hosts the 3D view ever talks to
 * are this app's, Esri's and AWS's (scripts/audit-3d-network.mjs). The
 * version is in the path so a new Cesium is a new URL and nothing cached for
 * the old one can be served for it.
 *
 * Dev: a middleware reads them out of node_modules. Build: they are copied
 * into dist. Only Workers, Assets and ThirdParty: the widgets are not used.
 */
const CESIUM_BUILD = 'node_modules/@cesium/engine/Build'
const CESIUM_VERSION = (JSON.parse(readFileSync('node_modules/@cesium/engine/package.json', 'utf8')) as { version: string }).version
const CESIUM_BASE = `/cesium/${CESIUM_VERSION}/`
const CESIUM_DIRS = ['Workers', 'Assets', 'ThirdParty']
const CESIUM_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wasm': 'application/wasm',
  '.xml': 'application/xml',
  '.css': 'text/css',
}

function cesiumRuntime() {
  return {
    name: 'scoutngo-cesium-runtime',
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: { setHeader: (k: string, v: string) => void; end: () => void; statusCode: number } & NodeJS.WritableStream, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0]
        if (!path.startsWith(CESIUM_BASE)) return next()
        const rel = normalize(path.slice(CESIUM_BASE.length))
        if (rel.startsWith('..') || !CESIUM_DIRS.some((d) => rel.startsWith(d + '/'))) return next()
        const file = join(CESIUM_BUILD, rel)
        if (!existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404
          return res.end()
        }
        res.setHeader('Content-Type', CESIUM_TYPES[extname(file)] ?? 'application/octet-stream')
        createReadStream(file).pipe(res)
      })
    },
    closeBundle() {
      if (!existsSync('dist')) return
      for (const dir of CESIUM_DIRS) cpSync(join(CESIUM_BUILD, dir), join('dist', 'cesium', CESIUM_VERSION, dir), { recursive: true })
    },
  }
}

const BUILD_ID_ONCE = buildId()

export default defineConfig({
  plugins: [react(), stampBuildId(BUILD_ID_ONCE), serviceWorker(BUILD_ID_ONCE), cesiumRuntime()],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID_ONCE),
    __BUILD_DIRTY__: JSON.stringify(buildDirty()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_PUSHED__: JSON.stringify(buildPushed()),
    __REPO_SLUG__: JSON.stringify(repoSlug()),
    __CESIUM_BASE__: JSON.stringify(CESIUM_BASE),
  },
  /*
   * Bind to every interface so a phone on the same wifi can reach the dev
   * server. Without this Vite listens on localhost only and prints
   * "Network: use --host to expose", and `vercel dev` has nothing to proxy to
   * from another device.
   */
  /*
   * THE HOT-RELOAD SOCKET ON ITS OWN PORT, not through `vercel dev`'s proxy.
   * The proxy has no handler for a socket the browser drops (a navigation, a
   * closed tab, a test browser stopped): "read ECONNRESET" right after its
   * "Detected upgrade event, proxying", and the whole dev server exits, taking
   * the gate's browser audits down with it (28 Oct). Direct, there is no
   * proxy to fall over.
   */
  server: { host: true, hmr: { port: 24680 } },
  // The maplibre worker is an ES module and imports a sibling chunk, so it has
  // to stay ESM after bundling.
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      output: {
        /*
         * CESIUM IN ITS OWN CHUNK, named so the service worker can leave it
         * out of the install: it is only fetched when 3D is opened, and cached
         * then (src/sw/shellRoutes.ts, isLazy3d).
         */
        manualChunks(id: string) {
          if (id.includes('node_modules/@cesium/')) return 'cesium'
          return undefined
        },
      },
    },
  },
  test: {
    /*
     * .vercel holds the project link and, after `vercel build`, a compiled copy of
     * every function under .vercel/output. Those are build artefacts, and vitest
     * would otherwise collect and run them as a second, broken set of the same
     * tests.
     */
    /*
     * .claude/worktrees holds whole separate checkouts of this repo, each with
     * its own tests. Collected from here, they ran twice over and counted
     * against this checkout.
     */
    exclude: [...configDefaults.exclude, '.vercel/**', '.claude/**'],
    /* Each test starts with an empty weather store (src/lib/weatherStore.ts). */
    setupFiles: ['tests/setup.ts'],
  },
})
