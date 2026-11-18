/*
 * ONE PLACE EVERY WEATHER ANSWER COMES FROM.
 *
 * WHY. At Virginia Beach on 30 Oct the Wind and Cloud chips said "no data"
 * and Sky fire said no cloud came back. Open-Meteo is free and limits each
 * IP (600 calls a minute, 5,000 an hour, 10,000 a day; a request for many
 * points or many models counts as many calls), and every screen asked on
 * its own: the chips, Sky fire, Preview, Special light (twice), the Wind
 * page and the map's cloud layer, each again on a new hour of the time bar.
 * measurements/2026-10-30-weather-requests-before.md has the count.
 *
 * WHAT IT DOES.
 *  - Same question, one request: the key is the request itself, so two
 *    screens asking for the same thing share one answer, and a question
 *    already on its way is waited for, not asked twice.
 *  - Kept in memory and in IndexedDB on the phone with the time it arrived,
 *    and reused until it is older than the caller's `maxAgeMs` (never under
 *    ten minutes, MIN_REUSE_MS, Batch SIMPLE-1 Section 4b). Moving the
 *    time bar asks for the same day again, which is the same request.
 *  - When the service says 429 ("too many"), nothing is sent to it for a
 *    while that doubles each time (1, 2, 4 ... 30 min; an hour for its daily
 *    limit), and callers get the last answer at any age, marked stale, so a
 *    chip can say "6 kt · 9 h ago" instead of "no data". `weatherBusy()`
 *    says why, for the one status line.
 *
 * NOTHING NEW LEAVES THE PHONE: the same requests as before, fewer of them.
 * The kept answers are forecasts for a place, on this phone only, cleared
 * by Privacy › Clear this phone.
 */
import { connectivity } from './connectivity.ts'

export interface WeatherHit {
  ok: true
  payload: unknown
  /** When the answer arrived, ms since 1970. */
  fetchedAt: number
  /** Older than the caller wanted: the last good answer, because a new one could not be had. */
  stale: boolean
  /** Served from what was kept, with no request this time. Offline, its age is said (ux-rules 13). */
  kept: boolean
  /** Batch M: the kept answer, shown at once while a new one is being fetched ("updated 7:52 · refreshing"). */
  refreshing?: boolean
}
export interface WeatherMiss {
  ok: false
  /** In words, for the card. */
  reason: string
  /** No answer at all (offline, timed out), as opposed to the service refusing. */
  unreachable: boolean
}
export type WeatherAnswer = WeatherHit | WeatherMiss

export interface Busy {
  /** Until when nothing is sent, ms since 1970. */
  until: number
  /** 'daily' when the service said its daily limit was reached. */
  why: 'busy' | 'daily'
}

/* Batch SIMPLE-1, Section 4b: a minute, not two (the phone's log at 1:07 PM on 18 Nov: api.open-meteo.com 429); then doubling, as before. */
export const FIRST_BACKOFF_MS = 60_000
export const MAX_BACKOFF_MS = 30 * 60_000
export const DAILY_BACKOFF_MS = 60 * 60_000
/*
 * Batch SIMPLE-1, Section 4b: an answer younger than this is reused whatever
 * the caller asks, so no screen can ask the same question twice in ten
 * minutes. Every caller asks for an hour or more today; this is the floor.
 */
export const MIN_REUSE_MS = 10 * 60_000
/*
 * Batch SIMPLE-1, Section 4b: after Open-Meteo refuses this phone (a 429 to a
 * direct ask), nothing more goes to it from the phone for this long; asks go
 * through the forecast cache instead (when there is one), and the kept
 * answer with its age stands in where the cache cannot answer. Before, every
 * ask went to Open-Meteo first again and was refused again, one 429 a
 * question (tests/networkPath.test.ts had it as direct, cache, direct, cache).
 */
export const DIRECT_HOLD_MS = 60_000
/** An answer older than this is not kept even as a stale stand-in. */
export const KEEP_MS = 3 * 86_400_000
const TIMEOUT_MS = 10_000
const DB = 'scoutngo-weather'
const STORE = 'answers'

interface Kept {
  payload: unknown
  fetchedAt: number
}

