import { describe, expect, it } from 'vitest'
import {
  GOES_ATTRIBUTION,
  GOES_BAND_CHANNEL,
  GOES_BAND_LABEL,
  GOES_BAND_NOTE,
  GOES_SCAN_MINUTES,
  goesBandFor,
  VISIBLE_USABLE_ABOVE_DEGREES,
} from './goes.ts'
import { sunBand } from './sunBand.ts'

/*
 * THE BAND IS CHOSEN FROM THE SUN, NOT FROM A SETTING.
 *
 * Band 2 is visible light, so it is BLACK before sunrise. Band 13 sees cloud
 * by its temperature and works in the dark. Making the shooter remember to
 * switch is how somebody stares at a black rectangle at 05:40 and concludes
 * the feature is broken.
 */
describe('which GOES band to show', () => {
  it('uses infrared before sunrise, which is when this app is used most', () => {
    expect(goesBandFor(-15)).toBe('infrared')
    expect(goesBandFor(-6)).toBe('infrared')
    expect(goesBandFor(-4)).toBe('infrared')
    expect(goesBandFor(0)).toBe('infrared')
  })

  it('keeps infrared through the first few degrees, where visible is still dark', () => {
    expect(goesBandFor(1)).toBe('infrared')
    expect(goesBandFor(VISIBLE_USABLE_ABOVE_DEGREES)).toBe('infrared')
  })

  it('switches to visible once there is light to reflect', () => {
    expect(goesBandFor(VISIBLE_USABLE_ABOVE_DEGREES + 0.1)).toBe('visible')
    expect(goesBandFor(30)).toBe('visible')
  })

  /*
   * THE WHOLE PRE-SUNRISE SHOOT GETS A BAND THAT WORKS. These are the measured
   * altitudes of the Lesner Bridge sunrise window that used to be described as
   * having nothing to light with.
   */
  it('covers every band of a pre-sunrise window with infrared', () => {
    for (const altitude of [-15.53, -12.54, -9.55, -6.57, -3.61, -0.67]) {
      expect(goesBandFor(altitude), `altitude ${altitude}`).toBe('infrared')
      // And those really are the twilight bands, not daylight.
      expect(['night', 'nautical', 'blue-hour', 'afterglow']).toContain(sunBand(altitude))
    }
  })

  it('names and explains both bands, and says which satellite', () => {
    for (const band of ['visible', 'infrared'] as const) {
      expect(GOES_BAND_LABEL[band]).toBeTruthy()
      expect(GOES_BAND_NOTE[band]).toContain('GOES-19')
      expect(GOES_BAND_CHANNEL[band]).toMatch(/^conus_ch\d\d$/)
    }
  })

  /*
   * The two channels this app uses, pinned. ch02 is the 0.5km visible red and
   * ch13 is the 2km clean longwave IR; swapping them would silently show the
   * wrong picture at the wrong time of day.
   */
  it('uses band 2 for visible and band 13 for infrared', () => {
    expect(GOES_BAND_CHANNEL.visible).toBe('conus_ch02')
    expect(GOES_BAND_CHANNEL.infrared).toBe('conus_ch13')
  })

  /* Two parties did different things and both are credited. */
  it('credits NOAA for the data and IEM for the tiles', () => {
    expect(GOES_ATTRIBUTION).toContain('NOAA')
    expect(GOES_ATTRIBUTION).toContain('Iowa Environmental Mesonet')
  })

  it('knows how often the sector is scanned', () => {
    expect(GOES_SCAN_MINUTES).toBe(5)
  })
})
