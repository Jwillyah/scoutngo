import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getTimes } from 'suncalc'
import { gridTiles } from '../src/core/bestSky.ts'

/*
 * THE GRID'S QUESTIONS, CAPTURED (Batch BEST SKY: "the grid request sends only
 * the tile, at most one request per tile per hour"). Every request the page's
 * data makes, caught: each names its tile's 25 points and the day, nothing
 * finer than the 0.05° grid, never the spot; asked again within the hour,
 * nothing new goes out.
 */
const SPOT = { lat: 36.84357, lon: -75.97131 }
afterEach(() => vi.unstubAllGlobals())

describe('the grid on the wire', () => {
  it('one request per tile, only tile coordinates, none again within the hour', async () => {
    const asked: string[] = []
    const tiles = gridTiles(SPOT, 15)
    vi.stubGlobal('fetch', async (u: string | URL | Request) => {
      const href = String(u instanceof Request ? u.url : u)
      asked.push(href)
      const url = new URL(href, 'http://local')
      const lat = url.searchParams.get('latitude') ?? new URLSearchParams(url.searchParams.get('q') ?? '').get('latitude') ?? ''
      const t = tiles.find((x) => href.includes(encodeURIComponent(x.points.map((p) => p.lat.toFixed(2)).join(','))) || x.points.map((p) => p.lat.toFixed(2)).join(',') === lat) ?? tiles[0]
      return new Response(readFileSync(`tests/data/bestsky-2026-11-11/tile-${t.spacing}-${t.south}-${t.west}.json`, 'utf8'), { headers: { 'content-type': 'application/json' } })
    })
    const { fetchGrid } = await import('../src/lib/bestSkyData.ts')
    const event = getTimes(new Date('2026-11-11T12:00:00Z'), 36.85, -75.98).sunset as Date
    const first = await fetchGrid(SPOT, 15, event, new Date(event.getTime() - 6 * 3_600_000))
    expect(first.asked).toBe(tiles.length)
    expect(first.points.length).toBeGreaterThan(0)
    expect(asked.length).toBe(tiles.length)
    for (const u of asked) {
      expect(decodeURIComponent(u)).not.toMatch(/36\.843|75\.971/)
      for (const v of decodeURIComponent(u).match(/-?\d+\.\d+/g) ?? []) if (Math.abs(Number(v)) > 30 && Math.abs(Number(v)) < 100) expect(Math.abs(Number(v) * 20 - Math.round(Number(v) * 20))).toBeLessThan(1e-6)
    }
    await fetchGrid(SPOT, 15, event, new Date(event.getTime() - 6 * 3_600_000))
    expect(asked.length).toBe(tiles.length)
  })
})
