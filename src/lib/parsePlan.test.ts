import { describe, expect, it } from 'vitest'
import { capWords, extractJsonObject, parsePlanResponse, type LensSpec } from './parsePlan.ts'

const LENSES: LensSpec[] = [
  { id: 'sony-200-600', name: 'Sony 200-600', min: 200, max: 600 },
  { id: 'sigma-28-75', name: 'Sigma 28-75 f2.8', min: 28, max: 75 },
]

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
      'platform',
      'altitudeFeet',
    ])
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
    const result = parsePlanResponse(
      wrap([position({ platform: 'air', altitudeFeet: 200 })]),
      LENSES,
      false,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.positions[0].platform).toBe('ground')
    expect(result.positions[0].altitudeFeet).toBe(0)
  })

  it('accepts one when a drone is in the kit', () => {
    const result = parsePlanResponse(
      wrap([position({ platform: 'air', altitudeFeet: 220 })]),
      LENSES,
      true,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.positions[0].platform).toBe('air')
    expect(result.positions[0].altitudeFeet).toBe(220)
  })

  it('clamps altitude to the FAA 400ft ceiling', () => {
    const high = parsePlanResponse(
      wrap([position({ platform: 'air', altitudeFeet: 2500 })]),
      LENSES,
      true,
    )
    expect(high.ok && high.positions[0].altitudeFeet).toBe(400)
  })

  it('falls back to a sane altitude when the model omits it', () => {
    const result = parsePlanResponse(wrap([position({ platform: 'air' })]), LENSES, true)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.positions[0].altitudeFeet).toBeGreaterThan(0)
    expect(result.positions[0].altitudeFeet).toBeLessThanOrEqual(400)
  })
})