const memory = new Map<string, Kept>()
const inFlight = new Map<string, Promise<WeatherAnswer>>()
let busy: Busy | null = null
let refusals = 0
/** Until when nothing is asked of Open-Meteo directly from the phone, ms since 1970 (DIRECT_HOLD_MS). */
let directHeldUntil = 0
/** Whether a direct ask is held now (Section 4b), for the tests and Settings › Debug. */
export const directHeld = (now: number = Date.now()): boolean => directHeldUntil > now
const listeners = new Set<() => void>()
let wake: ReturnType<typeof setTimeout> | null = null
/** Counts the ends of back-offs: screens depend on it to ask again then, and on nothing else. */
let epoch = 0
export const weatherEpoch = (): number => epoch

/*
 * WHAT THE SCREENS ARE SHOWING (Batch CORE, Section 7A.6): the newest forecast
 * answer given out this session, fresh or kept, for the signal chip ("Offline
 * · showing 3:10 PM"). Null until one is given.
 */
let shownAt: number | null = null
function noteShown(at: number): void {
  if (shownAt === null || at > shownAt) {
    shownAt = at
    tell()
  }
}
export const weatherShownAt = (): number | null => shownAt
/** Every request actually sent, for Settings › Debug and for the tests' budget. */
const sent: { at: number; host: string; status: number | 'failed' }[] = []

/** The request with its parameters in a fixed order, so the same question is the same key. */
export function weatherKey(url: string): string {
  const u = new URL(url)
  const params = [...u.searchParams].sort(([a], [b]) => a.localeCompare(b))
  return `${u.origin}${u.pathname}?${new URLSearchParams(params).toString()}`
}

/*
 * ROUNDED TO 2 DECIMALS BEFORE IT IS ASKED (Batch H, 2 Nov 9:36 AM: "Weather
 * service busy, retrying in 2 min" on an ordinary session). Each nudge of the
 * pin or switch between two spots a few hundred metres apart was a new
 * question, because the key was the exact coordinate. 0.01 degrees is about
 * 1.1 km north-south, finer than any model's grid (HRRR 3 km, the rest
 * coarser), so the answer is the same forecast and the request is the same
 * request: one key, kept for the hour (FORECAST_MAX_AGE_MS).
 */
export const COORD_DECIMALS = 2

/** The request with every latitude and longitude rounded to COORD_DECIMALS. */
export function roundedWeatherUrl(url: string): string {
  const u = new URL(url)
  for (const name of ['latitude', 'longitude']) {
    const v = u.searchParams.get(name)
    if (v === null) continue
    u.searchParams.set(name, v.split(',').map((x) => {
      const n = Number(x)
      return Number.isFinite(n) && x.trim() !== '' ? n.toFixed(COORD_DECIMALS) : x
    }).join(','))
  }
  return u.toString()
}

/** When to ask again after `n` refusals in a row (n >= 1). */
export function backoffMs(n: number, daily: boolean): number {
  if (daily) return DAILY_BACKOFF_MS
  return Math.min(MAX_BACKOFF_MS, FIRST_BACKOFF_MS * 2 ** Math.max(0, n - 1))
}

/*
 * JITTER (Batch M, Section 1). Phones behind one carrier address that were
 * refused together would all ask again on the same second and be refused
 * together again; each waits its back-off times 0.8 to 1.2 instead.
 */
export const JITTER = 0.2
let random: () => number = Math.random
/** For tests: a fixed draw (0.5 is no jitter). */
export function setBackoffRandom(f: () => number): void {
  random = f
}
export function jittered(ms: number, r: number = random()): number {
  return Math.round(ms * (1 - JITTER + 2 * JITTER * Math.min(1, Math.max(0, r))))
}

/*
 * THE FORECAST CACHE (Batch M, Section 1; api/forecast.ts). Set at start-up
 * by the app (src/main.tsx) to '/api/forecast'; null (tests, scripts) asks
 * Open-Meteo directly. The request is the same, rounded, with its host and
 * path in `om` and the UTC hour in `hr`, so the CDN keeps one answer per
 * spot, model set and hour for every phone. The key in this store stays the
 * Open-Meteo request, so nothing kept changes meaning.
 *
 * Asked only after Open-Meteo refuses this phone or cannot be reached (Batch
 * CORE, Section 0.4; send below). When our function is not there (404, 405: a
 * dev server) it is not asked again this session. A 429 from it is a 429.
 */
