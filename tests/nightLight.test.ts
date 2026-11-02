import { readFileSync } from 'node:fs'
import { getMoonIllumination, getMoonPosition, getPosition } from 'suncalc'
import { describe, expect, it } from 'vitest'
import { nightLight, SKY_GLOW } from '../src/core/nightLight.ts'
import { FINE_TILES, finePatch } from '../src/three/world/ground.ts'
import { latOf, lonOf, tileX, tileY } from '../src/three/world/sources.ts'

/*
 * THE 3D VIEW AT NIGHT (Batch G, Section 9). The oceanfront hotels at the VB
 * pier drew as black slabs at 9:30 PM on 1 Nov; the wall in the screenshot
 * read luminance 13 before and 46 after (measurements/2026-11-02-night-walls.md).
 */
const PIER = { lat: 36.8435575, lon: -75.9713104 }

describe('the light at night', () => {
  it('is none by day, all night past nautical dusk, and smooth between', () => {
    expect(nightLight(20, 30, 1, 12)).toMatchObject({ night: 0, moon: 0, wall: 0, windows: 0 })
    expect(nightLight(-12, -10, 0, 21).night).toBe(1)
    const dusk = nightLight(-6, -10, 0, 18).night
    expect(dusk).toBeGreaterThan(0.3)
    expect(dusk).toBeLessThan(0.7)
  })

  it('a wall at night always gets the sky’s glow, more with the moon up and full', () => {
    expect(nightLight(-30, -20, 1, 22).wall).toBeCloseTo(SKY_GLOW, 6)
    expect(nightLight(-30, 45, 1, 22).wall).toBe(1)
    expect(nightLight(-30, 45, 0.5, 22).wall).toBeGreaterThan(SKY_GLOW)
    expect(nightLight(-30, 45, 0.5, 22).wall).toBeLessThan(1)
  })

  it('9:30 PM on 1 Nov at the pier, the moon not yet up: night, walls lit by the sky’s glow, windows on', () => {
    const t = new Date('2026-11-02T02:30:00Z')
    const moonAlt = getMoonPosition(t, PIER.lat, PIER.lon).altitude
    expect(moonAlt).toBeLessThan(0)
    const n = nightLight(getPosition(t, PIER.lat, PIER.lon).altitude, moonAlt, getMoonIllumination(t).fraction, 21.5)
    expect(n.night).toBe(1)
    expect(n.wall).toBeCloseTo(SKY_GLOW, 6)
    expect(n.windows).toBeGreaterThan(0)
    /* Later that night the moon is up and adds to it. */
    const late = new Date('2026-11-02T06:00:00Z')
    const m = nightLight(getPosition(late, PIER.lat, PIER.lon).altitude, getMoonPosition(late, PIER.lat, PIER.lon).altitude, getMoonIllumination(late).fraction, 1)
    expect(m.wall).toBeGreaterThan(SKY_GLOW)
  })

  it('fewer windows lit late in the night than after dusk', () => {
    expect(nightLight(-40, -10, 0, 3.5).windows).toBeLessThan(nightLight(-40, -10, 0, 21).windows)
  })

  it('the walls and roofs take it, and the Animated look goes to flat night colours with a pale outline', () => {
    const b = readFileSync('src/three/world/buildings.ts', 'utf8')
    expect(b).toMatch(/totalEmissiveRadiance \+= nightWallCol \* nightWall/)
    expect(b).toMatch(/cell\.above\.push\(known && h >= WINDOWS_FROM_M \? q\[1\] - base : -1\)/)
    expect(b).toMatch(/outline\.color\.copy\(OUTLINE_DAY\)\.lerp\(OUTLINE_NIGHT, n\.night\)/)
    expect(readFileSync('src/three/world/look.ts', 'utf8')).toMatch(/col = mix\(col, nt, night\)/)
    expect(readFileSync('src/three/world/scene.ts', 'utf8')).toMatch(/buildings\.setNight\(n\)[\s\S]{0,40}look\.setNight\(n\)/)
  })
})

describe('the fine square under a low camera', () => {
  it('is FINE_TILES of the top zoom, centred on the point', () => {
    const p = finePatch(36.846, -75.973, 19)
    expect(lonOf(p.tx0, 19)).toBe(p.west)
    expect(latOf(p.ty0 + FINE_TILES, 19)).toBe(p.south)
    const cx = tileX(-75.973, 19) - p.tx0
    const cy = tileY(36.846, 19) - p.ty0
    expect(Math.abs(cx - FINE_TILES / 2)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(cy - FINE_TILES / 2)).toBeLessThanOrEqual(0.5)
    /* About 60 m a tile at zoom 19 here: the square is a few hundred metres, under the drone. */
    const metres = ((p.east - p.west) * 111_320 * Math.cos((36.846 * Math.PI) / 180))
    expect(metres).toBeGreaterThan(400)
    expect(metres).toBeLessThan(560)
  })
})
