import { describe, expect, it } from 'vitest'
import {
  capWords,
  extractJsonObject,
  parsePlanResponse,
  type DroneCameraSpec,
  type LensSpec,
} from './parsePlan.ts'

const LENSES: LensSpec[] = [
  { id: 'sony-200-600', name: 'Sony 200-600', min: 200, max: 600 },
  { id: 'sigma-28-75', name: 'Sigma 28-75 f2.8', min: 28, max: 75 },
]

/** The real Air 3S: two fixed cameras, 24mm and 70mm equivalent. Not a zoom. */
const DRONE_CAMERAS: DroneCameraSpec[] = [
  { id: 'air-3s-wide', name: 'Air 3S wide', equiv35: 24 },
  { id: 'air-3s-tele', name: 'Air 3S tele', equiv35: 70 },
]

/** An air position as the model should send one. */
const airPosition = (over: Record<string, unknown> = {}) => ({
  x: 0.5,
  y: 0.5,
  lensId: 'air-3s-wide',
  focalLength: 24,
  shot: 'Establisher over the river.',
  risk: 'Crowd on the deck below.',
  platform: 'air',
  altitudeFeet: 220,
  ...over,
})

const position = (over: Record<string, unknown> = {}) => ({
  x: 0.5,
  y: 0.5,
  lensId: 'sony-200-600',
  focalLength: 400,
  shot: 'Boats hitting the pilings.',
  risk: 'Crowd blocks the rail.',
  ...over,
})

const wrap = (positions: unknown[]) => JSON.stringify({ positions })

describe('capWords', () => {
  it('leaves short text alone', () => {
    expect(capWords('one two three', 5)).toBe('one two three')
  })

  it('cuts at the cap and marks the cut', () => {
    expect(capWords('a b c d e f', 3)).toBe('a b c…')
  })

  it('collapses whitespace and survives empty input', () => {
    expect(capWords('  a   b  ', 5)).toBe('a b')
    expect(capWords('', 5)).toBe('')
  })
})

describe('extractJsonObject', () => {
  it('returns a bare object unchanged', () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}')
  })

  it('digs the object out of markdown fences the prompt forbade', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('digs it out of surrounding prose', () => {
    expect(extractJsonObject('Sure! {"a":1} Hope that helps.')).toBe('{"a":1}')
  })

  it('returns null when there is no object at all', () => {
    expect(extractJsonObject('I cannot help with that.')).toBeNull()
  })
})

