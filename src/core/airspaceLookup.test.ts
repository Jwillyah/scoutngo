import { describe, expect, it } from 'vitest'
import {
  AUTHORIZATION_RULE,
  NO_SURFACE_AIRSPACE_NOTE,
  TFR_NOT_CHECKED,
  airspaceAt,
  authorizationState,
  decodeShape,
  type AirspaceShape,
} from './airspaceLookup.ts'

/** A unit square from (0,0) to (1,1), encoded the way the bake script writes. */
const SQUARE = {
  cls: 'D',
  local: 'CLASS_D',
  name: 'ALPHA CLASS D',
  upper: 2500,
  upperUom: 'FT',
  bbox: [0, 0, 100000, 100000],
  /* Deltas at precision 1e5: (0,0) (1,0) (1,1) (0,1) (0,0). */
  rings: ['0:0,255s:0,0:255s,-255s:0,0:-255s'],
}

describe('decoding', () => {
  const shape = decodeShape(SQUARE, 100000)

  it('rebuilds the ring as flat lon/lat degrees', () => {
    expect(shape.rings).toHaveLength(1)
    expect(shape.rings[0]).toEqual([0, 0, 1, 0, 1, 1, 0, 1, 0, 0])
  })

  it('rebuilds the bounding box in degrees', () => {
    expect(shape.bbox).toEqual([0, 0, 1, 1])
  })

  it('carries the chart own description through', () => {
    expect(shape.cls).toBe('D')
    expect(shape.local).toBe('CLASS_D')
    expect(shape.upper).toBe(2500)
  })
})

describe('point in polygon', () => {
  const square = decodeShape(SQUARE, 100000)

  it('finds a pin inside', () => {
    expect(airspaceAt([square], { lat: 0.5, lon: 0.5 })).toHaveLength(1)
  })

  it('rejects a pin outside', () => {
    for (const at of [
      { lat: 1.5, lon: 0.5 },
      { lat: 0.5, lon: 1.5 },
      { lat: -0.5, lon: 0.5 },
      { lat: 0.5, lon: -0.5 },
    ]) {
      expect(airspaceAt([square], at), JSON.stringify(at)).toHaveLength(0)
    }
  })

  it('rejects a pin that is only inside the bounding box', () => {
    /* A triangle: the bbox corner is in the box but outside the shape. */
    const triangle: AirspaceShape = {
      ...square,
      rings: [[0, 0, 1, 0, 0, 1, 0, 0]],
    }
    expect(airspaceAt([triangle], { lat: 0.9, lon: 0.9 })).toHaveLength(0)
    expect(airspaceAt([triangle], { lat: 0.1, lon: 0.1 })).toHaveLength(1)
  })

  /*
   * Real Class D surface areas have cut-outs around neighbouring fields. A pin
   * in the hole is outside the airspace, and treating the first ring as the
   * only ring would report authorization where none attaches.
   */
  it('treats inner rings as holes', () => {
    const holed: AirspaceShape = {
      ...square,
      rings: [
        [0, 0, 1, 0, 1, 1, 0, 1, 0, 0],
        [0.4, 0.4, 0.6, 0.4, 0.6, 0.6, 0.4, 0.6, 0.4, 0.4],
      ],
    }
    expect(airspaceAt([holed], { lat: 0.5, lon: 0.5 })).toHaveLength(0)
    expect(airspaceAt([holed], { lat: 0.2, lon: 0.2 })).toHaveLength(1)
  })

  /* A pin can genuinely be in a Class C and a neighbouring Class D at once. */
  it('returns every shape containing the pin, not just the first', () => {
    const other: AirspaceShape = { ...square, cls: 'C', name: 'BRAVO CLASS C' }
    const hits = airspaceAt([square, other], { lat: 0.5, lon: 0.5 })
    expect(hits.map((h) => h.cls)).toEqual(['D', 'C'])
  })

  it('refuses coordinates that are not coordinates', () => {
    expect(airspaceAt([square], { lat: Number.NaN, lon: 0.5 })).toHaveLength(0)
  })
})

