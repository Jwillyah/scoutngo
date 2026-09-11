import { describe, expect, it } from 'vitest'
import { defaultSelection } from './kitSelection.ts'
import { DEFAULT_KIT } from '../core/kit.ts'
import {
  buildGenerateBody,
  GENERATE_STAGES,
  selectedLenses,
  selectedOptics,
  stageIndex,
  stageLabel,
  stripDataUrl,
  sunFacts,
} from './planRequest.ts'
import { CALIBRATION_VENUE, resolveWindow } from './venue.ts'

const capture = {
  dataUrl: 'data:image/jpeg;base64,AAAA',
  mediaType: 'image/jpeg',
  bounds: { west: -75.61, south: 38.36, east: -75.6, north: 38.37 },
}

describe('stripDataUrl', () => {
  it('drops the data URL prefix the canvas adds', () => {
    expect(stripDataUrl('data:image/jpeg;base64,AAAA')).toBe('AAAA')
  })

  it('leaves bare base64 alone', () => {
    expect(stripDataUrl('AAAA')).toBe('AAAA')
  })
})

describe('selectedLenses', () => {
  it('offers only the lenses actually coming on the shoot', () => {
    const kit = { ...defaultSelection(DEFAULT_KIT), lensIds: ['sony-200-600'] }
    expect(selectedLenses(kit).map((l) => l.id)).toEqual(['sony-200-600'])
  })

  it('carries the real focal range so the model cannot invent one', () => {
    const kit = { ...defaultSelection(DEFAULT_KIT), lensIds: ['sony-200-600'] }
    expect(selectedLenses(kit)[0]).toMatchObject({ min: 200, max: 600 })
  })
})

describe('sunFacts', () => {
  const venueWindow = resolveWindow(CALIBRATION_VENUE)!
  const facts = sunFacts(venueWindow)

  it('covers the start, the middle and the end of the window', () => {
    expect(facts.map((f) => f.label)).toEqual(['Start', 'Mid', 'End'])
    expect(facts.map((f) => f.clock)).toEqual(['11:00', '13:00', '15:00'])
  })

  /*
   * Same numbers the SunReadout shows, from the same core function. If these ever
   * diverge, the model is being told one thing and the shooter shown another.
   */
  it('matches the solar core, in venue local time', () => {
    expect(facts[1].azimuth).toBeCloseTo(180.6, 1)
    expect(facts[0].azimuth).toBeCloseTo(134.4, 1)
    for (const fact of facts) expect(fact.altitude).toBeGreaterThan(0)
  })

  it('tracks the sun westward across the window', () => {
    expect(facts[1].azimuth).toBeGreaterThan(facts[0].azimuth)
    expect(facts[2].azimuth).toBeGreaterThan(facts[1].azimuth)
  })
})

describe('selectedOptics', () => {
  const optics = selectedOptics(defaultSelection(DEFAULT_KIT))
  const byId = (id: string) => optics.find((o) => o.id === id)!

  it('carries ground lenses and drone cameras together', () => {
    expect(byId('sony-200-600').kind).toBe('lens')
    expect(byId('air-3s-wide').kind).toBe('drone')
    expect(byId('air-3s-tele').kind).toBe('drone')
  })

  it('gives a drone camera one focal length, not a range', () => {
    const wide = byId('air-3s-wide')
    expect(wide.minFocalLength).toBe(24)
    expect(wide.maxFocalLength).toBe(24)
  })

  /*
   * The whole point of Job 2: the model is TOLD how far back it may stand, as a
   * number computed by src/core/fov.ts, rather than left to guess. A longer lens
   * reaches further, and nothing reaches past the practical cap.
   */
  it('sends a standoff that grows with focal length and is capped', () => {
    expect(byId('sigma-28-75').maxStandoffAtMin).toBeLessThan(
      byId('sigma-28-75').maxStandoffAtMax,
    )
    expect(byId('sony-200-600').maxStandoffAtMin).toBeGreaterThan(
      byId('sigma-28-75').maxStandoffAtMax,
    )
    for (const optic of optics) {
      expect(optic.maxStandoffAtMax).toBeLessThanOrEqual(450)
      expect(optic.maxStandoffAtMin).toBeGreaterThan(0)
    }
  })
})

