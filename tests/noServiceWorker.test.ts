import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * THIS APP REGISTERS NO SERVICE WORKER, AND MUST NOT START.
 *
 * WHY IT MATTERS HERE. A pass was spent disagreeing about screenshots, with a
 * phone apparently showing code that had already been changed. A service
 * worker is the usual culprit for that, so it was worth ruling out: there is
 * none, and what actually holds a stale build is iOS Safari keeping
 * index.html, which names the hashed bundle URLs.
 *
 * WHY IT MUST NOT START. Offline field packs are localStorage
 * (src/lib/fieldPack.ts), so NOTHING about working offline needs one. What a
 * service worker would add is a second, invisible cache in front of the app,
 * owned by the browser, that survives a reload and serves old code to someone
 * standing on a dock. The build check in src/lib/build.ts compares the
 * deployed build with the running one over a single no-store request, which is
 * the whole of what is wanted and none of the risk.
 *
 * If one is ever genuinely needed, this test is the place to argue it out.
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

const SELF = 'tests/noServiceWorker.test.ts'

/**
 * Comments out, before matching.
 *
 * Every file that explains WHY there is no service worker necessarily names
 * one, and the first version of this check failed on src/lib/build.ts for
 * containing the sentence "no workbox". The code is what is being checked.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('no service worker', () => {
  it('has files to check, so a passing run means something', () => {
    expect(FILES.length).toBeGreaterThan(40)
  })

  it('registers none, and ships no worker script', () => {
    const found: string[] = []
    for (const file of FILES) {
      if (file.endsWith(SELF)) continue
      const source = withoutComments(readFileSync(file, 'utf8'))
      /* Reaching for the API at all, and then actually registering one. */
      if (/navigator\s*\.\s*serviceWorker/.test(source)) {
        found.push(`${file}: navigator.serviceWorker`)
      }
      if (/serviceWorker\s*\.\s*register\s*\(/.test(source)) found.push(`${file}: register()`)
      if (/\bworkbox\b/i.test(source)) found.push(`${file}: workbox`)
      if (/vite-plugin-pwa/.test(source)) found.push(`${file}: vite-plugin-pwa`)
    }
    expect(found).toEqual([])
  })

  /*
   * The check has to be able to fail, or it is decoration.
   */
  it('would catch a registration if one were added', () => {
    const real = `if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')`
    expect(/navigator\s*\.\s*serviceWorker/.test(withoutComments(real))).toBe(true)
    expect(/serviceWorker\s*\.\s*register\s*\(/.test(withoutComments(real))).toBe(true)
    // And really does ignore an explanation of why there is none.
    expect(withoutComments('/* no workbox here */ const x = 1')).not.toContain('workbox')
    expect(withoutComments('// navigator.serviceWorker is not used')).not.toContain('serviceWorker')
  })

  it('declares no service worker dependency', () => {
    const pkg = readFileSync('package.json', 'utf8')
    for (const name of ['vite-plugin-pwa', 'workbox', 'sw-precache', '@serwist', 'serwist']) {
      expect(pkg, `package.json names ${name}`).not.toContain(name)
    }
  })

  /*
   * The manifest is Add to Home Screen only. A manifest does not install a
   * service worker, but a `serviceworker` member in one is a declaration of
   * intent and would be the first step toward it.
   */
  it('keeps the manifest to Add to Home Screen', () => {
    const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8')) as Record<
      string,
      unknown
    >
    expect(manifest).not.toHaveProperty('serviceworker')
    expect(manifest.start_url).toBeDefined()
  })

  /*
   * OFFLINE FIELD PACKS DO NOT DEPEND ON ONE. This is the thing that would
   * break if somebody removed the check above and concluded a worker was
   * needed for offline. It is not: the packs are in localStorage.
   */
  it('keeps offline field packs in localStorage, which needs no worker', () => {
    const source = readFileSync('src/lib/fieldPack.ts', 'utf8')
    expect(source).toContain('localStorage')
    expect(source).not.toMatch(/caches\s*\.\s*open|CacheStorage|serviceWorker/)
  })
})
