import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { gridTiles } from '../src/core/bestSky.ts'
import { colorNowLine } from '../src/core/colorNow.ts'
import { feedBestSpot } from '../src/lib/feedBestSky.ts'
import { eventOf, VB } from './bestSkyReplay.ts'

/* "COLOR NOW" AND THE CALENDAR NAME THE BEST SPOT (Batch BEST SKY, Section 6). */
const event = eventOf('2026-11-11', 'sunset').at
describe('the best spot named', () => {
  it('"Color now · sunset 4:56 · look W · best Lynnhaven Inlet 9 mi NW"', () => {
    const read = { kind: 'sunset' as const, event, call: 'Maybe' as const, why: '', confirmed: false, colorFrom: null, colorTo: null, setUp: null, agree: 2, of: 5 }
    expect(colorNowLine([read], new Date(event.getTime() - 10 * 60_000), VB, 'America/New_York', 'Lynnhaven Inlet 9 mi NW')).toMatch(/^Color now · sunset 4:5\d PM · look \w+ · best Lynnhaven Inlet 9 mi NW$/)
    expect(colorNowLine([read], new Date(event.getTime() - 10 * 60_000), VB, 'America/New_York')).not.toContain('best')
  })
  it('the feed\'s server asks the tiles only (no spot), and its event says the best spot near', async () => {
    const asked: string[] = []
    const at = { lat: 36.84, lon: -75.97 }
    const tiles = gridTiles(at, 15)
    const fake = async (u: string | URL | Request) => {
      const url = new URL(String(u))
      asked.push(url.href)
      const t = tiles.find((x) => x.points.map((p) => p.lat.toFixed(2)).join(',') === url.searchParams.get('latitude') && x.points.map((p) => p.lon.toFixed(2)).join(',') === url.searchParams.get('longitude'))!
      return new Response(readFileSync(`tests/data/bestsky-2026-11-11/tile-${t.spacing}-${t.south}-${t.west}.json`, 'utf8'))
    }
    const words = await feedBestSpot(at, event, new Date(event.getTime() - 3_600_000), fake as typeof fetch)
    expect(words).toMatch(/^Lynnhaven Inlet \d+ mi W?N\w*$/)
    expect(asked).toHaveLength(tiles.length)
    for (const u of asked) expect(u).not.toMatch(/36\.84,|-75\.97,|36\.84$|-75\.97$/)
    /* An event more than a day off asks nothing. */
    expect(await feedBestSpot(at, event, new Date(event.getTime() - 30 * 3_600_000), fake as typeof fetch)).toBeNull()
    expect(asked).toHaveLength(tiles.length)
  })
})
