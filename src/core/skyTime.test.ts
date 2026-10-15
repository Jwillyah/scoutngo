import { describe, expect, it } from 'vitest'
import {
  boundaryNote,
  FORECAST_OPACITY,
  FORECAST_TRUST_HOURS,
  FORECAST_TRUST_NOTE,
  forecastTrust,
  FRAME_FAR_MINUTES,
  skySourceFor,
} from './skyTime.ts'

const NOW = new Date('2026-10-15T15:00:00Z')
/** Ten minute steps, which is what GIBS actually serves. */
const snap = (at: Date) => new Date(Math.floor(at.getTime() / 600_000) * 600_000)

/*
 * THE HARD LIMIT: THERE IS NO SATELLITE IMAGE OF THE FUTURE.
 *
 * Past and now get a real frame; the future gets a model. They are never
 * blended and never share a caption, because a model result under a label
 * that says observed is the exact failure this split exists to avoid.
 */
describe('which source answers for a moment', () => {
  it('shows a real frame for the past', () => {
    const source = skySourceFor(new Date('2026-10-15T09:07:00Z'), NOW, snap)
    expect(source.kind).toBe('satellite')
    if (source.kind !== 'satellite') return
    expect(source.frameAt.toISOString()).toBe('2026-10-15T09:00:00.000Z')
  })

  it('shows a real frame for now itself', () => {
    const source = skySourceFor(NOW, NOW, snap)
    expect(source.kind).toBe('satellite')
  })

  it('switches to a model the moment the scrub passes now', () => {
    const source = skySourceFor(new Date(NOW.getTime() + 60_000), NOW, snap)
    expect(source.kind).toBe('forecast')
  })

  /*
   * THE FRAME SHOWN IS NOT THE MOMENT ASKED FOR, and the offset is reported
   * so the reader knows how far the picture is from where they are scrubbing.
   */
  it('reports how far the frame is from the scrub point', () => {
    const source = skySourceFor(new Date('2026-10-15T09:07:00Z'), NOW, snap)
    if (source.kind !== 'satellite') throw new Error('expected satellite')
    expect(source.offsetMinutes).toBeCloseTo(7, 6)
    expect(source.far).toBe(false)
  })

  it('calls it far when the nearest frame is more than a scan away', () => {
    const coarse = (at: Date) => new Date(Math.floor(at.getTime() / 3_600_000) * 3_600_000)
    const source = skySourceFor(new Date('2026-10-15T09:55:00Z'), NOW, coarse)
    if (source.kind !== 'satellite') throw new Error('expected satellite')
    expect(source.offsetMinutes).toBeCloseTo(55, 6)
    expect(source.far).toBe(true)
    expect(FRAME_FAR_MINUTES).toBe(10)
  })

  it('never reports a negative offset', () => {
    for (const minutes of [0, 1, 5, 9, 10, 37, 59]) {
      const at = new Date(NOW.getTime() - minutes * 60_000)
      const source = skySourceFor(at, NOW, snap)
      if (source.kind !== 'satellite') continue
      expect(source.offsetMinutes).toBeGreaterThanOrEqual(0)
    }
  })
})

/*
 * AND THE FORECAST DEGRADES. Every weather app draws the same confident
 * picture at four hours and at ten days. This one does not.
 */
