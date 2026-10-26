/*
 * THE SERVICE WORKER: THE APP SHELL, SO A COLD LAUNCH WORKS WITH NO SIGNAL.
 *
 * The rules, and why each one cannot hold an old build, are in
 * src/sw/shellRoutes.ts. This file is only the wiring.
 *
 * BUILT AS /sw.js by the scoutngo-service-worker plugin in vite.config.ts,
 * which replaces the placeholder below with the exact list of hashed files
 * the build wrote and stamps the build id on the first line. A new deploy
 * therefore always produces a byte-different sw.js, which is what makes the
 * browser install the new worker.
 */
import {
  NAVIGATION_TIMEOUT_MS,
  routeOf,
  SHELL_CACHE,
  SHELL_DOCUMENT,
  SHELL_PUBLIC,
  installAssets,
  staleShellEntries,
} from './shellRoutes.ts'

const SHELL_ASSETS: string[] = JSON.parse('__SCOUTNGO_SW_ASSETS__') as string[]

/* Typed by hand: the app's tsconfig is DOM, and a worker's lib would clash with it. */
interface ExtendableEventLike extends Event {
  waitUntil(promise: Promise<unknown>): void
}
interface FetchEventLike extends ExtendableEventLike {
  request: Request
  respondWith(response: Promise<Response>): void
}
const worker = self as unknown as {
  location: Location
  addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEventLike) => void): void
  addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void
  skipWaiting(): Promise<void>
  clients: { claim(): Promise<void> }
}

worker.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      /* The document fresh from the network, never from the HTTP cache. */
      await cache.put(SHELL_DOCUMENT, await fetch(new Request(SHELL_DOCUMENT, { cache: 'reload' })))
      await cache.addAll(installAssets(SHELL_ASSETS))
      /* Public files are a nicety: one missing must not stop the shell installing. */
      await Promise.all(SHELL_PUBLIC.map((path) => cache.add(path).catch(() => undefined)))
      await worker.skipWaiting()
    })(),
  )
})

worker.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      const paths = (await cache.keys()).map((request) => new URL(request.url).pathname)
      await Promise.all(
        staleShellEntries(paths, SHELL_ASSETS).map((path) => cache.delete(path)),
      )
      await worker.clients.claim()
    })(),
  )
})

/**
 * The network, or a rejection once NAVIGATION_TIMEOUT_MS has passed.
 *
 * THE FETCH IS CANCELLED, NOT ABANDONED. The first version only stopped
 * waiting: the request stayed open underneath. On a dead cell nothing ever
 * answers it, and a browser allows six connections per host, so a few
 * launches later every request to the app queued behind requests that were
 * never coming back. Found by scripts/audit-sw-update.mjs in hang mode.
 */
async function networkWithin(request: Request, ms: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(request, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function navigate(request: Request): Promise<Response> {
  const cache = await caches.open(SHELL_CACHE)
  try {
    const response = await networkWithin(request, NAVIGATION_TIMEOUT_MS)
    /* A good document replaces the saved one, so the next offline launch is this build. */
    if (response.ok) await cache.put(SHELL_DOCUMENT, response.clone())
    return response
  } catch {
    const saved = await cache.match(SHELL_DOCUMENT)
    if (saved !== undefined) return saved
    return new Response('ScoutNGo needs a signal the first time it opens.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }
}

async function asset(request: Request): Promise<Response> {
  const cache = await caches.open(SHELL_CACHE)
  const saved = await cache.match(request)
  if (saved !== undefined) return saved
  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

async function publicFile(request: Request): Promise<Response> {
  const cache = await caches.open(SHELL_CACHE)
  const saved = await cache.match(request)
  const refresh = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone())
      return response
    })
    .catch(() => undefined)
  if (saved !== undefined) return saved
  return (await refresh) ?? new Response('', { status: 504 })
}

worker.addEventListener('fetch', (event) => {
  const route = routeOf(event.request, worker.location.origin)
  /* 'pass' never calls respondWith: the browser handles it as if there were no worker. */
  if (route === 'navigate') event.respondWith(navigate(event.request))
  else if (route === 'asset') event.respondWith(asset(event.request))
  else if (route === 'public') event.respondWith(publicFile(event.request))
})
