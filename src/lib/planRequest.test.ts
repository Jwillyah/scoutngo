import { describe, expect, it } from 'vitest'
import { defaultSelection } from './kitSelection.ts'
import { DEFAULT_KIT } from '../core/kit.ts'
import { buildGenerateBody, selectedLenses, stripDataUrl } from './planRequest.ts'
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
