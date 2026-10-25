import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  NAVIGATION_TIMEOUT_MS,
  routeOf,
  SHELL_CACHE,
  SHELL_DOCUMENT,
  staleShellEntries,
} from '../src/sw/shellRoutes.ts'
import { TILE_CACHE } from '../src/lib/offlineCache.ts'

/*
 * ONE SERVICE WORKER, FOR THE APP SHELL ONLY.
 *
 * WHAT THIS TEST USED TO BE. tests/noServiceWorker.test.ts forbade any worker,
 * because a worker is a second cache in front of the CODE and the classic
 * failure is a phone serving an old bundle forever. That reasoning held until
 * offline became the point: without one, a cold launch on a ridge with no
 * signal had nothing to open (docs/offline.md).
 *
 * The argument is now settled the other way, on conditions this file holds:
 *
 *   exactly one registration, in src/main.tsx, production only
 *   no worker library or plugin: the whole worker is src/sw/sw.ts
 *   the document network-first, only hashed assets cache-first
 *   map tiles, /api and the build check pass through untouched
 *   the shell cache is not the tile cache
 *
 * And the condition that cannot be unit-tested -- a new deploy is adopted on
 * the next cold launch -- is scripts/audit-sw-update.mjs, in the commit gate.
 */
const ROOTS = ['src', 'api', 'public', 'netlify']
const EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.jsx', '.html', '.json']

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry === 'node_modules') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (EXTENSIONS.some((ext) => full.endsWith(ext))) out.push(full)
  }
  return out
}

const FILES = [...ROOTS.flatMap((root) => walk(root)), 'index.html', 'vite.config.ts'].filter(
  (file) => existsSync(file),
)

/** Comments out, before matching: every file that explains the worker names it. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const ORIGIN = 'https://scoutngo.vercel.app'
const get = (url: string, mode = 'cors') => routeOf({ url, method: 'GET', mode }, ORIGIN)

describe('one service worker, registered once', () => {
  it('has files to check, so a passing run means something', () => {
    expect(FILES.length).toBeGreaterThan(40)
  })

  it('is registered in src/main.tsx and nowhere else, in production only', () => {
    const registering = FILES.filter((file) =>
      /serviceWorker\s*\.\s*register\s*\(/.test(withoutComments(readFileSync(file, 'utf8'))),
    )
    expect(registering).toEqual(['src/main.tsx'])
    expect(withoutComments(readFileSync('src/main.tsx', 'utf8'))).toMatch(/import\.meta\.env\.PROD/)
  })

  it('pulls in no worker library', () => {
    const pkg = readFileSync('package.json', 'utf8')
    for (const name of ['vite-plugin-pwa', 'workbox', 'sw-precache', '@serwist', 'serwist']) {
      expect(pkg, `package.json names ${name}`).not.toContain(name)
    }
    for (const file of FILES) {
      expect(withoutComments(readFileSync(file, 'utf8')), file).not.toMatch(/\bworkbox\b/i)
    }
  })

  it('keeps the manifest to Add to Home Screen', () => {
    const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8')) as Record<string, unknown>
    expect(manifest).not.toHaveProperty('serviceworker')
    expect(manifest.start_url).toBeDefined()
  })

  it('tells the host never to cache sw.js, so the next deploy is always seen', () => {
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      headers: { source: string; headers: { key: string; value: string }[] }[]
    }
    const rule = vercel.headers.find((h) => h.source === '/sw.js')
    expect(rule?.headers.find((h) => h.key === 'Cache-Control')?.value).toMatch(/no-cache/)
  })
})

describe('what it touches', () => {
  it('answers a navigation, network-first, from the saved document', () => {
    expect(get(`${ORIGIN}/`, 'navigate')).toBe('navigate')
    expect(get(`${ORIGIN}/how`, 'navigate')).toBe('navigate')
    expect(get(`${ORIGIN}/?b=3f9ef67`, 'navigate')).toBe('navigate')
    expect(SHELL_DOCUMENT).toBe('/')
    expect(NAVIGATION_TIMEOUT_MS).toBeLessThanOrEqual(5000)
  })

  it('serves hashed assets cache-first', () => {
    expect(get(`${ORIGIN}/assets/index-BIFmDKYo.js`)).toBe('asset')
  })

  /*
   * THE SELF-UPDATE DEPENDS ON THIS ONE. checkForNewBuild fetches `/` with
   * no-store and compares the id. Answered from the cache, every copy would
   * look current forever. It is not a navigation, so it passes through.
   */
  it('never answers the build check', () => {
    expect(get(`${ORIGIN}/`, 'cors')).toBe('pass')
    expect(get(`${ORIGIN}/`, 'same-origin')).toBe('pass')
  })

  it('leaves map tiles, the API and other hosts alone', () => {
    expect(get('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/18/1/2')).toBe('pass')
    expect(get('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/15/1/2.png')).toBe('pass')
    expect(get(`${ORIGIN}/api/generate`)).toBe('pass')
    expect(get(`${ORIGIN}/sw.js`)).toBe('pass')
    expect(routeOf({ url: `${ORIGIN}/assets/x.js`, method: 'POST', mode: 'cors' }, ORIGIN)).toBe('pass')
  })

  it('keeps its cache apart from the tiles', () => {
    expect(SHELL_CACHE).not.toBe(TILE_CACHE)
    const source = withoutComments(readFileSync('src/sw/sw.ts', 'utf8'))
    expect(source).not.toContain(TILE_CACHE)
    expect(source).not.toMatch(/arcgisonline|elevation-tiles|localStorage|indexedDB/)
  })

  it('drops the old build\'s hashed files, keeps the document and the public files', () => {
    const cached = ['/', '/favicon.svg', '/assets/index-OLD.js', '/assets/index-NEW.js']
    expect(staleShellEntries(cached, ['/assets/index-NEW.js'])).toEqual(['/assets/index-OLD.js'])
  })
})

/*
 * OFFLINE FIELD PACKS STAY IN localStorage, as they were: data the shooter
 * made, never put in a cache that exists to hold code.
 */
it('keeps offline field packs in localStorage', () => {
  const source = readFileSync('src/lib/fieldPack.ts', 'utf8')
  expect(source).toContain('localStorage')
  expect(source).not.toMatch(/caches\s*\.\s*open|CacheStorage|serviceWorker/)
})
