import { useMemo, useState } from 'react'
import { AIR3S, pathFor, type Move, type PathPoint } from '../../core/flight.ts'
import type { LatLon } from '../../core/geo.ts'
import type { LevelWind } from '../../core/windProfile.ts'
import type { Building } from '../buildings.ts'
import { facilityCellAt } from '../uasfm.ts'
import type { ScanContext } from '../lidar/applyScan.ts'
import { flightCard, type FlightCard } from './card.ts'
import { flightFeatures } from './features.ts'
import { preflightHeights } from './heights.ts'

/*
 * THE MOVE BEING DRAWN, and everything worked out from it. Points come from
 * taps on the map; the rest from the card's controls. Your approved ceiling
 * and the flight time are kept on the phone.
 */
export type MoveKind = Move['kind']
export const MOVE_LABEL: Record<MoveKind, string> = {
  orbit: 'Orbit',
  'push-in': 'Push in',
  'pull-back': 'Pull back',
  rise: 'Rise',
  'fly-along': 'Fly along',
  waypoints: 'Waypoints',
}
/* How many taps each move takes before it can be drawn (orbit centres on the venue). */
export const POINTS_NEEDED: Record<MoveKind, number> = { orbit: 0, 'push-in': 1, 'pull-back': 1, rise: 1, 'fly-along': 2, waypoints: 2 }

const KEY = 'scoutngo.preflight.v1'
const PART_107_FT = 400
const readKept = (): { approvedFt: number; flightMinutes: number } => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { approvedFt?: number; flightMinutes?: number }
    return { approvedFt: v.approvedFt ?? PART_107_FT, flightMinutes: v.flightMinutes ?? AIR3S.flightMinutes }
  } catch {
    return { approvedFt: PART_107_FT, flightMinutes: AIR3S.flightMinutes }
  }
}

export interface PreflightInput {
  venue: LatLon | null
  pilotAt: LatLon | null
  buildings: readonly Building[]
  winds: readonly LevelWind[]
  scan: ScanContext | null
  /*
   * Whether Preflight's card is open. The flight card is worked out only
   * then: it was worked out always, for the default orbit, and again every
   * time the scrubbed hour changed the winds, which froze the time bar for
   * 4.7 s on a step (29 Oct, scripts/measure-timebar.mjs).
   */
  open: boolean
}

export function usePreflight({ venue, pilotAt, buildings, winds, scan, open }: PreflightInput) {
  const [kind, setKind] = useState<MoveKind>('orbit')
  const [points, setPoints] = useState<LatLon[]>([])
  const [heightFt, setHeightFt] = useState(150)
  const [speedMps, setSpeedMps] = useState(5)
  const [focal, setFocal] = useState<24 | 70>(24)
  const [radiusM, setRadiusM] = useState(80)
  const [kept, setKept] = useState(readKept)
  /* A flight flown by hand (Fly it yourself): kept as the plan, its own path and timing. */
  const [flown, setFlown] = useState<PathPoint[] | null>(null)
  const keep = (next: Partial<typeof kept>) => {
    const v = { ...kept, ...next }
    setKept(v)
    try {
      localStorage.setItem(KEY, JSON.stringify(v))
    } catch {
      /* Not kept: this session still uses it. */
    }
  }

  const gridFt = venue === null ? null : (facilityCellAt(venue.lat, venue.lon)?.ceilingFeet ?? null)
  const capFt = Math.min(kept.approvedFt, gridFt ?? kept.approvedFt)
  const pilot = pilotAt ?? venue

  const move = useMemo((): Move | null => {
    if (flown !== null && flown.length > 1) {
      /* Every 2 s of the flight as a waypoint: the move's own shape, for the card's second look at the length. */
      const every = flown.filter((_, i) => i % 4 === 0 || i === flown.length - 1)
      return { kind: 'waypoints', points: every.map((p) => ({ at: p.at, heightFt: p.ft })) }
    }
    if (venue === null) return null
    if (points.length < POINTS_NEEDED[kind]) return null
    switch (kind) {
      case 'orbit':
        return { kind, centre: venue, radiusM, heightFt, startBearing: 0, sweepDeg: 360, clockwise: true }
      case 'push-in':
      case 'pull-back':
        return { kind, from: points[0], subject: venue, heightFt }
      case 'rise':
        return { kind, at: points[0], fromFt: 10, toFt: heightFt }
      case 'fly-along':
        return { kind, points, heightFt }
      case 'waypoints':
        return { kind, points: points.map((at) => ({ at, heightFt })) }
    }
  }, [kind, points, venue, radiusM, heightFt, flown])

  const heights = useMemo(() => preflightHeights(scan, buildings), [scan, buildings])
  const path = useMemo(() => (flown !== null && flown.length > 1 ? flown : move === null ? [] : pathFor(move, { speedMps, capFt, stepS: 0.5 })), [move, speedMps, capFt, flown])
  const card = useMemo((): FlightCard | null => {
    if (!open || move === null || pilot === null || path.length < 2) return null
    return flightCard({
      move,
      path,
      capFt,
      pilot,
      heights,
      boxes: heights.boxes,
      scanYear: heights.source.kind === 'scan' ? heights.source.year : null,
      ceilingAt: (at) => facilityCellAt(at.lat, at.lon)?.ceilingFeet ?? null,
      winds,
      flightMinutes: kept.flightMinutes,
    })
  }, [open, move, path, capFt, pilot, heights, winds, kept.flightMinutes])
  const features = useMemo(() => flightFeatures(path, card?.hidden ?? [], points), [path, card, points])

  return {
    kind,
    setKind: (k: MoveKind) => {
      setKind(k)
      setPoints([])
      setFlown(null)
    },
    flown,
    setFlown,
    heights,
    points,
    addPoint: (at: LatLon) => setPoints((ps) => (kind === 'push-in' || kind === 'pull-back' || kind === 'rise' ? [at] : [...ps, at])),
    clearPoints: () => setPoints([]),
    heightFt,
    setHeightFt,
    speedMps,
    setSpeedMps,
    focal,
    setFocal,
    radiusM,
    setRadiusM,
    approvedFt: kept.approvedFt,
    setApprovedFt: (ft: number) => keep({ approvedFt: ft }),
    flightMinutes: kept.flightMinutes,
    setFlightMinutes: (m: number) => keep({ flightMinutes: m }),
    gridFt,
    capFt,
    pilot,
    move,
    path,
    card,
    features,
    heightsSource: heights.source,
  }
}

export type Preflight = ReturnType<typeof usePreflight>
