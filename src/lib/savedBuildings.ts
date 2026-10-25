/*
 * THE LAST FEW BUILDING AREAS, KEPT ON THE PHONE, so shadows and line-of-sight
 * still work with no signal at a place that was loaded once.
 *
 * localStorage, like the saved forecasts (savedForecast.ts), and small: a few
 * hundred footprints is tens of kilobytes, and only SAVED_BUILDINGS_LIMIT areas
 * are kept. Read back only when Overpass cannot be reached, and always with
 * the time it was fetched, so an old map is never shown as a fresh one.
 */
import type { Building } from './buildings.ts'

export const SAVED_BUILDINGS_KEY = 'scoutngo.buildings.v1'
export const SAVED_BUILDINGS_LIMIT = 4

interface Entry {
  key: string
  fetchedAt: string
  buildings: Building[]
}

function readAll(): Entry[] {
  try {
    const raw = localStorage.getItem(SAVED_BUILDINGS_KEY)
    const list = raw === null ? [] : (JSON.parse(raw) as unknown)
    return Array.isArray(list)
      ? list.filter((e): e is Entry => typeof e?.key === 'string' && typeof e?.fetchedAt === 'string' && Array.isArray(e?.buildings))
      : []
  } catch {
    return []
  }
}

export function saveBuildings(key: string, buildings: Building[], now: Date = new Date()): void {
  const next = [{ key, fetchedAt: now.toISOString(), buildings }, ...readAll().filter((e) => e.key !== key)]
  /* Drop the oldest until it fits: a full store must not stop the app saving the newest. */
  for (let keep = Math.min(next.length, SAVED_BUILDINGS_LIMIT); keep > 0; keep -= 1) {
    try {
      localStorage.setItem(SAVED_BUILDINGS_KEY, JSON.stringify(next.slice(0, keep)))
      return
    } catch {
      continue
    }
  }
}

export function readSavedBuildings(key: string): { buildings: Building[]; fetchedAt: string } | null {
  const hit = readAll().find((e) => e.key === key)
  return hit === undefined ? null : { buildings: hit.buildings, fetchedAt: hit.fetchedAt }
}
