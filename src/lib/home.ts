/*
 * THE HOME SPOT: one place you call home, set from Settings › Location, for
 * "Near you" on opening (src/lib/nearMe.ts) when the location is not shared.
 * Kept on this phone only, never sent.
 */
export interface Home {
  lat: number
  lon: number
  name: string
}
const KEY = 'scoutngo.home.v1'

export function readHome(): Home | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Home> | null
    return v !== null && typeof v.lat === 'number' && typeof v.lon === 'number' && typeof v.name === 'string' ? { lat: v.lat, lon: v.lon, name: v.name } : null
  } catch {
    return null
  }
}

export function writeHome(home: Home | null): void {
  try {
    if (home === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(home))
  } catch {
    /* Not kept. */
  }
}
