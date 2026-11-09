/*
 * WHAT YOU DO OUTSIDE (Batch M, Sections 2 and 3): surf, shoot photo or
 * video, fly a drone, fish or boat, or just the weather. Kept on this phone
 * only (localStorage), never sent. It orders the home and shows or hides
 * cards and tools; it never removes data.
 *
 * Not yet asked (null): everything shows, in the default order, as before
 * the picker existed.
 */
import { useCallback, useSyncExternalStore } from 'react'
import { ACTIVITIES, type Activity } from '../core/homeDay.ts'

export const ACTIVITIES_KEY = 'scoutngo.activities.v1'

const listeners = new Set<() => void>()
let cache: { raw: string | null; value: Activity[] | null } = { raw: undefined as unknown as null, value: null }

/** What was stored, as a list of known activities in the order picked; null when never asked or unreadable. */
export function reviveActivities(raw: string | null): Activity[] | null {
  if (raw === null) return null
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return null
    const list = v.filter((x): x is Activity => ACTIVITIES.includes(x as Activity))
    return [...new Set(list)]
  } catch {
    return null
  }
}

export function readActivities(): Activity[] | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(ACTIVITIES_KEY)
  } catch {
    raw = null
  }
  if (raw !== cache.raw) cache = { raw, value: reviveActivities(raw) }
  return cache.value
}

export function writeActivities(list: readonly Activity[]): void {
  try {
    localStorage.setItem(ACTIVITIES_KEY, JSON.stringify(list))
  } catch {
    /* Private browsing: this session still orders by it. */
    cache = { raw: JSON.stringify(list), value: [...list] }
  }
  for (const f of [...listeners]) f()
}

export function useActivities(): [Activity[] | null, (next: readonly Activity[]) => void] {
  const value = useSyncExternalStore(
    (f) => {
      listeners.add(f)
      return () => listeners.delete(f)
    },
    readActivities,
    () => null,
  )
  return [value, useCallback((next: readonly Activity[]) => writeActivities(next), [])]
}

/** The order the home uses: what was picked, else everything; a drone in the kit brings the drone in. */
export function homeOrder(picked: readonly Activity[] | null, droneInKit: boolean): Activity[] {
  const base: Activity[] = picked === null || picked.length === 0 ? ['surf', 'shoot', 'fish', 'weather'] : [...picked]
  return droneInKit && !base.includes('drone') ? [...base, 'drone'] : base
}

/** Photo tools (Viewfinder, Cones, Shadows, Sky color detail, Light map) in the home and the menu: when Shoot is picked, or nothing has been picked yet. */
export function showsPhotoTools(picked: readonly Activity[] | null): boolean {
  return picked === null || picked.length === 0 || picked.includes('shoot')
}

/** The drone card and drone tools: Fly a drone picked, or a drone in My kit. */
export function showsDrone(picked: readonly Activity[] | null, droneInKit: boolean): boolean {
  return droneInKit || (picked !== null && picked.includes('drone'))
}

/** The home's one primary button: Viewfinder for Shoot, Preflight for a drone, Radar for the rest; the first picked decides. */
export function primaryFor(order: readonly Activity[]): 'viewfinder' | 'preflight' | 'radar' {
  const first = order[0]
  return first === 'shoot' ? 'viewfinder' : first === 'drone' ? 'preflight' : 'radar'
}

export const ACTIVITY_WORDS: Record<Activity, string> = {
  surf: 'Surf',
  shoot: 'Shoot photo or video',
  drone: 'Fly a drone',
  fish: 'Fish or boat',
  weather: 'Just weather',
}
