import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from '../App.tsx'
import { DEFAULT_KIT } from '../core/kit.ts'
import { classificationOf } from '../core/lighting.ts'
import { cameraBearingOf, DEFAULT_SHOT_TYPE } from '../core/shotType.ts'
import { getSunPosition } from '../core/sun.ts'
import type { LatLon } from '../core/geo.ts'
import { planPositions, type CameraPosition } from '../lib/plan.ts'
import { addPosition } from '../lib/positions.ts'

/*
 * A CLIENT EVENT SHOOT MUST LOOK EXACTLY AS IT DID.
 *
 * Shot types are for solo drone work: 360s, little planets, top-downs, long
 * shadows. Most of the rest of the work is framed and nothing else, and that
 * half of the app must not pay for this. These are the assertions that keep
 * the new thing from leaking into a shoot that never asked for it.
 */
const VENUE: LatLon = { lat: 38.364236, lon: -75.605912 }
const SUBJECT: LatLon = { lat: 38.3639, lon: -75.6058 }
const sun = getSunPosition(new Date('2026-09-12T13:00:00-04:00'), VENUE.lat, VENUE.lon)

describe('a position placed by hand is framed, without being asked', () => {
  const list = addPosition([], { at: VENUE, lensId: 'sony-200-600', focalLength: 400 })

  it('defaults to framed', () => {
    expect(list[0].shotType).toBe(DEFAULT_SHOT_TYPE)
    expect(list[0].shotType).toBe('framed')
  })

  it('gets a bearing, a classification and a cone, exactly as before', () => {
    const [planned] = planPositions(list, SUBJECT, sun, undefined, undefined, undefined, undefined, DEFAULT_KIT)
    expect(planned.aim.shotType).toBe('framed')
    expect(classificationOf(planned.read)).not.toBeNull()
    expect(planned.cone.length).toBeGreaterThan(0)
  })
})

describe('the plan geometry of a framed-only plan', () => {
  const framed = (lat: number, lon: number): CameraPosition => ({
    id: `p${lat}`,
    number: 1,
    at: { lat, lon },
    lensId: 'sony-200-600',
    focalLength: 400,
    shot: '',
    risk: '',
    angleRationale: '',
    coversShot: null,
    platform: 'ground',
    altitudeFeet: 0,
    shotType: 'framed',
    yawDegrees: 0,
    moved: false,
    origin: 'manual',
  })

  const plan = planPositions(
    [framed(38.3655, -75.6058), framed(38.3625, -75.6058)],
    SUBJECT,
    sun,
  )

  it('classifies every position', () => {
    for (const planned of plan) {
      expect(classificationOf(planned.read)).not.toBeNull()
    }
  })

  it('draws a cone for every position', () => {
    for (const planned of plan) {
      expect(planned.cone.length).toBeGreaterThan(0)
    }
  })

  /*
   * AND COUNTS EVERY ONE TOWARD COVERAGE. withoutBearing is the path a
   * top-down and a 360 take; a framed-only plan must never touch it.
   */
  it('leaves no position out of the coverage arithmetic', async () => {
    const { assessPlan } = await import('../lib/plan.ts')
    const assessed = assessPlan(plan)
    expect(assessed.coverage.withoutBearing).toBe(0)
    expect(assessed.coverage.bearings).toHaveLength(2)
  })
})

/*
 * A MIXED PLAN: a framed position and a 360 side by side.
 *
 * The cone is the visible half of the refusal. A cone is a claim about a
 * direction, so only the framed position gets one, and the 360's absence has
 * to be an absence rather than an empty polygon that renders as a stray point.
 */
describe('a plan with both kinds in it', () => {
  const base = (over: Partial<CameraPosition>): CameraPosition => ({
    id: 'x',
    number: 1,
    at: { lat: 38.3655, lon: -75.6058 },
    lensId: 'sony-200-600',
    focalLength: 400,
    shot: '',
    risk: '',
    angleRationale: '',
    coversShot: null,
    platform: 'ground',
    altitudeFeet: 0,
    shotType: 'framed',
    yawDegrees: 0,
    moved: false,
    origin: 'manual',
    ...over,
  })

  const plan = planPositions(
    [
      base({ id: 'framed' }),
      base({ id: 'nadir', shotType: 'top-down', at: { lat: 38.3645, lon: -75.606 } }),
      base({ id: 'globe', shotType: 'orbit', at: { lat: 38.363, lon: -75.6052 } }),
    ],
    SUBJECT,
    sun,
  )

  it('draws a cone for the framed one and for no other', () => {
    const withCones = plan.filter((p) => p.cone.length > 0).map((p) => p.position.id)
    expect(withCones).toEqual(['framed'])
  })

  it('gives a classification to the framed one and to no other', () => {
    expect(classificationOf(plan[0].read)).not.toBeNull()
    expect(classificationOf(plan[1].read)).toBeNull()
    expect(classificationOf(plan[2].read)).toBeNull()
  })

  it('gives a camera bearing to the framed one and to no other', () => {
    expect(cameraBearingOf(plan[0].aim)).not.toBeNull()
    expect(cameraBearingOf(plan[1].aim)).toBeNull()
    expect(cameraBearingOf(plan[2].aim)).toBeNull()
  })

  /* The two without a bearing are COUNTED, not silently dropped. */
  it('counts the two without a bearing rather than hiding them', async () => {
    const { assessPlan } = await import('../lib/plan.ts')
    const assessed = assessPlan(plan)
    expect(assessed.coverage.withoutBearing).toBe(2)
    expect(assessed.coverage.bearings).toHaveLength(1)
  })
})

