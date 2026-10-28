/*
 * WHERE THE MAP OPENS WITH NO VENUE YET: THE PHONE'S OWN REGION, FROM ITS
 * TIME ZONE. Not the whole Atlantic (27 Oct: "never the whole Atlantic"),
 * and not a position.
 *
 * The time zone is set on the phone and read from it (Intl); nothing is
 * asked of any server, and no IP address is looked up (tests/
 * noIpGeolocation.test.ts). A zone names a region a few thousand kilometres
 * across, and the view shows about that much: plainly asking where the
 * shoot is, while starting on the right side of the world. A zone not in
 * the table opens on the old wide view.
 */
import { COLD_START_VIEW } from './viewport.ts'

export interface MapStart {
  center: [number, number]
  zoom: number
}

/* [zone prefix or zone, lon, lat, zoom]. The first that matches wins, so the specific before the general. */
const REGIONS: readonly [string, number, number, number][] = [
  ['America/New_York', -78, 38.5, 4.6],
  ['America/Detroit', -84, 43, 4.6],
  ['America/Indiana', -86, 40, 4.6],
  ['America/Kentucky', -85, 37.5, 4.6],
  ['America/Toronto', -79, 45, 4.6],
  ['America/Chicago', -92, 37, 4.4],
  ['America/Denver', -107, 40, 4.4],
  ['America/Phoenix', -112, 34, 5],
  ['America/Los_Angeles', -120, 38, 4.6],
  ['America/Vancouver', -123, 50, 4.6],
  ['America/Anchorage', -150, 61.5, 4],
  ['Pacific/Honolulu', -157.5, 20.5, 6],
  ['America/Halifax', -63, 45.5, 5],
  ['America/Puerto_Rico', -66.5, 18.2, 6.5],
  ['America/Mexico_City', -100, 21, 4.6],
  ['America/Sao_Paulo', -47, -20, 4],
  ['Europe/London', -2.5, 54, 4.8],
  ['Europe/Dublin', -8, 53.3, 5.5],
  ['Europe/Lisbon', -8.5, 39.5, 5.5],
  ['Europe/Madrid', -3.7, 40, 5],
  ['Europe/Paris', 2.5, 46.5, 5],
  ['Europe/Berlin', 10.5, 51, 5],
  ['Europe/Rome', 12.5, 42, 5],
  ['Europe/Amsterdam', 5.3, 52.2, 6],
  ['Europe/', 15, 50, 3.6],
  ['Australia/Sydney', 150, -33, 5],
  ['Australia/Melbourne', 145, -37.5, 5],
  ['Australia/Perth', 116, -31.5, 5],
  ['Pacific/Auckland', 174, -41, 5],
  ['Asia/Tokyo', 138, 36, 4.8],
  ['Africa/Johannesburg', 25, -29, 4.6],
]

/** The view to open on with no venue, for an IANA time zone. */
export function regionView(timeZone: string | null | undefined): MapStart {
  if (typeof timeZone === 'string') {
    for (const [zone, lon, lat, zoom] of REGIONS) {
      if (zone.endsWith('/') ? timeZone.startsWith(zone) : timeZone === zone || timeZone.startsWith(`${zone}/`)) return { center: [lon, lat], zoom }
    }
  }
  return { center: [...COLD_START_VIEW.center], zoom: COLD_START_VIEW.zoom }
}

/** The phone's own zone, read on the phone. */
export function phoneTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null
  } catch {
    return null
  }
}
