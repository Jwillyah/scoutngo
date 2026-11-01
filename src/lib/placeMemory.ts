/*
 * THE LAST KNOWN COAST-OR-INLAND ANSWER, PER VENUE, KEPT ON THIS PHONE.
 *
 * WHY. Coast or inland is read from the map's vector tiles (src/lib/coast.ts).
 * With no signal and no tiles the test cannot answer, and the Batch C build
 * read "cannot answer" as "no sea": at the Virginia Beach pier, offline, the
 * Water menu, the tide chip and the tide curve all went (gate, 30 Oct). A
 * venue does not move, so the last answer the tiles gave is the answer until
 * they can give another. Saved whenever the test answers, so opening a venue
 * once online, or saving it for offline, is enough.
 *
 * Keyed by the venue to 4 decimals (about 10 m), like the test itself, and in
 * localStorage with the rest of what is yours; never sent anywhere.
 */
const KEY = 'scoutngo.seaReach.v1'
const MAX = 200

/** Metres to the sea within reach, or null for none: what the tiles last said here. */
export type Reach = number | null

type Stored = Record<string, { m: Reach; at: string }>

export const placeKeyOf = (lat: number, lon: number): string => `${lat.toFixed(4)},${lon.toFixed(4)}`

function read(): Stored {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown
    return v !== null && typeof v === 'object' ? (v as Stored) : {}
  } catch {
    return {}
  }
}

/** The remembered answer for this venue, or undefined when it was never known here. */
export function rememberedReach(key: string): Reach | undefined {
  const hit = read()[key]
  if (hit === undefined) return undefined
  return typeof hit.m === 'number' || hit.m === null ? hit.m : undefined
}

export function rememberReach(key: string, m: Reach, now = new Date()): void {
  const all = read()
  all[key] = { m, at: now.toISOString() }
  /* Oldest first out, so the list cannot grow without end. */
  const keys = Object.keys(all).sort((a, b) => all[a].at.localeCompare(all[b].at))
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX))) delete all[k]
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* Not kept; this session still has it. */
  }
}

/** The answer to use: the tiles' when they gave one (and remember it), else the last known, else not known. */
export function resolveReach(key: string, fresh: Reach | 'unavailable'): Reach | undefined {
  if (fresh === 'unavailable') return rememberedReach(key)
  rememberReach(key, fresh)
  return fresh
}