describe('parsePlanResponse', () => {
  it('parses a clean response', () => {
    const result = parsePlanResponse(wrap([position()]), LENSES)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.positions).toHaveLength(1)
    expect(result.positions[0].lensId).toBe('sony-200-600')
    expect(result.positions[0].focalLength).toBe(400)
  })

  it('THE TRUNCATION FAILURE: surfaces the raw text instead of dead ending', () => {
    // docs/brief.md: output cut off at the token cap produced an unparseable
    // response and a dead end error. The raw text must always come back.
    const truncated = '{"positions":[{"x":0.4,"y":0.6,"lensId":"sony-200-600","sho'
    const result = parsePlanResponse(truncated, LENSES)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.raw).toBe(truncated)
    expect(result.reason).toContain('cut off')
  })

  it('returns the raw text when the model answers with prose', () => {
    const result = parsePlanResponse('I need more information about the venue.', LENSES)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.raw).toBe('I need more information about the venue.')
  })

  it('caps the shot at 25 words and the risk at 15', () => {
    const longShot = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ')
    const longRisk = Array.from({ length: 40 }, (_, i) => `r${i}`).join(' ')
    const result = parsePlanResponse(
      wrap([position({ shot: longShot, risk: longRisk })]),
      LENSES,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.positions[0].shot.replace('…', '').split(' ')).toHaveLength(25)
    expect(result.positions[0].risk.replace('…', '').split(' ')).toHaveLength(15)
  })

  it('never returns more than six positions', () => {
    const result = parsePlanResponse(wrap(Array.from({ length: 12 }, () => position())), LENSES)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.positions).toHaveLength(6)
  })

  it('clamps coordinates into the image', () => {
    const result = parsePlanResponse(wrap([position({ x: 4.2, y: -3 })]), LENSES)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.positions[0].x).toBe(1)
    expect(result.positions[0].y).toBe(0)
  })

  it('clamps focal length into the range of the lens named', () => {
    const tooLong = parsePlanResponse(wrap([position({ focalLength: 2000 })]), LENSES)
    expect(tooLong.ok && tooLong.positions[0].focalLength).toBe(600)
    const tooShort = parsePlanResponse(wrap([position({ focalLength: 12 })]), LENSES)
    expect(tooShort.ok && tooShort.positions[0].focalLength).toBe(200)
  })

  it('drops a position naming a lens that is not in the kit', () => {
    const result = parsePlanResponse(
      wrap([position(), position({ lensId: 'canon-400-do' })]),
      LENSES,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.positions).toHaveLength(1)
    expect(result.dropped).toBe(1)
  })

  it('fails with the raw text when every position is unusable', () => {
    const result = parsePlanResponse(wrap([position({ lensId: 'nope' })]), LENSES)
    expect(result.ok).toBe(false)
  })

  it('ignores any lighting the model tried to assert', () => {
    // Not parsed, so it cannot reach the app. This is the whole design rule.
    const result = parsePlanResponse(
      wrap([position({ lighting: 'front-lit', sunAzimuth: 12, bearing: 300 })]),
      LENSES,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.positions[0])).toEqual([
      'x',
      'y',
      'lensId',
      'focalLength',
      'shot',
      'risk',
      'angleRationale',
      'platform',
      'altitudeFeet',
    ])
  })

  /*
   * The prompt now HANDS the model the sun's azimuth and altitude so it can
   * choose a vantage with the light in mind. That traffic is one way, and this is
   * the test that keeps it that way: there is no lighting field to parse, so
   * nothing the model says about light can reach the app, and
   * src/core/lighting.ts stays the only thing that decides it.
   */
  it('gives the model sun facts but reads no lighting claim back', () => {
    const result = parsePlanResponse(
      wrap([
        position({
          angleRationale: 'Pilings lead away, clean water behind.',
          lighting: 'front-lit',
          sunDelta: 170,
          cameraBearing: 12,
        }),
      ]),
      LENSES,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const parsed = result.positions[0] as unknown as Record<string, unknown>
    expect(parsed.angleRationale).toBe('Pilings lead away, clean water behind.')
    expect(parsed).not.toHaveProperty('lighting')
    expect(parsed).not.toHaveProperty('sunDelta')
    expect(parsed).not.toHaveProperty('cameraBearing')
  })

  it('caps the rationale at 15 words like every other prose field', () => {
    const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ')
    const result = parsePlanResponse(wrap([position({ angleRationale: long })]), LENSES)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The cut mark rides on the last kept word, so 15 words means 15 tokens.
    expect(result.positions[0].angleRationale.split(' ')).toHaveLength(15)
    expect(result.positions[0].angleRationale.endsWith('…')).toBe(true)
  })

  it('leaves the rationale empty rather than inventing one', () => {
    const result = parsePlanResponse(wrap([position()]), LENSES)
    expect(result.ok && result.positions[0].angleRationale).toBe('')
  })

  it('survives junk in every field without throwing', () => {
    const result = parsePlanResponse(
      wrap([position({ x: 'left', y: null }), position({ shot: 42, risk: undefined })]),
      LENSES,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.positions).toHaveLength(1)
    expect(result.positions[0].shot).toBe('')
  })

  it('refuses when the kit has no lenses selected', () => {
    expect(parsePlanResponse(wrap([position()]), []).ok).toBe(false)
  })
})

