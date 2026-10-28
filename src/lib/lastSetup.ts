/*
 * THE LAST SETUP, KEPT ON THIS PHONE.
 *
 * 27 Oct, from the pier: "The app opens on the last venue … Returning users:
 * steps remember last answers; a 'Same as last time' button on step 1 jumps
 * straight to Plan." Before this the app remembered the kit and the spots
 * but not where the last shoot was, so every launch began on an empty map.
 *
 * What is kept: the pin, its name WITH the coordinate it was resolved for
 * (src/core/venueName.ts, so a name can never outlive its place), the kind
 * of shoot, ground or drone, and the reach. Not the date: a returning
 * shooter is planning today, or picks the day in one tap.
 *
 * localStorage only, like the kit and the spots. The coordinate never leaves
 * the device (CLAUDE.md, Privacy).
 */
import type { LatLon } from '../core/geo.ts'
import { PLATFORM_FILTERS, type PlatformFilter } from '../core/platformFilter.ts'
import { clampRadius } from '../core/radius.ts'
import type { ShootKind } from '../core/shootWindow.ts'
import type { VenueName } from '../core/venueName.ts'

export const LAST_SETUP_KEY = 'scoutngo.lastSetup.v1'

export interface LastSetup {
  at: LatLon
  /** The name and the placeKey it belongs to, or null if none was resolved. */
  name: VenueName | null
  shootKind: ShootKind | null
  platform: PlatformFilter
  reachMeters: number
}

const KINDS: readonly ShootKind[] = ['sunrise', 'sunset', 'daytime']

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Whatever was stored, as a LastSetup, or null when it is not one. Never throws. */
export function reviveLastSetup(raw: unknown): LastSetup | null {
  if (!isObj(raw) || !isObj(raw.at)) return null
  const lat = raw.at.lat
  const lon = raw.at.lon
  if (typeof lat !== 'number' || typeof lon !== 'number') return null
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  const name =
    isObj(raw.name) && typeof raw.name.key === 'string' && typeof raw.name.name === 'string' && raw.name.name.trim() !== ''
      ? { key: raw.name.key, name: raw.name.name }
      : null
  const shootKind = KINDS.includes(raw.shootKind as ShootKind) ? (raw.shootKind as ShootKind) : null
  const platform = PLATFORM_FILTERS.includes(raw.platform as PlatformFilter) ? (raw.platform as PlatformFilter) : 'both'
  const reachMeters = typeof raw.reachMeters === 'number' ? clampRadius(raw.reachMeters) : clampRadius(Number.NaN)
  return { at: { lat, lon }, name, shootKind, platform, reachMeters }
}

/** Read once, at launch. Null with nothing kept, or storage blocked. */
export function readLastSetup(): LastSetup | null {
  try {
    const raw = localStorage.getItem(LAST_SETUP_KEY)
    return raw === null ? null : reviveLastSetup(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function writeLastSetup(next: LastSetup): void {
  try {
    localStorage.setItem(LAST_SETUP_KEY, JSON.stringify(next))
  } catch {
    // Private browsing or a full quota: this session still works.
  }
}
