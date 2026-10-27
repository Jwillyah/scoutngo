/*
 * EVERY OVERPASS REQUEST THE APP MAKES GOES THROUGH HERE.
 *
 * ONE AT A TIME. Overpass is a free, shared, volunteer-run service and its
 * own guidance is to keep a client's load modest. At Virginia Beach on 26 Oct
 * the app asked for buildings, trees and the coastline as three requests,
 * each with its own retries, while the 2D map asked for its own buildings:
 * a busy server was asked again and again and answered none of them. So the app never has more than one request in flight: the rest wait
 * their turn, in the order they were asked.
 *
 * THREE SERVERS, IN ORDER. overpass-api.de first; when it fails,
 * overpass.kumi.systems, then overpass.private.coffee. All three serve the
 * same OpenStreetMap data with the same query language, keyless. They are
 * the only Overpass hosts the 3D network audit allows
 * (scripts/audit-3d-network.mjs).
 *
 * 429 AND 504 MEAN "BUSY, ASK AGAIN": the server is up and shedding load. The
 * same server is asked again after a back-off (its Retry-After when it sends
 * one, capped), then the next server. Anything else (refused, unreachable,
 * a different error) goes to the next server at once.
 *
 * Every call has a budget for all of it, waiting in the queue included, so
 * a caller can promise the screen an answer by a time.
 */

export const OVERPASS_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
] as const

/** First back-off after a 429 or 504; doubled for the next one on the same server. */
export const BACKOFF_MS = 2000
/** A server's Retry-After is honoured up to this; longer than this and the next server is tried instead. */
export const MAX_BACKOFF_MS = 10_000
/** How many times one server is asked again after saying it is busy. */
export const BUSY_RETRIES = 1
/** After cancelling a request that never answered, before asking the next server. */
export const SETTLE_MS = 250
/** No single attempt is cut off sooner than this: Overpass took 36 s for one coastline on 26 Oct. */
export const MIN_ATTEMPT_MS = 15_000

export type OverpassAnswer =
  | { ok: true; payload: unknown; server: string }
  | { ok: false; reason: string; timedOut: boolean }

export interface OverpassAsk {
  /** All of it, from the moment of asking: the wait for a turn, every server, every back-off. */
  budgetMs: number
  signal?: AbortSignal
  /** For tests. */
  fetcher?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/* ------------------------------------------------------------ the queue */

let tail: Promise<unknown> = Promise.resolve()
let inFlight = 0
let peak = 0
/** How many requests are on the wire right now, and the most there have ever been. For the tests and the audit. */
export const overpassInFlight = (): { now: number; peak: number } => ({ now: inFlight, peak })
/*
 * With ?probe=1 the count is reachable as window.__probe.overpass, for
 * scripts/measure-3d-overpass-faults.mjs. Absent otherwise, including in
 * production, where the query string is not set.
 */
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('probe') === '1') {
  const w = window as unknown as { __probe?: Record<string, unknown> }
  w.__probe = { ...(w.__probe ?? {}), overpass: overpassInFlight }
}
export function resetOverpassClient(): void {
  tail = Promise.resolve()
  inFlight = 0
  peak = 0
}

/** Runs `job` once every earlier job has finished. */
function inTurn<T>(job: () => Promise<T>): Promise<T> {
  const run = tail.then(job, job)
  tail = run.catch(() => undefined)
  return run
}

/* ------------------------------------------------------------- the ask */

/**
 * One Overpass query, answered by the first server that can, never more than
 * one request on the wire. Never throws.
 */
export function askOverpass(query: string, ask: OverpassAsk): Promise<OverpassAnswer> {
  const now = ask.now ?? Date.now
  const deadline = now() + ask.budgetMs
  return inTurn(() => attempt(query, ask, deadline))
}

async function attempt(query: string, ask: OverpassAsk, deadline: number): Promise<OverpassAnswer> {
  const fetcher = ask.fetcher ?? fetch
  const sleep = ask.sleep ?? realSleep
  const now = ask.now ?? Date.now
  const stopped = () => ask.signal?.aborted === true
  let last = 'Overpass could not be reached.'
  let timedOut = false

  for (let s = 0; s < OVERPASS_SERVERS.length; s += 1) {
    const server = OVERPASS_SERVERS[s]
    let backoff = BACKOFF_MS
    for (let tries = 0; tries <= BUSY_RETRIES; tries += 1) {
      if (stopped()) return { ok: false, reason: 'Stopped.', timedOut: false }
      const left = deadline - now()
      if (left <= 0) return { ok: false, reason: last, timedOut: true }
      /* Share what is left between the servers not yet tried, but never less than MIN_ATTEMPT_MS. */
      const serversLeft = OVERPASS_SERVERS.length - s
      const slot = Math.min(left, Math.max(MIN_ATTEMPT_MS, left / serversLeft))

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), slot)
      const relay = () => controller.abort()
      ask.signal?.addEventListener('abort', relay)
      inFlight += 1
      peak = Math.max(peak, inFlight)
      let status = 0
      let retryAfter: number | null = null
      try {
        const response = await fetcher(server, {
          method: 'POST',
          headers: { 'content-type': 'text/plain;charset=UTF-8' },
          body: query,
          signal: controller.signal,
        })
        status = response.status
        if (response.ok) {
          const payload: unknown = await response.json()
          /*
           * A 200 CAN BE A FAILURE. When a query runs out of time or memory on
           * the server, Overpass still answers 200, with what it had so far
           * and a remark saying so. Taken as an answer, half a place would be
           * saved as the whole of it: a coastline missing, buildings missing.
           */
          const remark = (payload as { remark?: unknown } | null)?.remark
          if (typeof remark !== 'string' || !/runtime error/i.test(remark)) return { ok: true, payload, server }
          last = /timed out/i.test(remark) ? 'Overpass ran out of time on its server.' : 'Overpass reported an error on its server.'
        } else {
          retryAfter = parseRetryAfter(response.headers.get('retry-after'))
          last = `Overpass returned HTTP ${status}.`
          /* Read the refusal to its end: an unread body keeps the request open, and the next one would overlap it. */
          await response.arrayBuffer().catch(() => undefined)
        }
      } catch {
        if (stopped()) return { ok: false, reason: 'Stopped.', timedOut: false }
        if (controller.signal.aborted) {
          timedOut = true
          last = 'Overpass did not answer in time.'
          /* The browser reports a cancelled request closed a moment after the call returns: let it, before the next goes. */
          await sleep(SETTLE_MS)
        } else {
          /* A refusal with no CORS headers arrives as a network error: not a timeout. */
          last = 'Overpass could not be reached.'
        }
      } finally {
        inFlight -= 1
        clearTimeout(timer)
        ask.signal?.removeEventListener('abort', relay)
      }

      const busy = status === 429 || status === 504
      if (!busy || tries === BUSY_RETRIES) break
      const wait = retryAfter ?? backoff
      if (wait > MAX_BACKOFF_MS || now() + wait >= deadline) break
      await sleep(wait)
      backoff *= 2
    }
  }
  return { ok: false, reason: last, timedOut }
}

/** Retry-After in seconds (the only form Overpass sends), as milliseconds, or null. */
export function parseRetryAfter(value: string | null): number | null {
  if (value === null) return null
  const seconds = Number(value.trim())
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null
}
