import { describe, expect, it } from 'vitest'
import { destinationPoint } from './geo.ts'
import {
  CONE_DEGREES,
  MAX_METERS,
  OPEN_GROUND_CAVEAT,
  milesWords,
  nearestOpenGround,
  openGroundSentence,
  type GroundCandidate,
} from './openGround.ts'

const HERE = { lat: 36.726, lon: -75.94 }
/* The sun setting roughly west-southwest, which is the case this is for. */
const SUN = 254

const at = (bearing: number, meters: number, over: Partial<GroundCandidate> = {}): GroundCandidate => ({
  kind: 'farmland',
  name: null,
  at: destinationPoint(HERE, bearing, meters),
  ...over,
})

describe('finding somewhere that way', () => {
  it('takes the nearest candidate inside the cone', () => {
    const hit = nearestOpenGround(HERE, SUN, [
      at(254, 2000),
      at(250, 640, { kind: 'beach' }),
      at(260, 1200),
    ])
    expect(hit?.kind).toBe('beach')
    expect(hit?.meters).toBeCloseTo(640, -1)
    expect(hit?.miles).toBeCloseTo(0.4, 1)
  })

  it('ignores candidates behind you', () => {
    /* Due east when the sun is in the west is the wrong way by 164 degrees. */
    expect(nearestOpenGround(HERE, SUN, [at(90, 200)])).toBeNull()
  })

  it('accepts the edge of the cone and rejects just past it', () => {
    expect(nearestOpenGround(HERE, SUN, [at(SUN + CONE_DEGREES - 1, 500)])).not.toBeNull()
    expect(nearestOpenGround(HERE, SUN, [at(SUN + CONE_DEGREES + 1, 500)])).toBeNull()
  })

  it('ignores anything further than the search radius', () => {
    expect(nearestOpenGround(HERE, SUN, [at(254, MAX_METERS + 500)])).toBeNull()
    expect(nearestOpenGround(HERE, SUN, [at(254, MAX_METERS - 500)])).not.toBeNull()
  })

  /* Somewhere you are standing is not somewhere to drive to. */
  it('ignores a candidate under your feet', () => {
    expect(nearestOpenGround(HERE, SUN, [{ kind: 'park', name: null, at: HERE }])).toBeNull()
  })

  it('works across the 360 wrap', () => {
    const hit = nearestOpenGround(HERE, 350, [at(10, 800, { kind: 'water' })])
    expect(hit?.kind).toBe('water')
  })

  /*
   * NEAREST, NOT BEST. A named park is not better than an unnamed field here,
   * it is only better mapped, and sorting on anything but distance would be
   * inventing a recommendation out of OSM tags.
   */
  it('does not prefer a named or larger place over a nearer one', () => {
    const hit = nearestOpenGround(HERE, SUN, [
      at(254, 3000, { kind: 'park', name: 'Little Island Park' }),
      at(254, 500, { kind: 'parking' }),
    ])
    expect(hit?.kind).toBe('parking')
  })

  it('returns nothing from an empty list rather than throwing', () => {
    expect(nearestOpenGround(HERE, SUN, [])).toBeNull()
  })

  it('refuses coordinates and bearings that are not numbers', () => {
    expect(nearestOpenGround({ lat: Number.NaN, lon: 0 }, SUN, [at(254, 500)])).toBeNull()
    expect(nearestOpenGround(HERE, Number.NaN, [at(254, 500)])).toBeNull()
  })
})

describe('the sentence', () => {
  it('names the distance and what is mapped', () => {
    const hit = nearestOpenGround(HERE, SUN, [at(252, 640, { kind: 'beach' })])
    const line = openGroundSentence(hit, 3.1)
    expect(line).toContain('Nearest open ground that way')
    expect(line).toContain('0.4 mi')
    expect(line).toContain('a beach')
  })

  it('uses the OSM name when there is one', () => {
    const hit = nearestOpenGround(HERE, SUN, [
      at(252, 640, { kind: 'park', name: 'Little Island Park' }),
    ])
    expect(openGroundSentence(hit, 3.1)).toContain('Little Island Park')
  })

  /*
   * IT DOES NOT GO QUIET. Silence here would be read as "nothing that way",
   * which is a claim about the ground. The line says the MAP is empty.
   */
  it('says so when nothing is mapped, rather than saying nothing', () => {
    const line = openGroundSentence(null, 3.1)
    expect(line).toContain('No open ground mapped')
    expect(line).toContain('3.1 mi')
    expect(line).toContain('not the ground')
  })

  /*
   * THE PHRASE IS "OPEN GROUND". Not "clear view", not "unobstructed", not
   * "good spot". This app cannot see the treeline on the far side of a field.
   */
  it('never claims a clear view', () => {
    const lines = [
      openGroundSentence(nearestOpenGround(HERE, SUN, [at(252, 640)]), 3.1),
      openGroundSentence(null, 3.1),
      OPEN_GROUND_CAVEAT,
    ].join(' ').toLowerCase()

    for (const banned of [
      'clear view',
      'clear of',
      'unobstructed',
      'uninterrupted',
      'good spot',
      'best spot',
      'perfect',
      'open view',
      'visible horizon',
      'nothing in the way',
    ]) {
      expect(lines, `contains "${banned}"`).not.toContain(banned)
    }
  })

  it('carries the caveat that mapped is not visible', () => {
    expect(OPEN_GROUND_CAVEAT).toContain('not that the horizon is visible')
  })
})

describe('miles for a driver', () => {
  it('uses one decimal', () => {
    expect(milesWords(0.43)).toBe('0.4 mi')
    expect(milesWords(2.0)).toBe('2.0 mi')
  })

  /* "0.0 mi" reads as being there already. */
  it('does not print a zero distance', () => {
    expect(milesWords(0.04)).toBe('under 0.1 mi')
  })

  it('prints a dash rather than a number it does not have', () => {
    expect(milesWords(Number.NaN)).toBe('—')
    expect(milesWords(-1)).toBe('—')
  })
})