describe('drone positions', () => {
  it('refuses an air position when no drone is in the kit', () => {
    const result = parsePlanResponse(wrap([airPosition()]), LENSES, false, DRONE_CAMERAS)
    /*
     * With no drone packed the platform falls back to ground, and a drone camera
     * is not something anyone can hold, so the position is dropped rather than
     * quietly becoming a handheld shot with an optic that does not exist.
     */
    expect(result.ok).toBe(false)
  })

  it('accepts one when a drone is in the kit', () => {
    const result = parsePlanResponse(wrap([airPosition()]), LENSES, true, DRONE_CAMERAS)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.positions[0].platform).toBe('air')
    expect(result.positions[0].lensId).toBe('air-3s-wide')
    expect(result.positions[0].altitudeFeet).toBe(220)
  })

  it('clamps altitude to the FAA 400ft ceiling', () => {
    const high = parsePlanResponse(
      wrap([airPosition({ altitudeFeet: 2500 })]),
      LENSES,
      true,
      DRONE_CAMERAS,
    )
    expect(high.ok && high.positions[0].altitudeFeet).toBe(400)
  })

  it('falls back to a sane altitude when the model omits it', () => {
    const result = parsePlanResponse(
      wrap([airPosition({ altitudeFeet: undefined })]),
      LENSES,
      true,
      DRONE_CAMERAS,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.positions[0].altitudeFeet).toBeGreaterThan(0)
    expect(result.positions[0].altitudeFeet).toBeLessThanOrEqual(400)
  })
})

/*
 * THE AIR 3S IS NOT A ZOOM. It has two cameras, fixed at 24mm and 70mm
 * equivalent. The kit used to model it as a focal RANGE, which let the model ask
 * for a focal length the aircraft cannot produce and the app drew a cone for a
 * shot that could never be taken.
 */
describe('the Air 3S has exactly two focal lengths', () => {
  const parse = (over: Record<string, unknown>) =>
    parsePlanResponse(wrap([airPosition(over)]), LENSES, true, DRONE_CAMERAS)

  it('accepts the wide camera at 24mm', () => {
    const result = parse({ lensId: 'air-3s-wide', focalLength: 24 })
    expect(result.ok && result.positions[0].focalLength).toBe(24)
  })

  it('accepts the tele camera at 70mm', () => {
    const result = parse({ lensId: 'air-3s-tele', focalLength: 70 })
    expect(result.ok && result.positions[0].focalLength).toBe(70)
  })

  it('REJECTS an invented focal length in between', () => {
    for (const focalLength of [35, 45, 50, 60]) {
      expect(parse({ lensId: 'air-3s-wide', focalLength }).ok).toBe(false)
    }
  })

  it('rejects the wide camera asked to be the tele, and the reverse', () => {
    expect(parse({ lensId: 'air-3s-wide', focalLength: 70 }).ok).toBe(false)
    expect(parse({ lensId: 'air-3s-tele', focalLength: 24 }).ok).toBe(false)
  })

  /*
   * Rejected, not snapped to the nearest. Silently moving 45mm to 24mm would keep
   * the shot text, which was written about a framing the aircraft cannot produce.
   * A dropped position is visible; a quietly rewritten one is not.
   */
  it('drops the position rather than snapping it to the nearest camera', () => {
    const result = parsePlanResponse(
      wrap([
        airPosition({ focalLength: 45 }),
        { ...airPosition(), lensId: 'air-3s-tele', focalLength: 70 },
      ]),
      LENSES,
      true,
      DRONE_CAMERAS,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.positions).toHaveLength(1)
    expect(result.positions[0].focalLength).toBe(70)
    expect(result.dropped).toBe(1)
  })

  it('refuses a ground lens on an air position', () => {
    expect(parse({ lensId: 'sony-200-600', focalLength: 400 }).ok).toBe(false)
  })

  it('refuses a drone camera on a ground position', () => {
    const result = parsePlanResponse(
      wrap([position({ lensId: 'air-3s-wide', focalLength: 24, platform: 'ground' })]),
      LENSES,
      true,
      DRONE_CAMERAS,
    )
    expect(result.ok).toBe(false)
  })
})
