/*
 * WHETHER 107.41 AUTHORIZATION ATTACHES AT THIS PIN.
 *
 * WHY THIS EXISTS ALONGSIDE THE FACILITY MAP. The facility map answers how
 * long the paperwork takes, and it answers nothing at all outside its own
 * coverage. Sandbridge, which is where the shoot that started all this
 * happened, has NO facility-map cell: the grid returns null there. On the
 * facility map alone the only honest thing to say about that venue is "no data
 * here", which reads like a problem and is not one. The airspace extract is
 * what turns that into the answer the day actually needs.
 *
 * WHAT IT ANSWERS, AND WHAT IT REFUSES TO. 107.41 requires ATC authorization
 * to operate in controlled airspace AT THE SURFACE: Class B, C, D, and the
 * surface-area Class E. This finds the polygons containing a pin and reports
 * them. It does NOT report an empty result as permission. An empty result is
 * stated as what it is, a pin with no surface-area class in a dated extract,
 * for the same reason this app never says an area is clear of hazards.
 *
 * THE FILTER THAT WOULD HAVE BEEN WRONG. The obvious way to select
 * surface-reaching airspace is LOWER_CODE = 'SFC'. LOWER_CODE is the DATUM,
 * not a claim that the airspace touches the ground: the service carries rows
 * reading LOWER_VAL 700 with LOWER_CODE SFC, and 1200 with SFC, which are
 * Class E5 transition areas beginning 700 and 1200 feet up and needing no
 * authorization for a Part 107 flight. Selecting on the datum alone pulls in
 * every transition area in the country and reports authorization required on
 * essentially every rural shoot. The test is both halves: LOWER_VAL = 0 AND
 * LOWER_CODE = 'SFC', applied in the bake script.
 */

import type { LatLon } from './geo.ts'

/** One surface-area polygon, decoded far enough to test and to name. */
export interface AirspaceShape {
  /** B, C, D or E. */
  cls: string
  /** CLASS_E2 and friends, where the service names a sub-type. */
  local: string
  name: string
  /** Top of the airspace, in the unit the chart states. */
  upper: number | null
  upperUom: string
  /** Rings as flat [lon, lat, lon, lat, ...] in degrees. */
  rings: number[][]
  /** minLon, minLat, maxLon, maxLat in degrees. */
  bbox: [number, number, number, number]
}

/** The encoded form, as the bake script writes it. */
export interface EncodedAirspace {
  cls: string
  local: string
  name: string
  upper: number | null
  upperUom: string
  bbox: number[]
  rings: string[]
}

/**
 * Decode one shape. Coordinates are stored as delta-encoded base36 integers at
 * a fixed scale, which is about a metre: finer than the generalisation already
 * applied to the rings, so the quantisation costs nothing on top of it.
 */
export function decodeShape(encoded: EncodedAirspace, precision: number): AirspaceShape {
  const rings = encoded.rings.map((ring) => {
    const out: number[] = []
    let x = 0
    let y = 0
    for (const pair of ring.split(',')) {
      const colon = pair.indexOf(':')
      if (colon === -1) continue
      x += Number.parseInt(pair.slice(0, colon), 36)
      y += Number.parseInt(pair.slice(colon + 1), 36)
      out.push(x / precision, y / precision)
    }
    return out
  })
  const [minLon = 0, minLat = 0, maxLon = 0, maxLat = 0] = encoded.bbox
  return {
    cls: encoded.cls,
    local: encoded.local,
    name: encoded.name,
    upper: encoded.upper,
    upperUom: encoded.upperUom,
    rings,
    bbox: [minLon / precision, minLat / precision, maxLon / precision, maxLat / precision],
  }
}

/**
 * Ray casting against a flat coordinate array.
 *
 * NOT turf, despite turf being a dependency and the obvious reach. turf's
 * booleanPointInPolygon takes GeoJSON, and building 2,300 GeoJSON Features
 * with nested coordinate arrays on every lookup allocates far more than the
 * test costs: the rings are already flat typed data and this walks them in
 * place. The bbox filter below means a lookup normally tests one or two
 * polygons anyway, so the win is in not building the other 2,300.
 *
 * The algorithm is the standard crossing count, which is exactly what turf's
 * is, so this is the same answer by the same method on a cheaper input.
 */