describe('buildGenerateBody', () => {
  const venueWindow = resolveWindow(CALIBRATION_VENUE)!
  const body = buildGenerateBody(
    CALIBRATION_VENUE,
    defaultSelection(DEFAULT_KIT),
    capture,
    undefined,
    'EDT, UTC-4',
    sunFacts(venueWindow),
  )

  it('sends the venue text context', () => {
    expect(body.venueName).toContain('Brew River')
    expect(body.event).toContain('north bank')
    expect(body.startTime).toBe('11:00')
    expect(body.endTime).toBe('15:00')
  })

  it('sends the map bounds and the stripped image', () => {
    expect(body.bounds).toEqual(capture.bounds)
    expect(body.image).toBe('AAAA')
  })

  /*
   * THIS TEST USED TO ASSERT THE OPPOSITE, and the reversal is deliberate.
   *
   * It read "sends no lighting, bearing, or sun information of any kind", on the
   * theory that withholding the answer was what stopped the model producing one.
   * That was the wrong lever. It left the model placing positions blind to the
   * light and the app labelling the result afterwards, which is how positions
   * ended up in a field on the wrong bank.
   *
   * Sun azimuth and altitude now go OUT as computed fact. What protects the
   * lighting call is not secrecy, it is that nothing comes back: there is no
   * lighting field in the parser, and src/core/lighting.ts recomputes every call
   * from the returned coordinates. That invariant is pinned in parsePlan.test.ts.
   */
  it('sends the sun as computed fact, so positions are not placed blind', () => {
    expect(body.sun).toHaveLength(3)
    expect(body.sun[0]).toMatchObject({ label: 'Start', clock: '11:00' })
    for (const fact of body.sun) {
      expect(typeof fact.azimuth).toBe('number')
      expect(typeof fact.altitude).toBe('number')
    }
  })

  it('sends the standoff limits, so distance is bounded rather than guessed', () => {
    expect(body.optics.length).toBeGreaterThan(0)
    for (const optic of body.optics) {
      expect(optic.maxStandoffAtMax).toBeGreaterThan(0)
    }
  })

  it('no longer assigns a body, because that is a decision made on the day', () => {
    expect(body).not.toHaveProperty('bodies')
  })
})

describe('generate stages', () => {
  it('names the four real steps, in the order the code takes them', () => {
    expect(GENERATE_STAGES.map((stage) => stage.key)).toEqual([
      'capture',
      'terrain',
      'positions',
      'lighting',
    ])
  })

  it('orders strictly, so a later stage never reads as earlier progress', () => {
    expect(stageIndex('capture')).toBe(0)
    expect(stageIndex('terrain')).toBeGreaterThan(stageIndex('capture'))
    expect(stageIndex('positions')).toBeGreaterThan(stageIndex('terrain'))
    expect(stageIndex('lighting')).toBeGreaterThan(stageIndex('positions'))
  })

  it('gives every stage a label that says what is happening', () => {
    for (const stage of GENERATE_STAGES) {
      expect(stageLabel(stage.key)).toBe(stage.label)
      expect(stageLabel(stage.key).length).toBeGreaterThan(0)
    }
  })

  /*
   * The stage is the only progress signal, so it has to be a step and not a clock.
   * Nothing in here may mention seconds, percentages, or an estimate: the app has
   * no idea how long Overpass or the model will take, and saying otherwise would be
   * inventing a number.
   */
  it('promises no duration it cannot know', () => {
    const text = GENERATE_STAGES.map((stage) => stage.label).join(' ').toLowerCase()
    for (const banned of ['second', 'minute', '%', 'almost', 'nearly', 'soon']) {
      expect(text).not.toContain(banned)
    }
  })
})
