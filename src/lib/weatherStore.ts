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
 *    and reused until it is older than the caller's `maxAgeMs`. Moving the
 *    time bar asks for the same day again, which is the same request.
 *  - When the service says 429 ("too many"), nothing is sent to it for a
 *    while that doubles each time (2, 4, 8 ... 30 min; an hour for its daily
 *    limit), and callers get the last answer at any age, marked stale, so a
 *    chip can say "6 kt · 9 h ago" instead of "no data". `weatherBusy()`
 *    says why, for the one status line.
 *
 * NOTHING NEW LEAVES THE PHONE: the same requests as before, fewer of them.
 * The kept answers are forecasts for a place, on this phone only, cleared
 * by Privacy › Clear this phone.
 */

export interface WeatherHit {
  ok: true
  payload: unknown
  /** When the answer arrived, ms since 1970. */
  fetchedAt: number
  /** Older than the caller wanted: the last good answer, because a new one could not be had. */
  stale: boolean
  /** Served from what was kept, with no request this time. Offline, its age is said (ux-rules 13). */
  kept: boolean
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

export const FIRST_BACKOFF_MS = 2 * 60_000
export const MAX_BACKOFF_MS = 30 * 60_000
export const DAILY_BACKOFF_MS = 60 * 60_000
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
const listeners = new Set<() => void>()
let wake: ReturnType<typeof setTimeout> | null = null
/** Counts the ends of back-offs: screens depend on it to ask again then, and on nothing else. */
let epoch = 0
export const weatherEpoch = (): number => epoch
/** Every request actually sent, for Settings › Debug and for the tests' budget. */
const sent: { at: number; host: string; status: number | 'failed' }[] = []

/** The request with its parameters in a fixed order, so the same question is the same key. */
export function weatherKey(url: string): string {
  const u = new URL(url)
  const params = [...u.searchParams].sort(([a], [b]) => a.localeCompare(b))
  return `${u.origin}${u.pathname}?${new URLSearchParams(params).toString()}`
}

/** When to ask again after `n` refusals in a row (n >= 1). */
export function backoffMs(n: number, daily: boolean): number {
  if (daily) return DAILY_BACKOFF_MS
  return Math.min(MAX_BACKOFF_MS, FIRST_BACKOFF_MS * 2 ** Math.max(0, n - 1))
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
  sent.length = 0
  if (wake !== null) clearTimeout(wake)
  wake = null
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
  busy = { until: now + backoffMs(refusals, daily), why: daily ? 'daily' : 'busy' }
  if (wake !== null) clearTimeout(wake)
  wake = setTimeout(() => {
    wake = null
    epoch += 1
    tell()
  }, busy.until - now)
  tell()
}

/**
 * The answer to `url`: kept if it is younger than `maxAgeMs`, else asked
 * for, else the kept one at any age (stale), else why not.
 */
export async function weatherJson(url: string, opts: { maxAgeMs: number; fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<WeatherAnswer> {
  const key = weatherKey(url)
  const now = Date.now()
  const kept = await readKept(key)
  if (kept !== null && now - kept.fetchedAt <= opts.maxAgeMs) return { ok: true, payload: kept.payload, fetchedAt: kept.fetchedAt, stale: false, kept: true }
  const fallback = (miss: WeatherMiss): WeatherAnswer =>
    kept !== null && now - kept.fetchedAt <= KEEP_MS ? { ok: true, payload: kept.payload, fetchedAt: kept.fetchedAt, stale: true, kept: true } : miss
  const b = weatherBusy(now)
  if (b !== null) return fallback({ ok: false, unreachable: false, reason: busyWords(b, now) })
  const waiting = inFlight.get(key)
  if (waiting !== undefined) return waiting
  const go = (async (): Promise<WeatherAnswer> => {
    const host = new URL(url).host
    try {
      const r = await (opts.fetchImpl ?? fetch)(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS) })
      sent.push({ at: Date.now(), host, status: r.status })
      if (r.status === 429) {
        const body = await r.text().catch(() => '')
        refused(/daily/i.test(body), Date.now())
        return fallback({ ok: false, unreachable: false, reason: busyWords(busy as Busy, Date.now()) })
      }
      if (!r.ok) return fallback({ ok: false, unreachable: false, reason: `The weather service answered HTTP ${r.status}.` })
      const payload = (await r.json()) as unknown
      refusals = 0
      busy = null
      const fresh = { payload, fetchedAt: Date.now() }
      await writeKept(key, fresh)
      tell()
      return { ok: true, payload, fetchedAt: fresh.fetchedAt, stale: false, kept: false }
    } catch (error) {
      sent.push({ at: Date.now(), host, status: 'failed' })
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
      return fallback({ ok: false, unreachable: true, reason: timedOut ? 'The weather service timed out.' : 'Could not reach the weather service.' })
    } finally {
      inFlight.delete(key)
    }
  })()
  inFlight.set(key, go)
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