describe('the authorization state', () => {
  const square = decodeShape(SQUARE, 100000)

  it('is in-surface-airspace when a polygon contains the pin', () => {
    expect(authorizationState(airspaceAt([square], { lat: 0.5, lon: 0.5 }))).toBe(
      'in-surface-airspace',
    )
  })

  /*
   * NOT 'clear' AND NOT false. The state names what the extract shows, because
   * a boolean here would invite a caller to render "no authorization needed",
   * which this dated, generalised extract cannot support on its own.
   */
  it('names an empty result as an absence in the extract', () => {
    expect(authorizationState([])).toBe('no-surface-airspace-in-extract')
  })
})

describe('the stated wording', () => {
  it('states the rule with its classes', () => {
    expect(AUTHORIZATION_RULE).toContain('107.41')
    expect(AUTHORIZATION_RULE).toContain('at the surface')
    for (const cls of ['Class B', 'C, D', 'surface-area Class E']) {
      expect(AUTHORIZATION_RULE).toContain(cls)
    }
  })

  /* Silence about TFRs would be the same lie as an unmarked power line. */
  it('says plainly that TFRs are not checked, and where to look', () => {
    expect(TFR_NOT_CHECKED).toContain('NOT checked')
    expect(TFR_NOT_CHECKED).toContain('tfr.faa.gov')
  })

  /*
   * THE SENTENCE MOST LIKELY TO DRIFT INTO A CLEARANCE. "Nothing found" wants
   * to become "no authorization needed"; this pins it to a statement about an
   * extract instead.
   */
  it('reports an empty result as an absence in the extract, not as permission', () => {
    expect(NO_SURFACE_AIRSPACE_NOTE).toContain('this extract')
    const lower = NO_SURFACE_AIRSPACE_NOTE.toLowerCase()
    expect(lower).not.toContain('uncontrolled')
    expect(lower).not.toContain('no authorization')
    expect(lower).not.toContain('class g')
    expect(lower).not.toContain('clear')
  })

  it('states no verdict anywhere', () => {
    const shown = [AUTHORIZATION_RULE, NO_SURFACE_AIRSPACE_NOTE, TFR_NOT_CHECKED]
      .join(' ')
      .toLowerCase()
    for (const banned of [
      'cleared',
      'compliant',
      'legal',
      'permitted',
      'you may fly',
      'no restrictions',
      'clear of',
      'safe to fly',
    ]) {
      expect(shown, `contains "${banned}"`).not.toContain(banned)
    }
  })
})

describe('the shipped extract', () => {
  it('puts a known Class B pin in Class B', async () => {
    const { airspaceAnswer } = await import('../lib/airspace.ts')
    /* Reagan National, which is inside the Washington Class B. */
    const answer = await airspaceAnswer({ lat: 38.8512, lon: -77.0402 })
    expect(answer.state).toBe('in-surface-airspace')
    expect(answer.hits.map((h) => h.cls)).toContain('B')
  })

  it('reports Sandbridge as carrying no surface-area class in the extract', async () => {
    const { airspaceAnswer } = await import('../lib/airspace.ts')
    const answer = await airspaceAnswer({ lat: 36.726, lon: -75.94 })
    /*
     * THE CASE THE FACILITY MAP COULD NOT ANSWER. The grid has no cell here, so
     * on its own the only available statement was "no data". The airspace
     * extract is what makes the useful answer sayable.
     */
    expect(answer.state).toBe('no-surface-airspace-in-extract')
    expect(answer.hits).toHaveLength(0)
  })

  it('states its own boundary slop rather than implying an exact edge', async () => {
    const { airspaceAnswer } = await import('../lib/airspace.ts')
    const answer = await airspaceAnswer({ lat: 36.726, lon: -75.94 })
    expect(answer.boundaryMetres).toBeGreaterThan(0)
    expect(answer.boundaryMetres).toBeLessThan(100)
  })
})
