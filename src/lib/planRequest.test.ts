import { describe, expect, it } from 'vitest'
import { defaultSelection } from './kitSelection.ts'
import { DEFAULT_KIT } from '../core/kit.ts'
import {
  buildGenerateBody,
  GENERATE_STAGES,
  selectedLenses,
  stageIndex,
  stageLabel,
  stripDataUrl,
} from './planRequest.ts'
import { CALIBRATION_VENUE } from './venue.ts'

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

describe('buildGenerateBody', () => {
  const body = buildGenerateBody(CALIBRATION_VENUE, defaultSelection(DEFAULT_KIT), capture)

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

  it('sends no lighting, bearing, or sun information of any kind', () => {
    // The model is never given the answer it is forbidden from producing.
    const serialized = JSON.stringify(body).toLowerCase()
    for (const banned of ['azimuth', 'backlit', 'front-lit', 'side-lit', 'bearing', 'sunaz']) {
      expect(serialized).not.toContain(banned)
    }
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
