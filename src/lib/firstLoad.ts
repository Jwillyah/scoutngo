/*
 * AFTER THE FIRST LOAD (Batch SIMPLE-1, Section 4b). On 18 Nov at 1:07 PM the
 * phone's log had api.open-meteo.com 429 among ~15 calls in one minute. An
 * open of the home asked 13 questions at once
 * (measurements/2026-11-18-openmeteo-calls.md), all of them sent before the
 * first refusal could land, so the store's hold after a 429 (weatherStore.ts
 * DIRECT_HOLD_MS) never got the chance to spare any of them.
 *
 * What the first screen does not need waits here: until the first load's
 * questions have all been answered (nothing in flight in the weather store)
 * for SETTLE_QUIET_MS, and never before SETTLE_MIN_MS from the first ask to
 * wait. A network that never goes quiet still gets there at SETTLE_MAX_MS.
 * Once settled, settled for the session: a screen opened later asks at once.
 *
 * Who waits: the home's Best Sky grid (Section 4b) and the daily check of the
 * other wave models (Section 5, src/lib/useSurfNow.ts).
 */
import { useEffect, useState } from 'react'
import { onWeatherChange, weatherRefreshing } from './weatherStore.ts'

export const SETTLE_MIN_MS = 1500
export const SETTLE_QUIET_MS = 1500
export const SETTLE_MAX_MS = 20_000

let settled = false
let watching = false
const waiting = new Set<() => void>()
let quiet: ReturnType<typeof setTimeout> | null = null
let cap: ReturnType<typeof setTimeout> | null = null
let stopListening: (() => void) | null = null

export const firstLoadSettled = (): boolean => settled

function settle(): void {
  if (settled) return
  settled = true
  if (quiet !== null) clearTimeout(quiet)
  if (cap !== null) clearTimeout(cap)
  quiet = cap = null
  stopListening?.()
  stopListening = null
  for (const f of [...waiting]) f()
  waiting.clear()
}

function watch(): void {
  if (watching || settled) return
  watching = true
  const from = Date.now()
  const check = () => {
    if (settled) return
    if (quiet !== null) clearTimeout(quiet)
    quiet = null
    if (weatherRefreshing() > 0) return
    quiet = setTimeout(settle, Math.max(SETTLE_QUIET_MS, from + SETTLE_MIN_MS - Date.now()))
  }
  stopListening = onWeatherChange(check)
  cap = setTimeout(settle, SETTLE_MAX_MS)
  check()
}

/** Runs `f` once the first load has settled (at once when it has). Returns a cancel. */
export function whenFirstLoadSettled(f: () => void): () => void {
  if (settled) {
    f()
    return () => {}
  }
  waiting.add(f)
  watch()
  return () => waiting.delete(f)
}

/** True once the first load has settled; the screen re-renders then. */
export function useFirstLoadSettled(): boolean {
  const [now, setNow] = useState(settled)
  useEffect(() => (now ? undefined : whenFirstLoadSettled(() => setNow(true))), [now])
  return now
}

/** For tests: back to a fresh session. */
export function resetFirstLoad(): void {
  if (quiet !== null) clearTimeout(quiet)
  if (cap !== null) clearTimeout(cap)
  quiet = cap = null
  stopListening?.()
  stopListening = null
  settled = false
  watching = false
  waiting.clear()
}
