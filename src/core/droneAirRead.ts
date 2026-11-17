/*
 * ONE AIRSPACE READ PER POINT, FOR EVERY TAB OF THE DRONE PAGE (Batch FIX,
 * Section 6.1).
 *
 * On 17 Nov the Now and By height cards said "Class D · 250 ft · LAANC near
 * KNTU" while the Airspace sheet for the same page said "Class C · max 100 ft
 * · Norfolk Intl (KORF)". Two lookups, at two points: the cards read the
 * page's venue, the sheet read its own marker, which a tap or a search had
 * moved to Chic's Beach. Both answers were the baked data's, each for its own
 * point (tests/droneAirOne.test.ts holds both): Chic's Beach is under Norfolk
 * Intl's Class C; the Virginia Beach oceanfront is under Oceana's Class D.
 *
 * Now the page holds ONE point (the marker is the page's point), looks it up
 * once (src/lib/airspaceAtPoint.ts) and every tab reads this one value: the
 * Now row, the sheet's headline and its summary line. Failure mode A in
 * docs/failure-modes.md: one source, the rest derived.
 */
import type { AirspaceAtPoint } from './airspaceCard.ts'
import type { FacilityCell } from './faaGrid.ts'
import { markerHeadline } from './faaLive.ts'

export interface AirspaceRead {
  /** The class the point is under ('C', 'D', …; a controlled class before E), or null with none. */
  cls: string | null
  /** The facility map's ceiling here, feet above the ground, or null with no grid square. */
  ceilingFt: number | null
  /** The facility that owns the grid square: "KORF", "Norfolk Intl". */
  icao: string | null
  facility: string | null
  /** Under class airspace (B, C, D, surface E): flying here needs an FAA authorization (14 CFR 107.41). */
  controlled: boolean
  /** The grid square's facility lists Part 107 LAANC auto-approval (107-AA). */
  laanc: boolean
  /** The sheet's headline: "Class C · max 100 ft here". */
  headline: string
  /** The Now tab's row: "Class C · 100 ft" and "KORF". */
  row: { big: string; small: string | null }
}

export function airspaceRead(here: AirspaceAtPoint, cell: FacilityCell | null): AirspaceRead {
  const classes = here.classes
  const cls = classes.find((c) => c !== 'E') ?? (classes.includes('E') ? 'E' : null)
  const ceilingFt = here.gridCeilingFeet
  const big = cls === null ? (ceilingFt === null ? 'None marked' : `Grid · ${ceilingFt} ft`) : ceilingFt === null ? `Class ${cls}` : `Class ${cls} · ${ceilingFt} ft`
  return {
    cls,
    ceilingFt,
    icao: cell?.icao ?? null,
    facility: cell?.facility ?? null,
    controlled: classes.length > 0,
    laanc: cell?.routes.includes('107-AA') ?? false,
    headline: markerHeadline(classes, ceilingFt),
    row: { big, small: cell?.icao ?? null },
  }
}

/**
 * THE SHEET'S SECOND LINE, collapsed (Batch FIX, Section 6.4; board
 * Drone_Slim_3): "Norfolk Intl grid · LAANC needed · 0 TFRs here · Remote ID
 * needed". The details are one swipe up.
 *
 *   `tfrsInside`  TFRs in force today over the point, null when the FAA's
 *                 layer has not arrived (then it says so)
 *   `fria`        inside a FAA-Recognized Identification Area, or 'unknown'
 *                 before the layer arrives (then nothing is said)
 *
 * "LAANC needed" only where the facility's grid lists Part 107 LAANC; under
 * class airspace without it, "FAA authorization needed". Never "clear".
 */
export function sheetSummary(read: AirspaceRead | null, tfrsInside: number | null, fria: boolean | 'unknown'): string {
  if (read === null) return 'Reading the FAA data in the app…'
  const parts: string[] = []
  if (read.facility !== null) parts.push(`${read.facility} grid`)
  if (read.controlled) parts.push(read.laanc ? 'LAANC needed' : 'FAA authorization needed')
  parts.push(tfrsInside === null ? 'TFRs not received' : `${tfrsInside} TFR${tfrsInside === 1 ? '' : 's'} here`)
  if (fria !== 'unknown') parts.push(fria ? 'In a FRIA' : 'Remote ID needed')
  return parts.join(' · ')
}

/**
 * THE MAP'S LAYERS, BY DEFAULT (Batch FIX, Section 6.4). The LAANC grid,
 * no-fly and security areas, and today's TFRs are drawn; the rest are a
 * toggle away. No-fly and TFRs START ON EVERY TIME the map opens: a hazard
 * layer switched off on another day must not stay hidden by a toggle you
 * forgot. The other choices are kept on the phone.
 */
export type AirToggle = 'grid' | 'nofly' | 'tfr' | 'sua' | 'parks' | 'fria' | 'heliport'
export const AIR_DEFAULTS: Readonly<Record<AirToggle, boolean>> = { grid: true, nofly: true, tfr: true, sua: false, parks: false, fria: false, heliport: false }
export const ALWAYS_ON_AT_OPEN: readonly AirToggle[] = ['nofly', 'tfr']

/** The toggles a visit opens with: the kept choices, with no-fly and TFRs on. */
export function openingLayers(kept: Partial<Record<AirToggle, unknown>> | null): Record<AirToggle, boolean> {
  const on = { ...AIR_DEFAULTS }
  for (const k of Object.keys(on) as AirToggle[]) if (typeof kept?.[k] === 'boolean') on[k] = kept[k] as boolean
  for (const k of ALWAYS_ON_AT_OPEN) on[k] = true
  return on
}
