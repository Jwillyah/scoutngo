import { describe, expect, it } from 'vitest'
import {
  GOES_ATTRIBUTION,
  GOES_LAYER,
  GOES_MAX_TILE_ZOOM,
  GOES_GROUND_METERS,
  goesDetailZoom,
  satellitePixelOnScreen,
  zoomAdvice,
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
      expect(GOES_LAYER[band]).toMatch(/^GOES-East_ABI_/)
    }
  })

  /*
   * The two channels this app uses, pinned. ch02 is the 0.5km visible red and
   * ch13 is the 2km clean longwave IR; swapping them would silently show the
   * wrong picture at the wrong time of day.
   */
  it('uses band 2 for visible and band 13 for infrared', () => {
    expect(GOES_LAYER.visible).toContain('Band2_Red_Visible')
    expect(GOES_LAYER.infrared).toContain('Band13_Clean_Infrared')
  })

  /* Two parties did different things and both are credited. */
  it('credits NOAA for the data and NASA GIBS for the tiles', () => {
    expect(GOES_ATTRIBUTION).toContain('NOAA')
    expect(GOES_ATTRIBUTION).toContain('NASA GIBS')
  })

  it('knows how often the sector is scanned', () => {
    expect(GOES_SCAN_MINUTES).toBe(5)
  })
})

/*
 * WHEN THE LAYER STOPS CARRYING DETAIL, computed from the band's ground
 * sample distance rather than from a zoom somebody picked by looking at it.
 *
 * MEASURED at Virginia Beach, 36.85N, on a 390px screen: how many SCREEN
 * pixels one satellite pixel covers.
 *
 *   zoom  7    61 mi scale      IR 2px      reads properly
 *   zoom  9    15 mi scale      IR 8px      still real detail
 *   zoom 13     1 mi scale      IR 131px    a third of the screen, one pixel
 *   zoom 16   627 ft scale      IR 1046px   2.7 screens, one pixel
 *
 * Which is the reported symptom exactly: at a 500ft scale bar one satellite
 * pixel covers the whole screen and the layer is a flat wash that looks
 * broken. The layer was fine; the zoom was wrong.
 */
describe('the zoom at which the sky layer is still worth showing', () => {
  const VB_LAT = 36.85
  const W = 390

  it('reproduces the measured pixel coverage', () => {
    expect(satellitePixelOnScreen('infrared', VB_LAT, 7)).toBeCloseTo(2, 0)
    expect(satellitePixelOnScreen('infrared', VB_LAT, 9)).toBeCloseTo(8, 0)
    expect(Math.round(satellitePixelOnScreen('infrared', VB_LAT, 13))).toBe(131)
    expect(Math.round(satellitePixelOnScreen('infrared', VB_LAT, 16))).toBe(1046)
  })

  it('puts the infrared limit near zoom 12.6 and visible one level deeper', () => {
    expect(goesDetailZoom('infrared', VB_LAT, W)).toBeCloseTo(12.58, 1)
    expect(goesDetailZoom('visible', VB_LAT, W)).toBeCloseTo(13.58, 1)
    /* Visible is a finer band, so it survives exactly one more doubling. */
    expect(goesDetailZoom('visible', VB_LAT, W) - goesDetailZoom('infrared', VB_LAT, W))
      .toBeCloseTo(1, 6)
  })

  it('is derived from the band resolution, not hardcoded', () => {
    expect(GOES_GROUND_METERS.infrared).toBe(2000)
    expect(GOES_GROUND_METERS.visible).toBe(1000)
    // Halving the ground sample buys one zoom level, which is the relationship.
    const coarse = goesDetailZoom('infrared', VB_LAT, W)
    const fine = goesDetailZoom('visible', VB_LAT, W)
    expect(2 ** (fine - coarse)).toBeCloseTo(
      GOES_GROUND_METERS.infrared / GOES_GROUND_METERS.visible,
      6,
    )
  })

  it('says nothing at a zoom where the layer reads', () => {
    const advice = zoomAdvice('infrared', VB_LAT, W, 8)
    expect(advice.readable).toBe(true)
    expect(advice.message).toBeNull()
    expect(advice.zoomOutTo).toBeNull()
  })

  it('tells you to zoom out at the scale the complaint came from', () => {
    const advice = zoomAdvice('infrared', VB_LAT, W, 16)
    expect(advice.readable).toBe(false)
    expect(advice.message).toContain('Too close for the sky layer')
    expect(advice.message).toContain('Zoom out')
    expect(advice.zoomOutTo).toBe(12)
  })

  it('says how bad it is rather than just that it is bad', () => {
    expect(zoomAdvice('infrared', VB_LAT, W, 17).message).toMatch(/screens|whole screen/)
    expect(zoomAdvice('infrared', VB_LAT, W, 13).message).toContain('% of the screen')
  })

  /*
   * The tile matrix sets cap at these levels, which is where GIBS stops having
   * tiles at all. The readable limit is deeper than the tile limit because a
   * stretched tile still shows real structure for a level or two.
   */
  it('knows where GIBS stops serving tiles', () => {
    expect(GOES_MAX_TILE_ZOOM.infrared).toBe(6)
    expect(GOES_MAX_TILE_ZOOM.visible).toBe(7)
    for (const band of ['visible', 'infrared'] as const) {
      expect(goesDetailZoom(band, VB_LAT, W)).toBeGreaterThan(GOES_MAX_TILE_ZOOM[band])
    }
  })

  it('needs a wider view at a wider screen', () => {
    expect(goesDetailZoom('infrared', VB_LAT, 1200)).toBeGreaterThan(
      goesDetailZoom('infrared', VB_LAT, 390),
    )
  })
})
