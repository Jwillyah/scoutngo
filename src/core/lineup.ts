/*
 * LINE IT UP: the sun or the moon rising or setting behind a thing you can
 * see, over the next twelve months, within LINEUP_TOLERANCE_DEG of it.
 *
 * "Behind it" means where the body first shows (or last shows) above
 * whichever is higher at that bearing: the visible horizon (the terrain's,
 * src/core/skyWindow.ts horizonAngleAt, flat when there is no terrain) or
 * the top of the thing itself when it is tall enough to stand above it (a
 * hotel; a pier end never is). The search is findAlignments' crossing
 * bisection, at that altitude, both bodies, both directions.
 */
import { getMoonIllumination } from 'suncalc'
import { bearingBetween, distanceMeters, type LatLon } from './geo.ts'
import { findAlignments, HORIZON_ALTITUDE, targetAltitude, type Body } from './alignment.ts'

export const LINEUP_TOLERANCE_DEG = 0.5
/** Lit this much or more, the moon is called full. */
export const FULL_FROM = 0.97

export interface LineupQuery {
  observer: LatLon
  target: LatLon
  /** The thing's height above the ground, metres, when known. */
  targetHeightM: number | null
  /** The visible horizon's altitude at the thing's bearing, degrees: 0 for flat. */
  horizonDeg: number
  from: Date
  to?: Date
}

export interface Lineup {
  body: Body
  event: 'rise' | 'set'
  at: Date
  azimuth: number
  /** Body bearing minus the thing's, degrees. */
  offset: number
  /** Moon only: share lit, 0-1. */
  lit: number | null
  /** What it comes out from behind: the horizon there, or the thing's top. */
  behind: 'horizon' | 'top'
}

export interface Sight {
  bearing: number
  distanceM: number
  /** The thing's top above the eye, degrees; null with no height. */
  topDeg: number | null
}

export function sightOf(observer: LatLon, target: LatLon, heightM: number | null): Sight {
  return {
    bearing: bearingBetween(observer, target),
    distanceM: distanceMeters(observer, target),
    topDeg: heightM === null ? null : targetAltitude(observer, target, heightM),
  }
}

/**
 * The altitude of the body's centre (suncalc's apparent altitude) when its top
 * edge stands on a line `edgeDeg` up: the rise and set convention
 * (HORIZON_ALTITUDE, at a flat horizon) carried up or down by the line's
 * height. One convention for every horizon, so a flat one gives exactly
 * suncalc's sunrise (docs/failure-modes.md, A).
 */
export const centreFor = (body: Body, edgeDeg: number): number => HORIZON_ALTITUDE[body] + edgeDeg

export function findLineups(q: LineupQuery, limit = 40): Lineup[] {
  const sight = sightOf(q.observer, q.target, q.targetHeightM)
  const behind: Lineup['behind'] = sight.topDeg !== null && sight.topDeg > q.horizonDeg ? 'top' : 'horizon'
  const edge = behind === 'top' ? (sight.topDeg as number) : q.horizonDeg
  const out: Lineup[] = []
  for (const body of ['sun', 'moon'] as const) {
    const found = findAlignments({
      observer: q.observer,
      target: q.target,
      body,
      mode: 'height',
      edgeDeg: edge,
      toleranceDeg: LINEUP_TOLERANCE_DEG,
      from: q.from,
      ...(q.to === undefined ? {} : { to: q.to }),
      limit: 200,
    })
    for (const a of found) {
      out.push({
        body,
        event: a.direction === 'rising' ? 'rise' : 'set',
        at: a.at,
        azimuth: a.azimuth,
        offset: a.offsetDegrees,
        lit: body === 'moon' ? getMoonIllumination(a.at).fraction : null,
        behind,
      })
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, limit)
}

/** "Full moon rises off the pier end · Tue 4 Nov 5:12 PM · 98% lit" */
export function lineupLine(l: Lineup, thing: string, when: (d: Date) => string): string {
  const name = l.body === 'sun' ? 'Sun' : (l.lit ?? 0) >= FULL_FROM ? 'Full moon' : 'Moon'
  const verb = l.event === 'rise' ? 'rises' : 'sets'
  const where = l.behind === 'top' ? `over ${thing}` : l.event === 'rise' ? `off ${thing}` : `behind ${thing}`
  const lit = l.lit === null ? '' : ` · ${Math.round(l.lit * 100)}% lit`
  return `${name} ${verb} ${where} · ${when(l.at)}${lit}`
}
