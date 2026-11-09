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
 * for a tiny answer (GET /api/forecast with no parameters, no-store, never the
 * HTTP cache; the service worker passes /api/ straight through,
 * src/sw/shellRoutes.ts). Offline
 * is that check failing three times over 30 s (Batch N, below). One
 * source's failure says nothing about the others: each one fails on its own.
 *
 * navigator.onLine IS A HINT, NEVER THE ANSWER. It is true on a mountain with
 * the radio on and no bars, and on 8 Nov it was false on working 5G.
 *
 * RECOVERY NEEDS NO RELOAD. While offline the check is repeated every
 * PROBE_EVERY_MS, and at once when the phone says it is back, when the app
 * comes to the front, and when any request anywhere succeeds.
 */

/*
 * Batch Map A3 (9 Nov, LTE): the home loaded through /api/forecast while the
 * map said "Offline · no offline pack here", which needs this check to fail
 * three times running. The check now asks the path the field proved on
 * cellular (8 Nov, 9:20 PM: GET /api/forecast with no parameters answered
 * from 5G): the same function, a GET, answered at once with a 400 and a
 * tiny body, no-store. Any answer at all is the network working.
 */
export const PROBE_URL = '/api/forecast'
export const PROBE_METHOD = 'GET'
/** Long enough for a HEAD on a slow 4G link (562 ms round trip) many times over. */
export const PROBE_TIMEOUT_MS = 6000
/*
 * A FLAKY LINK IS NOT NO LINK (8 Nov, 9:20 PM, iPhone on 5G: the app's own
 * function answered, and a minute later Safari said the iPhone was not
 * connected, on the same 5G). Offline is OFFLINE_FAILURES failed checks
 * spanning at least OFFLINE_SPAN_MS; between them the check is retried after
 * RETRY_MS, then twice that. One failure, or navigator.onLine saying false,
 * is never enough on its own, and any success starts the count again. The
 * screens keep the last good forecast all the while (src/lib/weatherStore.ts).
 */
export const OFFLINE_FAILURES = 3
export const OFFLINE_SPAN_MS = 30_000
export const RETRY_MS = 10_000
/** The first retry after a failed check (kept for the measuring script). */
export const PROBE_CONFIRM_MS = RETRY_MS
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
  /* When each failed check since the last success came back. */
  let fails: number[] = []
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
  /* A retry in the offline chain (see the failure branch below). */
  const scheduleRetry = (ms: number) => {
    if (timer !== null) deps.clearTimeout(timer)
    timer = deps.setTimeout(() => {
      timer = null
      probe(true)
    }, ms)
  }
  const passed = () => {
    lastOkAt = deps.now()
    fails = []
    if (timer !== null) deps.clearTimeout(timer)
    timer = null
    set(false)
  }

  const probe = (fromChain = false) => {
    if (inFlight) return
    inFlight = true
    sent += 1
    const controller = new AbortController()
    const stop = deps.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
    void deps
      .fetch(PROBE_URL, { method: PROBE_METHOD, cache: 'no-store', signal: controller.signal })
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
        /*
         * Counted by the retry chain itself, not the wall clock (a frozen page
         * clock never "spans" 30 s): the first failure, then the retry
         * RETRY_MS later, then the one 2 x RETRY_MS after that, all failing:
         * OFFLINE_FAILURES failures over OFFLINE_SPAN_MS. A check some other
         * failure asked for in between does not move the chain on.
         */
        if (fails.length === 0 || fromChain) fails.push(deps.now())
        if (fails.length >= OFFLINE_FAILURES) {
          fails = []
          set(true)
          return schedule(PROBE_EVERY_MS)
        }
        /* An off-chain failure leaves a pending retry where it is: frequent reports must not postpone it for ever. */
        if (!fromChain && timer !== null) return
        scheduleRetry(RETRY_MS * 2 ** (fails.length - 1))
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
      fails = []
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
