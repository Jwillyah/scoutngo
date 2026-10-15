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
