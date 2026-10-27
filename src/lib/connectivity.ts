/*
 * IS THERE A NETWORK? THE ONE ANSWER THE WHOLE APP READS.
 *
 * WHAT THIS REPLACED, AND WHY. The answer used to be the last request's: any
 * tile, tide or forecast call that failed set "offline" for the whole app and
 * the next one that succeeded cleared it. On 27 Oct at Virginia Beach an
 * iPhone with five bars of 5G showed OFFLINE: one source refusing (Overpass
 * and the map tiles limit by address, and iCloud Private Relay shares one), or
 * one tile slower than its 8 s timeout, was enough to say the phone had no
 * signal. The before and after are measurements/2026-10-27-connectivity-before.md
 * and measurements/2026-10-27-connectivity-after.md.
 *
 * NOW A FAILED REQUEST IS ONLY A REASON TO LOOK. It asks the app's own origin
 * for a tiny answer (HEAD /, no-store: no body, never the HTTP cache, and the
 * service worker passes it straight through, src/sw/shellRoutes.ts). Offline
 * is that check failing, and failing again PROBE_CONFIRM_MS later. One
 * source's failure says nothing about the others: each one fails on its own.
 *
 * navigator.onLine IS ONE HINT, NOT THE ANSWER. It is true on a mountain with
 * the radio on and no bars, so "true" proves nothing. "False" is taken with
 * one failed check, no second look: two witnesses agree.
 *
 * RECOVERY NEEDS NO RELOAD. While offline the check is repeated every
 * PROBE_EVERY_MS, and at once when the phone says it is back, when the app
 * comes to the front, and when any request anywhere succeeds.
 */

export const PROBE_URL = '/'
/** Long enough for a HEAD on a slow 4G link (562 ms round trip) many times over. */
export const PROBE_TIMEOUT_MS = 6000
/** The second look before saying offline. */
export const PROBE_CONFIRM_MS = 2500
/** While offline, how often to look again. */
export const PROBE_EVERY_MS = 10_000
/**
 * A success this recent answers for the next failure report. Short: at 15 s, a
 * download that finished just as the network went (the venue saving itself
 * for offline) kept the app saying online for 20 to 25 s after it was gone,
 * found by scripts/measure-connectivity.mjs's "network gone" case before this
 * was fixed; the after file records the fixed run.
 */
export const PROBE_FRESH_MS = 5_000

type Listener = (online: boolean) => void

export interface ConnectivityDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>
  now: () => number
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
  deviceOnline: () => boolean
}

const browserDeps = (): ConnectivityDeps => ({
  fetch: (url, init) => fetch(url, init),
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  deviceOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
})

export interface Connectivity {
  isOnline(): boolean
  /** Every network call that can tell success from failure reports it here. */
  report(ok: boolean): void
  /** Look now: the phone said it is back, or the app came to the front. */
  check(): void
  onChange(listener: Listener): () => void
  /** How many checks have been sent, for the measuring script. */
  probes(): number
  reset(): void
}

export function createConnectivity(deps: ConnectivityDeps = browserDeps()): Connectivity {
  let offline = false
  /* A first failed check waiting for its second look. */
  let suspect = false
  let lastOkAt = -Infinity
  let inFlight = false
  let timer: unknown = null
  let sent = 0
  const listeners = new Set<Listener>()

  const set = (next: boolean) => {
    if (next === offline) return
    offline = next
    for (const listener of listeners) listener(!offline)
  }
  const schedule = (ms: number) => {
    if (timer !== null) deps.clearTimeout(timer)
    timer = deps.setTimeout(() => {
      timer = null
      probe()
    }, ms)
  }
  const passed = () => {
    lastOkAt = deps.now()
    suspect = false
    if (timer !== null) deps.clearTimeout(timer)
    timer = null
    set(false)
  }

  const probe = () => {
    if (inFlight) return
    inFlight = true
    sent += 1
    const controller = new AbortController()
    const stop = deps.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
    void deps
      .fetch(PROBE_URL, { method: 'HEAD', cache: 'no-store', signal: controller.signal })
      /* Any answer at all is the network working: a 404 came back over it. */
      .then(
        () => true,
        () => false,
      )
      .then((ok) => {
        deps.clearTimeout(stop)
        inFlight = false
        if (ok) return passed()
        if (offline) return schedule(PROBE_EVERY_MS)
        if (suspect || !deps.deviceOnline()) {
          suspect = false
          set(true)
          return schedule(PROBE_EVERY_MS)
        }
        suspect = true
        schedule(PROBE_CONFIRM_MS)
      })
  }

  return {
    isOnline: () => !offline,
    report(ok) {
      /*
       * A success while the phone says it is offline is a request that was
       * already on its way back when the network went: look, do not believe it.
       */
      if (ok && !deps.deviceOnline()) {
        if (!inFlight) probe()
        return
      }
      if (ok) return passed()
      /* Already looking, already offline and looking, or a check just passed. */
      if (inFlight || timer !== null || deps.now() - lastOkAt < PROBE_FRESH_MS) return
      probe()
    },
    check() {
      if (timer !== null) deps.clearTimeout(timer)
      timer = null
      probe()
    },
    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    probes: () => sent,
    reset() {
      offline = false
      suspect = false
      lastOkAt = -Infinity
      inFlight = false
      if (timer !== null) deps.clearTimeout(timer)
      timer = null
      sent = 0
    },
  }
}

/** The app's one. */
export const connectivity = createConnectivity()

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => connectivity.check())
  window.addEventListener('offline', () => connectivity.check())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !connectivity.isOnline()) connectivity.check()
  })
}