function inRing(ring: number[], lon: number, lat: number): boolean {
  let inside = false
  const n = ring.length / 2
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const xi = ring[i * 2]
    const yi = ring[i * 2 + 1]
    const xj = ring[j * 2]
    const yj = ring[j * 2 + 1]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Every surface-area polygon containing the pin.
 *
 * A LIST, NOT A SINGLE ANSWER, because a pin can sit in more than one at once:
 * a Class C surface area overlapping a neighbouring Class D is ordinary, and
 * reporting only the first would understate what applies.
 */
export function airspaceAt(
  shapes: readonly AirspaceShape[],
  at: LatLon,
): AirspaceShape[] {
  if (!Number.isFinite(at.lat) || !Number.isFinite(at.lon)) return []
  const hits: AirspaceShape[] = []
  for (const shape of shapes) {
    /* The bbox rejects almost everything for almost nothing. */
    const [minLon, minLat, maxLon, maxLat] = shape.bbox
    if (at.lon < minLon || at.lon > maxLon || at.lat < minLat || at.lat > maxLat) continue

    /*
     * First ring is the outline, any others are holes. A pin in a hole is
     * outside the airspace, which matters for the cut-outs real Class D
     * surface areas have around neighbouring fields.
     */
    const [outer, ...holes] = shape.rings
    if (outer === undefined || !inRing(outer, at.lon, at.lat)) continue
    if (holes.some((hole) => inRing(hole, at.lon, at.lat))) continue
    hits.push(shape)
  }
  return hits
}

/**
 * WHETHER AUTHORIZATION ATTACHES, as a named state rather than a boolean.
 *
 * 'in-surface-airspace' and 'no-surface-airspace-in-extract' are deliberately
 * not true and false. The second one is a statement about an extract, and a
 * boolean would invite a caller to render it as "no authorization needed",
 * which is a conclusion this data cannot support on its own: the extract is
 * dated, generalised at its boundaries, and says nothing about temporary
 * restrictions.
 */
export type AuthorizationState = 'in-surface-airspace' | 'no-surface-airspace-in-extract'

export function authorizationState(hits: readonly AirspaceShape[]): AuthorizationState {
  return hits.length > 0 ? 'in-surface-airspace' : 'no-surface-airspace-in-extract'
}

/**
 * WHAT AN EMPTY RESULT SAYS.
 *
 * A CONSTANT HERE RATHER THAN A STRING IN THE PANEL, because this is the one
 * sentence in the feature most likely to drift into a clearance. "Nothing
 * found" wants to become "no authorization needed", and the difference between
 * those is the difference between reporting data and issuing permission. It
 * lives beside the rule it is paired with, and the wording test in core holds
 * it to the same standard as everything else here.
 */
export const NO_SURFACE_AIRSPACE_NOTE =
  'No Class B, C, D or surface-area E in this extract contains this pin.'

/** The rule, stated. Never a verdict on this flight. */
export const AUTHORIZATION_RULE =
  '107.41 requires ATC authorization to operate in controlled airspace at the surface: ' +
  'Class B, C, D, and surface-area Class E.'

/**
 * TFRs AND NOTAMS ARE NOT CHECKED, AND SAYING SO IS NOT OPTIONAL.
 *
 * There is no usable keyless public feed for temporary flight restrictions,
 * and NOTAMs are behind OAuth2 client credentials. So this app does not check
 * either, and the one thing it must not do is let that silence read as
 * nothing-to-report. An unchecked TFR and an unmarked power line are the same
 * class of lie.
 */
export const TFR_NOT_CHECKED =
  'Temporary flight restrictions and NOTAMs are NOT checked by this app. ' +
  'A TFR can close this airspace at any time and none of the above would change. ' +
  'Check tfr.faa.gov before you fly.'

export const TFR_URL = 'https://tfr.faa.gov/'
