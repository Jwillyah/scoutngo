/*
 * WHAT THE SERVICE WORKER TOUCHES, AND WHAT IT LEAVES ALONE.
 *
 * WHY THERE IS A SERVICE WORKER NOW. The offline pass made everything work
 * with no signal provided the app was already open. In the field it gets
 * swiped away, and a cold launch on a ridge had nothing to show: `/` is sent
 * must-revalidate and Safari will not serve it stale. So a worker keeps the
 * APP SHELL -- the document and its hashed bundle -- and nothing else.
 *
 * THE DANGER IT WAS KEPT OUT FOR, AND HOW IT IS AVOIDED. A worker is a cache
 * in front of the code, and the classic failure is a phone on an old bundle
 * forever. Three rules stop that here:
 *
 *   THE DOCUMENT IS NETWORK-FIRST. With any signal at all, a launch gets the
 *   deployed index.html, which names the new hashed bundle. The cache is used
 *   only when the network fails or takes longer than NAVIGATION_TIMEOUT_MS.
 *
 *   ONLY HASHED ASSETS ARE CACHE-FIRST. A file under /assets/ has its content
 *   hash in its name, so a cached copy can never be a stale copy of that name.
 *
 *   EVERYTHING ELSE PASSES THROUGH UNTOUCHED: map tiles (they have their own
 *   cache, src/lib/offlineCache.ts, read by the map's protocol), /api, and the
 *   build check's no-store fetch of `/`, which must see the real deploy for
 *   the self-update in src/lib/adoptBuild.ts to work. That fetch is not a
 *   navigation, so it is never answered from here.
 *
 * Nothing about the user is cached here: no venue, no kit, no request body.
 * Pure, so the rules are tested without a browser; the browser proof that a
 * new deploy is adopted is scripts/audit-sw-update.mjs.
 */

/** The app shell's cache. Never the tile cache: that is scoutngo-tiles-v1. */
export const SHELL_CACHE = 'scoutngo-shell-v1'

/**
 * How long a launch waits for the network before using the saved document.
 *
 * Short, because on a mountain the request is sent and never answered, and a
 * launch that waits the browser's own timeout is a launch that looks broken.
 * Long enough that a slow but working connection still gets the new build.
 */
export const NAVIGATION_TIMEOUT_MS = 3000

/** The key every navigation's document is saved under: it is one app. */
export const SHELL_DOCUMENT = '/'

/**
 * Public files the shell shows before any network answer: the cover picture
 * on the landing page, the icon, the manifest. Not hashed, so they are served
 * from the cache and refreshed behind it.
 */
export const SHELL_PUBLIC: readonly string[] = [
  '/favicon.svg',
  '/icons.svg',
  '/manifest.json',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png',
]

export type Route = 'navigate' | 'asset' | 'public' | 'pass'

export interface RequestLike {
  url: string
  method: string
  mode: string
}

/** Which rule a request falls under. Anything not listed passes through. */
export function routeOf(request: RequestLike, origin: string): Route {
  if (request.method !== 'GET') return 'pass'
  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    return 'pass'
  }
  /* Tiles, forecasts, NOAA, Street View: other origins are never touched. */
  if (url.origin !== origin) return 'pass'
  if (url.pathname.startsWith('/api/')) return 'pass'
  /* The worker script itself is the browser's to fetch and compare. */
  if (url.pathname === '/sw.js') return 'pass'
  if (request.mode === 'navigate') return 'navigate'
  if (url.pathname.startsWith('/assets/')) return 'asset'
  /* Cesium's workers and data, versioned in the path: cached the first time 3D opens. */
  if (url.pathname.startsWith('/cesium/')) return 'asset'
  if (SHELL_PUBLIC.includes(url.pathname)) return 'public'
  /* Including fetch('/', { cache: 'no-store' }): the build check must see the network. */
  return 'pass'
}

/**
 * Which cached assets a new worker should drop: hashed files the current
 * build no longer names. The document and the public files are kept.
 */
export function staleShellEntries(cachedPaths: readonly string[], current: readonly string[]): string[] {
  const keep = new Set([SHELL_DOCUMENT, ...SHELL_PUBLIC, ...current])
  return cachedPaths.filter((path) => path.startsWith('/assets/') && !keep.has(path))
}

/**
 * THE 3D VIEW IS NOT PART OF THE INSTALL. Cesium is a few megabytes and most
 * visits never open 3D, so its chunk is left out of what the worker fetches
 * on install and is cached the first time 3D is opened instead (the asset
 * route is cache-first and stores what it fetches). It is still a current
 * asset, so staleShellEntries keeps it.
 */
export const isLazy3d = (path: string): boolean => /^\/assets\/cesium-[^/]*\.(js|css)$/.test(path)

export const installAssets = (assets: readonly string[]): string[] => assets.filter((path) => !isLazy3d(path))
