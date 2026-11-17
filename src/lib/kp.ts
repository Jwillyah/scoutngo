/*
 * THE PLANETARY K INDEX (Batch Flow, Section 5; board D_Drone, the GPS tile).
 * NOAA SWPC's file, the same for everyone: nothing about the user or the spot
 * is sent. A geomagnetic storm (Kp 5 and up) degrades GPS; the row says the
 * number and the NOAA scale's word, never "safe".
 *
 * WHY THE PHONE SAID "Kp not received · NOAA did not answer" (Batch FIX,
 * Section 6.7). Not CORS: on 17 Nov the endpoint answered 200,
 * application/json, `access-control-allow-origin: *`. Two things in this file:
 *
 *   the shape   the reader took only one table shape (a header row, then
 *               [time_tag, Kp, …] rows); a list of keyed records
 *               ({"time_tag", "Kp", …}) read as "no value". Only the headers
 *               were fetched on 17 Nov, so which shape the phone got is not
 *               proven here; both shapes are read now (tests/kpRead.test.ts).
 *   the cache   one bad answer was kept as "no value" for three hours, so a
 *               single dropped request on a weak signal blanked the row until
 *               the next three-hourly index. Only a value is kept now; a miss
 *               is asked again after KP_RETRY_MS.
 *
 * The last value received is kept on this phone with NOAA's time tag, so
 * when NOAA does not answer the row shows that value and its age, and when
 * there has never been one the row is not drawn.
 */
export const KP_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json'
const KEY = 'scoutngo.kp.v1'
/** The index is three-hourly: a value is asked for again after this. */
export const KP_KEEP_MS = 3 * 3_600_000
/** A miss is asked again after this. */
export const KP_RETRY_MS = 10 * 60_000

export interface KpReading {
  kp: number
  /** NOAA's time tag, as NOAA wrote it (UTC). */
  at: string
}

/** One row of either shape: [time_tag, Kp, …] or { time_tag, Kp | kp | kp_index | estimated_kp }. */
function rowOf(row: unknown): KpReading | null {
  if (Array.isArray(row)) {
    const kp = Number(row[1])
    return typeof row[0] === 'string' && row[1] !== null && row[1] !== '' && Number.isFinite(kp) ? { kp, at: row[0] } : null
  }
  if (row !== null && typeof row === 'object') {
    const r = row as Record<string, unknown>
    const raw = r.Kp ?? r.kp ?? r.kp_index ?? r.estimated_kp
    const kp = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
    return typeof r.time_tag === 'string' && Number.isFinite(kp) ? { kp, at: r.time_tag } : null
  }
  return null
}

/** The latest Kp in the file, in either of NOAA's shapes, or null. */
export function latestKp(payload: unknown): KpReading | null {
  if (!Array.isArray(payload)) return null
  for (let i = payload.length - 1; i >= 0; i -= 1) {
    const v = rowOf(payload[i])
    if (v !== null) return v
  }
  return null
}

/** NOAA's own words for the K index: quiet under 4, active at 4, a storm from 5 (G1 to G5). */
export function kpWord(kp: number): string {
  if (kp >= 5) return `storm G${Math.min(5, Math.floor(kp) - 4)}`
  if (kp >= 4) return 'active'
  return 'quiet'
}

/** The last value this phone received, or null when it never has. */
export function readKeptKp(): KpReading | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<KpReading> | null
    return v !== null && typeof v.kp === 'number' && Number.isFinite(v.kp) && typeof v.at === 'string' ? { kp: v.kp, at: v.at } : null
  } catch {
    return null
  }
}

function keepKp(v: KpReading): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    /* kept for this visit only */
  }
}

let asked: { t: number; v: KpReading | null } | null = null

/**
 * NOAA's latest value (`kept: false`), or the last one this phone has when
 * NOAA does not answer (`kept: true`), or null when there has never been one.
 */
export async function fetchKp(fetcher: typeof fetch = fetch): Promise<(KpReading & { kept: boolean }) | null> {
  const fresh = (v: KpReading) => ({ ...v, kept: false })
  if (asked !== null && asked.v !== null && Date.now() - asked.t < KP_KEEP_MS) return fresh(asked.v)
  if (asked !== null && asked.v === null && Date.now() - asked.t < KP_RETRY_MS) {
    const k = readKeptKp()
    return k === null ? null : { ...k, kept: true }
  }
  let v: KpReading | null = null
  try {
    const r = await fetcher(KP_URL, { signal: AbortSignal.timeout(8000) })
    v = r.ok ? latestKp(await r.json()) : null
  } catch {
    v = null
  }
  asked = { t: Date.now(), v }
  if (v !== null) {
    keepKp(v)
    return fresh(v)
  }
  const k = readKeptKp()
  return k === null ? null : { ...k, kept: true }
}

/** For tests: forget this visit's answer. */
export function resetKpForTests(): void {
  asked = null
}
