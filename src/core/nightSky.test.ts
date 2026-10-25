import { describe, expect, it } from 'vitest'
import { equatorialToHorizontal } from './celestial.ts'
import { nightSky, tonightMoment } from './nightSky.ts'

const lat = 38.5285
const lon = -78.4383

describe("tonight's sky", () => {
  const at = tonightMoment(new Date('2026-10-22T17:00:00Z'), lat, lon)

  it('draws it in the dark: the moment is after dusk', () => {
    expect(at.getTime()).toBeGreaterThan(new Date('2026-10-22T23:00:00Z').getTime())
  })

  it('puts the celestial pole due north at the latitude', () => {
    const pole = nightSky(at, lat, lon).find((t) => t.kind === 'pole')
    expect(pole).toMatchObject({ azimuth: 0, altitude: lat })
    expect(nightSky(at, -33.9, 18.4).find((t) => t.kind === 'pole')).toMatchObject({ azimuth: 180, altitude: 33.9 })
  })

  /* Polaris, RA 37.95 Dec +89.26, is within a degree of the pole: the conversion agrees with itself. */
  it('agrees with the star the pole is found by', () => {
    const polaris = equatorialToHorizontal(37.95, 89.26, lat, lon, at)
    expect(Math.abs(polaris.altitude - lat)).toBeLessThan(1)
  })

  it('shows a shower radiant near its peak and not months away', () => {
    expect(nightSky(at, lat, lon).some((t) => t.name === 'Orionids radiant')).toBe(true)
    const june = tonightMoment(new Date('2026-06-22T17:00:00Z'), lat, lon)
    expect(nightSky(june, lat, lon).some((t) => t.kind === 'radiant')).toBe(false)
  })
})