describe('how far ahead a forecast is worth drawing', () => {
  it('bands by hours ahead', () => {
    expect(forecastTrust(1)).toBe('near')
    expect(forecastTrust(FORECAST_TRUST_HOURS.near)).toBe('near')
    expect(forecastTrust(FORECAST_TRUST_HOURS.near + 1)).toBe('medium')
    expect(forecastTrust(FORECAST_TRUST_HOURS.medium)).toBe('medium')
    expect(forecastTrust(FORECAST_TRUST_HOURS.medium + 1)).toBe('far')
    expect(forecastTrust(FORECAST_TRUST_HOURS.far)).toBe('far')
    expect(forecastTrust(FORECAST_TRUST_HOURS.far + 1)).toBe('beyond')
  })

  /* The degradation IS the honesty: fainter as it gets further out. */
  it('draws it fainter the further out it is', () => {
    expect(FORECAST_OPACITY.near).toBeGreaterThan(FORECAST_OPACITY.medium)
    expect(FORECAST_OPACITY.medium).toBeGreaterThan(FORECAST_OPACITY.far)
    expect(FORECAST_OPACITY.far).toBeGreaterThan(FORECAST_OPACITY.beyond)
  })

  /*
   * AND NOT AT ALL PAST A WEEK. A cloud map at that range would look exactly
   * as confident as one for tomorrow, and it is not.
   */
  it('draws nothing past a week', () => {
    expect(FORECAST_OPACITY.beyond).toBe(0)
    const source = skySourceFor(
      new Date(NOW.getTime() + 10 * 24 * 3_600_000),
      NOW,
      snap,
    )
    if (source.kind !== 'forecast') throw new Error('expected forecast')
    expect(source.trust).toBe('beyond')
    expect(source.draw).toBe(false)
  })

  it('draws everything inside a week', () => {
    for (const hours of [1, 12, 24, 48, 72, 120, 167]) {
      const source = skySourceFor(new Date(NOW.getTime() + hours * 3_600_000), NOW, snap)
      if (source.kind !== 'forecast') throw new Error('expected forecast')
      expect(source.draw, `${hours}h`).toBe(true)
    }
  })

  it('says what a forecast at each range is worth', () => {
    for (const trust of ['near', 'medium', 'far', 'beyond'] as const) {
      expect(FORECAST_TRUST_NOTE[trust].length).toBeGreaterThan(30)
    }
    /* None of them overclaims. */
    for (const note of Object.values(FORECAST_TRUST_NOTE)) {
      const text = note.toLowerCase()
      for (const word of ['accurate', 'will be', 'certain', 'reliable']) {
        expect(text, note).not.toContain(word)
      }
    }
  })

  /*
   * THE NUMBER ON SCREEN AND THE SENTENCE UNDER IT MUST AGREE.
   *
   * Measured in the browser at 24.4 hours out: the key read "24 h ahead"
   * beside the two-to-three-days note, because the display rounded and the
   * band did not. Rounding once, in forecastTrust, is what fixes it.
   */
  it('bands on the hours as they are displayed, so the pair never contradicts', () => {
    expect(forecastTrust(24.4)).toBe('near')
    expect(forecastTrust(24.6)).toBe('medium')
    expect(forecastTrust(72.4)).toBe('medium')
    expect(forecastTrust(72.6)).toBe('far')
    expect(forecastTrust(168.4)).toBe('far')
    expect(forecastTrust(168.6)).toBe('beyond')
  })

  it('agrees with its own rounded display at every half hour for a fortnight', () => {
    for (let h = 0.5; h <= 336; h += 0.5) {
      const shown = Math.round(h)
      expect(forecastTrust(h), `${h}h shown as ${shown}h`).toBe(forecastTrust(shown))
    }
  })

  it('reports the hours ahead so the reader can judge for themselves', () => {
    const source = skySourceFor(new Date(NOW.getTime() + 30 * 3_600_000), NOW, snap)
    if (source.kind !== 'forecast') throw new Error('expected forecast')
    expect(source.hoursAhead).toBeCloseTo(30, 6)
  })
})

/*
 * THE BOUNDARY IS SAID. The reader needs the exact point where they stop
 * looking at what happened and start looking at what a model thinks.
 */
describe('the boundary between them', () => {
  it('names the moment the split falls on', () => {
    const note = boundaryNote(NOW, (at) => at.toISOString().slice(11, 16))
    expect(note).toContain('15:00')
    expect(note).toContain('Satellite up to')
    expect(note).toContain('forecast after it')
  })
})
