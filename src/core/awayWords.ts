/*
 * A BANNER ABOUT A PLACE OFF SCREEN SAYS HOW FAR (Batch LIVE, Section 1.5;
 * 14 Nov the map was over Wrightsville Beach and the bar said "Sky color …
 * Sandbridge Beach", about 190 mi away, as if it were on screen). When
 * the spot is off screen (outside the view's bounds) and AWAY_KM or more
 * from the view's middle, what speaks of the spot names it and the
 * distance: "Sandbridge · 190 mi". On screen at any zoom, just its name.
 */
import { distanceMeters, type LatLon } from './geo.ts'

export const AWAY_KM = 40

export interface ViewBounds {
  south: number
  west: number
  north: number
  east: number
}

const inside = (p: LatLon, b: ViewBounds): boolean => {
  if (p.lat < b.south || p.lat > b.north) return false
  if (b.east - b.west >= 360) return true
  const lon = ((((p.lon - b.west) % 360) + 360) % 360) + b.west
  return lon <= b.east
}

/** "190 mi" / "306 km" when the spot is off screen and AWAY_KM or more from the view's middle; else null. */
export function awayDistance(spot: LatLon | null, view: ViewBounds | null, miles: boolean): string | null {
  if (spot === null || view === null || inside(spot, view)) return null
  const km = distanceMeters(spot, { lat: (view.south + view.north) / 2, lon: (view.west + view.east) / 2 }) / 1000
  if (km < AWAY_KM) return null
  return miles ? `${Math.round(km / 1.609344)} mi` : `${Math.round(km)} km`
}

/** "Sandbridge Beach" → "Sandbridge"; the place and how far, when away. */
export function awayLabel(name: string, spot: LatLon | null, view: ViewBounds | null, miles: boolean): string {
  const far = awayDistance(spot, view, miles)
  return far === null ? name : `${name.replace(/\s+(Beach|Fishing Pier|Pier|State Park|Park)$/i, '')} · ${far}`
}

/*
 * BANNERS ONLY ABOUT THE PLACE ON SCREEN (Batch 3D, Section 3.4; 17 Nov
 * 12:27 PM the map was over North Carolina and the card said "Sky color at
 * sunrise · Sandbridge", about 250 mi away). A banner over the map speaks of
 * a place only when that place is within BANNER_MI of the map's middle and
 * what it names has not ended. The distance is worked out here, not guessed.
 */
export const BANNER_MI = 25
const BANNER_M = BANNER_MI * 1609.344

/** The middle of the map's view. */
export const viewCentre = (v: ViewBounds): LatLon => ({ lat: (v.south + v.north) / 2, lon: (v.west + v.east) / 2 })

/** Whether a banner about `spot`, over at `until`, may show over a map centred on `centre` at `now`. An unknown centre shows nothing. */
export function aboutHere(spot: LatLon, centre: LatLon | null, until: Date, now: number): boolean {
  if (centre === null || !(until.getTime() > now)) return false
  return distanceMeters(spot, centre) <= BANNER_M
}
