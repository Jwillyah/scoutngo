/*
 * THE PLANETARY K INDEX (Batch Flow, Section 5; board D_Drone, the GPS tile).
 * NOAA SWPC's file, the same for everyone: nothing about the user or the spot
 * is sent. A geomagnetic storm (Kp 5 and up) degrades GPS; the tile says the
 * number and the NOAA scale's word, never "safe".
 */
export const KP_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json'

/** The latest Kp in the file (rows after the header: time, Kp, …), or null. */
export function latestKp(payload: unknown): { kp: number; at: string } | null {
  if (!Array.isArray(payload)) return null
  for (let i = payload.length - 1; i >= 1; i -= 1) {
    const row = payload[i] as unknown[]
    const kp = Number(Array.isArray(row) ? row[1] : NaN)
    if (Number.isFinite(kp)) return { kp, at: String(row[0]) }
  }
  return null
}

/** NOAA's own words for the K index: quiet under 4, active at 4, a storm from 5 (G1 to G5). */
export function kpWord(kp: number): string {
  if (kp >= 5) return `storm G${Math.min(5, Math.floor(kp) - 4)}`
  if (kp >= 4) return 'active'
  return 'quiet'
}

let kept: { t: number; v: { kp: number; at: string } | null } | null = null
/** Asked at most once in 3 hours (the index is three-hourly). */
export async function fetchKp(): Promise<{ kp: number; at: string } | null> {
  if (kept !== null && Date.now() - kept.t < 3 * 3_600_000) return kept.v
  try {
    const r = await fetch(KP_URL, { signal: AbortSignal.timeout(8000) })
    const v = r.ok ? latestKp(await r.json()) : null
    kept = { t: Date.now(), v }
    return v
  } catch {
    return null
  }
}
