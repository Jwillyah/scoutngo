import { describe, expect, it } from 'vitest'
import { attachLabels, leader, PIN_GAP_PX, spreadPins } from '../src/core/bestSkyPins.ts'
import { scoreGrid, type PointSky } from '../src/core/bestSky.ts'
import { destinationPoint } from '../src/core/geo.ts'

/*
 * BEST SKY (Batch LIVE, Section 8; Jwilly's 14 Nov 2:45 PM screenshots, not
 * kept in the repo, described in the batch): labels floating off their
 * pins, pins on each other, "You" over the sun's label, and a pink wash on
 * a few per cent of model cloud.
 */
describe('pins and labels', () => {
  it('pins never overlap: two at one place and three in a cluster end PIN_GAP_PX apart', () => {
    const out = spreadPins([{ x: 100, y: 100 }, { x: 100, y: 100 }, { x: 104, y: 98 }, { x: 300, y: 300 }])
    for (let i = 0; i < out.length; i += 1) for (let j = i + 1; j < out.length; j += 1) expect(Math.hypot(out[i].x - out[j].x, out[i].y - out[j].y)).toBeGreaterThanOrEqual(PIN_GAP_PX - 0.5)
    expect(out[3]).toEqual({ x: 300, y: 300 })
  })
  it('each label beside its pin (two rows at most), clear of the sun\'s label; none where there is no room', () => {
    const sun = { x: 150, y: 60, w: 120, h: 20 }
    const pins = [{ x: 200, y: 100 }, { x: 120, y: 200 }]
    const boxes = attachLabels(pins.map((pin) => ({ pin, w: 90, h: 24 })), 400, 400, [sun])
    boxes.forEach((b, i) => {
      expect(b).not.toBeNull()
      const box = b!
      const hitsSun = box.x < sun.x + sun.w && sun.x < box.x + box.w && box.y < sun.y + sun.h && sun.y < box.y + box.h
      expect(hitsSun).toBe(false)
      expect(Math.abs(box.y + box.h / 2 - pins[i].y)).toBeLessThanOrEqual(13 + 4 + 2 * (24 + 3))
      const l = leader(box, pins[i])
      expect([l.x2, l.y2]).toEqual([pins[i].x, pins[i].y])
    })
    expect(attachLabels([{ pin: { x: 10, y: 10 }, w: 500, h: 24 }], 400, 400, [])).toEqual([null])
  })
})

describe('the pink needs cloud seen', () => {
  const venue = { lat: 36.84, lon: -75.97 }
  /* A small grid, 5% model cloud to the east (the anti-sun half at sunset), clear to the west. */
  const pts: PointSky[] = [venue, ...[0, 60, 90, 120, 240, 270, 300].map((b) => destinationPoint(venue, b, 20_000))].map((p) => ({ ...p, low: 5, mid: 18, high: 0 }))
  it('with no satellite and no station cover, no glow', () => {
    const g = scoreGrid(pts, 245, null, { stationCover: null, satAsked: false })
    expect(g.every((p) => p.glow === 0)).toBe(true)
  })
  it('a station deck of 15% or more, or a satellite patch in the anti-sun half, lets the models\' pink count', () => {
    const models = scoreGrid(pts, 245)
    const withStation = scoreGrid(pts, 245, null, { stationCover: 75, satAsked: false })
    expect(withStation.map((p) => p.glow)).toEqual(models.map((p) => p.glow))
    const sat = scoreGrid(pts.map((p, i) => (i === 3 ? { ...p, satPatch: true } : p)), 245, null, { stationCover: null, satAsked: true })
    expect(sat[0].glow).toBe(models[0].glow)
  })
  it('a model\'s "clear sky" says the station\'s word when the station sees a deck', () => {
    const clear = [venue, ...[0, 90, 180, 270].map((b) => destinationPoint(venue, b, 20_000))].map((p) => ({ ...p, low: 0, mid: 0, high: 0 }))
    const g = scoreGrid(clear, 245, null, { stationCover: 75, satAsked: false, stationLine: 'KNTU mostly cloudy' })
    expect(g[0].sunWhy[0]).toBe('KNTU mostly cloudy')
    expect(scoreGrid(clear, 245)[0].sunWhy[0]).toBe('clear sky')
  })
})
