import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { gridSpacing, gridTiles, roundedCentre, scoreAt } from '../src/core/bestSky.ts'
import { STARTER_SPOTS } from '../src/data/bestSkySpots.ts'
import { tileUrl } from '../src/lib/bestSkyData.ts'
import { replay, spot } from './bestSkyReplay.ts'

/*
 * WHERE'S THE COLOR TONIGHT? (Batch BEST SKY, Section 1): the grid and its
 * score, on the kept answers (tests/bestSkyReplay.ts).
 */
describe('the grid: tiles on the forecast cache\'s grid, never the spot', () => {
  it('every point a multiple of 0.05°; the centre rounded; a tile is 25 points', () => {
    for (const r of [5, 15, 30, 60] as const) {
      const tiles = gridTiles({ lat: 36.84357, lon: -75.97131 }, r)
      expect(tiles.length).toBeGreaterThan(0)
      expect(tiles.length).toBeLessThanOrEqual(9)
      for (const t of tiles) {
        expect(t.points).toHaveLength(25)
        for (const p of t.points) {
          expect(Math.abs(p.lat * 20 - Math.round(p.lat * 20))).toBeLessThan(1e-6)
          expect(Math.abs(p.lon * 20 - Math.round(p.lon * 20))).toBeLessThan(1e-6)
        }
      }
    }
    expect(roundedCentre({ lat: 36.84357, lon: -75.97131 })).toEqual({ lat: 36.85, lon: -75.95 })
    expect(gridSpacing(60)).toBe(0.2)
  })
  it('the question names the tile and the day only: two spots in one tile ask the same thing', () => {
    const a = gridTiles({ lat: 36.84357, lon: -75.97131 }, 15)
    const b = gridTiles({ lat: 36.8371, lon: -75.9666 }, 15)
    expect(a.map((t) => tileUrl(t.points, '2026-11-11'))).toEqual(b.map((t) => tileUrl(t.points, '2026-11-11')))
    expect(tileUrl(a[0].points, '2026-11-11')).not.toMatch(/36\.843|75\.971/)
  })
})

describe('replays', () => {
  it('11 Nov sunset (fixtures/truth/2026-11-11-lynnhaven-sunset.json): Lynnhaven Inlet ranks top within 15 mi, the oceanfront lower', () => {
    const truth = JSON.parse(readFileSync('fixtures/truth/2026-11-11-lynnhaven-sunset.json', 'utf8')) as { best: string }
    const grid = replay('2026-11-11', 'sunset', null)
    const ranked = STARTER_SPOTS.map((s) => ({ id: s.id, score: scoreAt(grid, s.at)!.score })).sort((a, b) => b.score - a.score)
    expect(ranked[0].score).toBe(scoreAt(grid, spot(truth.best))!.score)
    expect(scoreAt(grid, spot('lynnhaven-inlet'))!.word).toBe('Likely')
    expect(scoreAt(grid, spot('vb-pier'))!.score).toBeLessThan(scoreAt(grid, spot('lynnhaven-inlet'))!.score)
    expect(scoreAt(grid, spot('vb-pier'))!.word).not.toBe('Likely')
  })
  it('12 Nov sunrise: the east-facing beaches Possible or better, from the satellite\'s patch (the models had none)', () => {
    const sat = readdirSync('tests/data/bestsky-2026-11-12').find((f) => f.startsWith('goes-'))!
    expect(replay('2026-11-12', 'sunrise', null).every((g) => g.word === 'Little')).toBe(true)
    const grid = replay('2026-11-12', 'sunrise', sat)
    for (const id of ['vb-pier', 'rudee-inlet', 'fort-story', 'sandbridge']) expect(['Likely', 'Possible']).toContain(scoreAt(grid, spot(id))!.word)
  })
})
