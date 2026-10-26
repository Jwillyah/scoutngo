import { describe, expect, it } from 'vitest'
import { domePoint, enuToward, skyArc, sunlightEnu } from './sky3d.ts'
import { getSunPosition } from './sun.ts'
import { heightGrid, sourceFor, terrariumMetres } from './terrarium.ts'
import { zonedTimeToUtc } from './timezone.ts'

describe('terrarium', () => {
  it('decodes the packing: 128,0,0 is sea level; each red step is 256 m', () => {
    expect(terrariumMetres(128, 0, 0)).toBe(0)
    expect(terrariumMetres(129, 0, 0)).toBe(256)
    expect(terrariumMetres(128, 10, 128)).toBe(10.5)
  })

  it('cuts deeper tiles from their zoom 15 ancestor', () => {
    expect(sourceFor({ x: 10, y: 20, z: 15 })).toEqual({ tile: { x: 10, y: 20, z: 15 }, u0: 0, v0: 0, span: 1 })
    const deep = sourceFor({ x: 4 * 10 + 3, y: 4 * 20 + 1, z: 17 })
    expect(deep.tile).toEqual({ x: 10, y: 20, z: 15 })
    expect(deep).toMatchObject({ u0: 0.75, v0: 0.25, span: 0.25 })
  })

  it('draws the river bed at the water surface: nothing below sea level', () => {
    const rgba = new Uint8ClampedArray([127, 200, 0, 255, 127, 200, 0, 255, 127, 200, 0, 255, 127, 200, 0, 255])
    expect(terrariumMetres(127, 200, 0)).toBe(-56)
    expect([...heightGrid(rgba, 2, 2)]).toEqual([0, 0, 0, 0])
  })

  it('samples north row first, edge to edge, and reproduces a flat or sloping tile', () => {
    const size = 4
    const rgba = new Uint8ClampedArray(size * size * 4)
    for (let y = 0; y < size; y += 1)
      for (let x = 0; x < size; x += 1) {
        const i = (y * size + x) * 4
        rgba[i] = 128
        rgba[i + 1] = y * 10 /* rises southward */
        rgba[i + 3] = 255
      }
    const g = heightGrid(rgba, size, 3)
    expect(g[0]).toBe(0)
    expect(g[8]).toBe(30)
    expect(g[3]).toBeCloseTo(15, 6)
    expect(g[0]).toBe(g[2])
  })
})

describe('the light and the sky, from suncalc', () => {
  const venue = { lat: 38.3607, lon: -75.6036 }
  it('points the light from the sun toward the ground', () => {
    const at = new Date('2026-09-12T17:00:00Z')
    const sun = getSunPosition(at, venue.lat, venue.lon)
    const toward = enuToward(sun.azimuth, sun.altitude)
    const light = sunlightEnu(at, venue.lat, venue.lon)
    expect(light[2]).toBeLessThan(0)
    for (let i = 0; i < 3; i += 1) expect(light[i]).toBeCloseTo(-toward[i], 10)
    expect(Math.hypot(...light)).toBeCloseTo(1, 10)
  })

  it('compass: east is +x, north is +y', () => {
    const e = enuToward(90, 0)
    expect(e[0]).toBeCloseTo(1, 10)
    const n = enuToward(0, 0)
    expect(n[1]).toBeCloseTo(1, 10)
    expect(domePoint({ azimuth: 0, altitude: 90 }, 500)[2]).toBeCloseTo(500, 6)
  })

  it('draws the sun above the horizon only, with one dot per daylight hour', () => {
    const midnight = zonedTimeToUtc('2026-09-12', '00:00', 'America/New_York')
    if (midnight === null) throw new Error('no midnight')
    const arcs = skyArc('sun', midnight, venue.lat, venue.lon)
    expect(arcs.length).toBe(1)
    for (const s of arcs[0].path) expect(s.altitude).toBeGreaterThanOrEqual(0)
    expect(arcs[0].hours.length).toBeGreaterThanOrEqual(11)
    expect(arcs[0].hours.length).toBeLessThanOrEqual(13)
  })
})

describe('the moon arc', () => {
  it('moves smoothly: the units are degrees, as suncalc 2.0.2 gives them', () => {
    const midnight = zonedTimeToUtc('2026-10-25', '00:00', 'America/New_York')
    if (midnight === null) throw new Error('no midnight')
    const arcs = skyArc('moon', midnight, 38.36, -75.6)
    expect(arcs.length).toBeGreaterThan(0)
    for (const arc of arcs)
      for (let i = 1; i < arc.path.length; i += 1) {
        /* Ten minutes apart, the moon moves a few degrees at most. */
        const d = Math.abs(((arc.path[i].azimuth - arc.path[i - 1].azimuth + 540) % 360) - 180)
        expect(d).toBeLessThan(10)
        expect(Math.abs(arc.path[i].altitude - arc.path[i - 1].altitude)).toBeLessThan(5)
      }
  })
})