export const EDGE_TIMEOUT_MS = 4000
let edge: string | null = null
let edgeMissing = false
export function setForecastEdge(path: string | null): void {
  edge = path
  edgeMissing = false
}

/*
 * COARSER FOR THE CACHE (Batch N, Section 0 D): the spot sent to this app's
 * function is snapped to a 0.05° grid, about 5 km, not 2 decimals. More
 * phones share each cached answer, and Vercel's request log holds a 5 km
 * square, not a 1 km one. Open-Meteo's own grids are 3 km (HRRR) and coarser,
 * so the forecast is the same one a few kilometres over. The direct ask
 * (when the cache is not there) stays at 2 decimals, as before.
 */
export const EDGE_GRID_DEG = 0.05
export function snapEdge(v: number): string {
  return (Math.round(v / EDGE_GRID_DEG) * EDGE_GRID_DEG).toFixed(2)
}

/** The request through the cache: `${edge}?om=<host><path>&<params>&hr=<UTC hour>`, every coordinate on the 0.05° grid. */
export function edgeUrl(url: string, at: Date, base: string): string {
  const u = new URL(url)
  for (const name of ['latitude', 'longitude']) {
    const v = u.searchParams.get(name)
    if (v !== null) u.searchParams.set(name, v.split(',').map((x) => (Number.isFinite(Number(x)) && x.trim() !== '' ? snapEdge(Number(x)) : x)).join(','))
  }
  const hr = at.toISOString().slice(0, 13)
  const q = u.search.length > 1 ? `&${u.search.slice(1)}` : ''
  return `${base}?om=${u.host}${u.pathname}${q}&hr=${hr}`
}

export function weatherBusy(now: number = Date.now()): Busy | null {
  return busy !== null && busy.until > now ? busy : null
}

/** Called when the service may be asked again, and when an answer lands. */
export function onWeatherChange(f: () => void): () => void {
  listeners.add(f)
  return () => listeners.delete(f)
}
const tell = () => {
  for (const f of [...listeners]) f()
}

export function weatherSent(): readonly { at: number; host: string; status: number | 'failed' }[] {
  return sent
}

/** For tests, and for Privacy › Clear this phone. */
export async function clearWeatherStore(): Promise<void> {
  memory.clear()
  inFlight.clear()
  busy = null
  refusals = 0
  directHeldUntil = 0
  sent.length = 0
  if (wake !== null) clearTimeout(wake)
  wake = null
  if (holdWake !== null) clearTimeout(holdWake)
  holdWake = null
  if (typeof indexedDB !== 'undefined') {
    await new Promise<void>((done) => {
      const r = indexedDB.deleteDatabase(DB)
      r.onsuccess = r.onerror = r.onblocked = () => done()
    })
  }
}

/* --------------------------------------------------------------- IndexedDB */

let opened: Promise<IDBDatabase | null> | null = null
function db(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  opened ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return opened
}