/*
 * NO NEW CHROME. The shot type is one line on the position card and nothing
 * else: no map control, no header row, nothing in the sheet, nothing on SETUP.
 * A cold render of the app must not mention it anywhere.
 */
describe('shot types add no chrome to the app shell', () => {
  const html = renderToStaticMarkup(<App />)

  it('puts nothing about shot types on SETUP', () => {
    expect(html).not.toContain('Top-down')
    expect(html).not.toContain('top-down')
    expect(html).not.toContain('360')
    expect(html).not.toContain('The pin is')
  })

  it('still renders the shell it always did', () => {
    expect(html).toContain('class="shell shell--setup"')
  })
})

/*
 * WHAT GETS DRAWN, PER SHOT TYPE. Exactly one shape each, and never a cone
 * for a type with no direction.
 */
describe('the shapes each shot type is drawn with', () => {
  const make = (over: Partial<CameraPosition>): CameraPosition => ({
    id: 'x',
    number: 1,
    at: { lat: 38.3655, lon: -75.6058 },
    lensId: 'air-3s-wide',
    focalLength: 24,
    shot: '',
    risk: '',
    angleRationale: '',
    coversShot: null,
    platform: 'air',
    altitudeFeet: 200,
    shotType: 'framed',
    yawDegrees: 0,
    moved: false,
    origin: 'manual',
    ...over,
  })
  const plan = (over: Partial<CameraPosition>) => planPositions([make(over)], SUBJECT, sun)[0]

  it('gives a framed shot a cone and no footprint', () => {
    const p = plan({ shotType: 'framed' })
    expect(p.cone.length).toBeGreaterThan(0)
    expect(p.footprint).toBeNull()
  })

  it('gives a top-down a rectangle and no cone', () => {
    const p = plan({ shotType: 'top-down' })
    expect(p.cone).toEqual([])
    expect(p.footprint?.shotType).toBe('top-down')
    if (p.footprint?.shotType !== 'top-down') return
    // A closed ring of four corners, and the measured 91 by 61 at 200ft.
    expect(p.footprint.rect[0]).toHaveLength(5)
    expect(Math.round(p.footprint.widthMeters)).toBe(91)
    expect(Math.round(p.footprint.heightMeters)).toBe(61)
  })

  it('gives a 360 a horizon ring and no cone', () => {
    const p = plan({ shotType: 'orbit' })
    expect(p.cone).toEqual([])
    expect(p.footprint?.shotType).toBe('orbit')
    if (p.footprint?.shotType !== 'orbit') return
    expect(p.footprint.ring.length).toBeGreaterThan(20)
    // About 28km at 200ft, which is where the horizon actually is.
    expect(p.footprint.horizonMeters / 1000).toBeCloseTo(27.9, 1)
  })

  /*
   * NO SHADOW ARROW WITHOUT A SHADOW, and no sun tick with the sun down. An
   * arrow drawn anyway would be an instruction to line the frame up with
   * something that is not there.
   */
  it('draws no shadow line and no sun tick with the sun below the horizon', () => {
    const night = getSunPosition(new Date('2026-09-12T03:00:00-04:00'), VENUE.lat, VENUE.lon)
    expect(night.altitude).toBeLessThan(0)
    const nadir = planPositions([make({ shotType: 'top-down' })], SUBJECT, night)[0]
    const globe = planPositions([make({ shotType: 'orbit' })], SUBJECT, night)[0]
    if (nadir.footprint?.shotType !== 'top-down') throw new Error('expected top-down')
    if (globe.footprint?.shotType !== 'orbit') throw new Error('expected orbit')
    expect(nadir.footprint.shadow).toEqual([])
    expect(globe.footprint.sunTick).toEqual([])
    // The shapes themselves are still there: the frame still covers ground.
    expect(nadir.footprint.rect[0]).toHaveLength(5)
    expect(globe.footprint.ring.length).toBeGreaterThan(20)
  })

  /*
   * A TOP-DOWN OR A 360 FROM THE GROUND IS A MAST OR A TRIPOD, and its height
   * still sizes the rectangle and the ring. The height field is offered
   * whenever the geometry uses it, not only when a drone is flying.
   */
  it('sizes a ground top-down from its own camera height', () => {
    const low = plan({ shotType: 'top-down', platform: 'ground', altitudeFeet: 12 })
    const high = plan({ shotType: 'top-down', platform: 'ground', altitudeFeet: 48 })
    if (low.footprint?.shotType !== 'top-down') throw new Error('expected top-down')
    if (high.footprint?.shotType !== 'top-down') throw new Error('expected top-down')
    expect(high.footprint.widthMeters / low.footprint.widthMeters).toBeCloseTo(4, 1)
  })
})