async function readKept(key: string): Promise<Kept | null> {
  const hot = memory.get(key)
  if (hot !== undefined) return hot
  const d = await db()
  if (d === null) return null
  const cold = await new Promise<Kept | null>((resolve) => {
    try {
      const r = d.transaction(STORE).objectStore(STORE).get(key)
      r.onsuccess = () => resolve((r.result as Kept | undefined) ?? null)
      r.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  if (cold !== null) memory.set(key, cold)
  return cold
}

async function writeKept(key: string, kept: Kept): Promise<void> {
  memory.set(key, kept)
  const d = await db()
  if (d === null) return
  try {
    const tx = d.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    store.put(kept, key)
    /* Old answers go: nothing here is worth keeping past KEEP_MS. */
    const all = store.openCursor()
    all.onsuccess = () => {
      const c = all.result
      if (c === null) return
      if (Date.now() - (c.value as Kept).fetchedAt > KEEP_MS) c.delete()
      c.continue()
    }
  } catch {
    /* Full or private: the memory copy still serves this session. */
  }
}

/* ------------------------------------------------------------------ asking */

function refused(daily: boolean, now: number) {
  refusals += 1
  busy = { until: now + jittered(backoffMs(refusals, daily)), why: daily ? 'daily' : 'busy' }
  if (wake !== null) clearTimeout(wake)
  wake = setTimeout(() => {
    wake = null
    epoch += 1
    tell()
  }, busy.until - now)
  tell()
}

/* Section 4b: hold the phone's direct asks for DIRECT_HOLD_MS; when it ends, the screens that got no answer ask again (weatherEpoch). */
let holdWake: ReturnType<typeof setTimeout> | null = null
function holdDirect(now: number) {
  directHeldUntil = now + DIRECT_HOLD_MS
  if (holdWake !== null) clearTimeout(holdWake)
  holdWake = setTimeout(() => {
    holdWake = null
    epoch += 1
    tell()
  }, DIRECT_HOLD_MS)
}

/** Answers fetched behind a kept one, for the "refreshing" line: how many are on their way. */
export function weatherRefreshing(): number {
  return inFlight.size
}

/**
 * Sends one request: to Open-Meteo from the phone first; through the forecast cache (when it is set) only when
 * Open-Meteo refuses this phone (429: a carrier's shared address over its limit) or cannot be reached. `via` says
 * which answered.
 *
 * Batch DRONE, Section 0.5 (16 Nov): the calls go from the phone, so Open-Meteo's per-address limits fall on each
 * phone's own address and do not stack on this app's server; the cache stays as the measured fix for the carrier
 * case (Batch M, measurements/2026-11-08-cellular.md), asked only then.
 */
async function send(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<{ r: Response; via: 'edge' | 'direct' | 'held' }> {
  const cacheOn = () => edge !== null && !edgeMissing
  /* The cache's answer, or null when it is not there or fails (the caller then keeps the direct outcome). */
  const viaEdge = async (): Promise<{ r: Response; via: 'edge' } | null> => {
    if (edge === null) return null
    try {
      /* Batch N E1: a cache that hangs costs 4 s, not the whole timeout. */
      const r = await fetchImpl(edgeUrl(url, new Date(), edge), { signal: AbortSignal.timeout(Math.min(EDGE_TIMEOUT_MS, timeoutMs)) })
      if (r.status === 404 || r.status === 405) {
        edgeMissing = true
        return null
      }
      /* Batch N: a request the cache refuses (400, 414) or fails (502-504) is no answer from it. */
      return (r.status >= 502 && r.status <= 504) || r.status === 400 || r.status === 414 ? null : { r, via: 'edge' }
    } catch {
      return null
    }
  }
  /* Section 4b: Open-Meteo refused this phone under a minute ago: the cache only, and nothing to Open-Meteo itself. */
  if (directHeld()) {
    const got = cacheOn() ? await viaEdge() : null
    return got ?? { r: new Response('', { status: 429 }), via: 'held' }
  }
  let r: Response
  try {
    r = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    const got = cacheOn() ? await viaEdge() : null
    if (got !== null) return got
    throw error
  }
  if (r.status === 429 && cacheOn()) {
    holdDirect(Date.now())
    const got = await viaEdge()
    if (got !== null) return got
  }
  return { r, via: 'direct' }
}

/**
 * The answer to `url`: kept if it is younger than `maxAgeMs`; else, when an
 * older one is kept (up to KEEP_MS), that one at once, marked stale and
 * refreshing, while a new one is fetched behind it (screens ask again when
 * it lands: weatherEpoch); else asked for and waited on; else why not.
 * Batch M: never a blank screen while a refresh is on its way.
 */
export async function weatherJson(asked: string, opts: { maxAgeMs: number; fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<WeatherAnswer> {
  const url = roundedWeatherUrl(asked)
  const key = weatherKey(url)
  const now = Date.now()
  const kept = await readKept(key)
  if (kept !== null && now - kept.fetchedAt <= Math.max(opts.maxAgeMs, MIN_REUSE_MS)) {
    noteShown(kept.fetchedAt)
    return { ok: true, payload: kept.payload, fetchedAt: kept.fetchedAt, stale: false, kept: true }
  }
  const usable = kept !== null && now - kept.fetchedAt <= KEEP_MS ? kept : null
  const fallback = (miss: WeatherMiss): WeatherAnswer => {
    if (usable === null) return miss
    noteShown(usable.fetchedAt)
    return { ok: true, payload: usable.payload, fetchedAt: usable.fetchedAt, stale: true, kept: true }
  }
  const b = weatherBusy(now)
  if (b !== null) return fallback({ ok: false, unreachable: false, reason: busyWords(b, now) })
  const waiting = inFlight.get(key)
  if (waiting !== undefined) return usable !== null ? { ok: true, payload: usable.payload, fetchedAt: usable.fetchedAt, stale: true, kept: true, refreshing: true } : waiting
  const go = (async (): Promise<WeatherAnswer> => {
    const host = new URL(url).host
    try {
      const { r, via } = await send(url, opts.fetchImpl ?? fetch, opts.timeoutMs ?? TIMEOUT_MS)
      /* Section 4b: held, and the cache had no answer either: nothing reached Open-Meteo; the kept answer with its age, or why not. */
      if (via === 'held') return fallback({ ok: false, unreachable: false, reason: 'Open-Meteo refused this phone a moment ago; asking again in a minute.' })
      sent.push({ at: Date.now(), host, status: r.status })
      /* Any answer is the network working (src/lib/connectivity.ts). */
      connectivity.report(true)
      if (r.status === 429) {
        const body = await r.text().catch(() => '')
        /*
         * Batch Map A3: a refusal Open-Meteo gives THIS PHONE (a direct ask: a
         * carrier's shared address over its limit) says nothing about the
         * cache, which asks from its own address. It is this request's
         * refusal only; the next asks go through the cache as usual. Only the
         * cache passing on a refusal (its address over the limit) holds
         * every request back.
         */
        if (via === 'direct' && edge !== null && !edgeMissing) return fallback({ ok: false, unreachable: false, reason: 'Open-Meteo refused this phone; asking through the cache next.' })
        refused(/daily/i.test(body), Date.now())
        return fallback({ ok: false, unreachable: false, reason: busyWords(busy as Busy, Date.now()) })
      }
      if (!r.ok) return fallback({ ok: false, unreachable: false, reason: `The weather service answered HTTP ${r.status}.` })
      const payload = (await r.json()) as unknown
      refusals = 0
      busy = null
      const fresh = { payload, fetchedAt: Date.now() }
      noteShown(fresh.fetchedAt)
      await writeKept(key, fresh)
      /* A refresh behind a kept answer: the screens showing the old one ask again. */
      if (usable !== null) epoch += 1
      return { ok: true, payload, fetchedAt: fresh.fetchedAt, stale: false, kept: false }
    } catch (error) {
      sent.push({ at: Date.now(), host, status: 'failed' })
      connectivity.report(false)
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
      return fallback({ ok: false, unreachable: true, reason: timedOut ? 'The weather service timed out.' : 'Could not reach the weather service.' })
    } finally {
      inFlight.delete(key)
      tell()
    }
  })()
  inFlight.set(key, go)
  tell()
  if (usable !== null) return { ok: true, payload: usable.payload, fetchedAt: usable.fetchedAt, stale: true, kept: true, refreshing: true }
  return go
}

/** "Weather service busy, retrying in 2 min", for the one line over the map. */
export function busyWords(b: Busy, now: number = Date.now()): string {
  const min = Math.max(1, Math.ceil((b.until - now) / 60_000))
  return b.why === 'daily' ? `Weather daily limit reached, retrying in ${min} min` : `Weather service busy, retrying in ${min} min`
}

/** How long a forecast answer is reused: models run every hour at best. */
export const FORECAST_MAX_AGE_MS = 60 * 60_000
/** The 16-day series, the sea and the air: they change more slowly. */
export const SLOW_MAX_AGE_MS = 3 * 60 * 60_000
