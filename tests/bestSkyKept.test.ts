import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { RankedSpot, ScoredPoint } from '../src/core/bestSky.ts'
import { BEST_SKY_KEEP_MS, BEST_SKY_KEPT_KEY, keepBestSky, keptBestSky, keptGot, placeKey, type BestSkyGot } from '../src/lib/bestSkyKept.ts'
import { nextColorEvent } from '../src/lib/useBestSky.ts'

/* BEST SKY ASKED ON ITS PAGE ONLY, KEPT 30 MINUTES (18 Nov; src/lib/bestSkyKept.ts). */
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const NOW = new Date('2026-11-18T18:07:00Z')
const store = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
}
const here = { lat: 36.84, lon: -75.97, sunScore: 0.4 } as unknown as ScoredPoint
const ranked = [{ spot: { id: 'lynnhaven-inlet', name: 'Lynnhaven Inlet', at: { lat: 36.9, lon: -76.09 } }, score: 0.8, word: 'Likely' }] as unknown as RankedSpot[]
const got: BestSkyGot = { grid: [here], asked: 7, satAt: new Date('2026-11-18T17:50:00Z'), satAsked: true, failed: false, drift: null, station: null }
const event = nextColorEvent(PIER, NOW)!
const place = placeKey(PIER, event.at)

describe('the kept Best Sky answer', () => {
  it('the home reads nothing until the page has asked', () => {
    expect(keptBestSky(PIER, NOW, store(), NOW.getTime())).toEqual({ event: null, ranked: [], here: null })
  })

  it('kept 30 minutes from the asking, then gone; the satellite time comes back a Date', () => {
    const s = store()
    keepBestSky(place, 15, got, ranked, here, NOW.getTime(), s)
    expect(JSON.parse(s.m.get(BEST_SKY_KEPT_KEY)!).place).toBe(place)
    const back = keptGot(place, 15, NOW.getTime() + BEST_SKY_KEEP_MS - 1, s)
    expect(back?.asked).toBe(7)
    expect(back?.satAt).toEqual(got.satAt)
    expect(keptGot(place, 15, NOW.getTime() + BEST_SKY_KEEP_MS, s)).toBeNull()
    expect(keptGot(place, 30, NOW.getTime(), s)).toBeNull()

    const home = keptBestSky(PIER, new Date(NOW.getTime() + 29 * 60_000), s, NOW.getTime() + 29 * 60_000)
    expect(home.event?.at).toEqual(event.at)
    expect(home.ranked[0].spot.name).toBe('Lynnhaven Inlet')
    expect(keptBestSky(PIER, NOW, s, NOW.getTime() + 31 * 60_000).event).toBeNull()
    /* The home's clock holds to the minute: a home "now" a few seconds before the asking still reads it (the audit's 4:00:00 PM home, kept at 4:00:28). */
    expect(keptBestSky(PIER, new Date(NOW.getTime() - 28_000), s, NOW.getTime() + 9_000).event?.at).toEqual(event.at)
    /* Another spot does not read this one's answer. */
    expect(keptBestSky({ lat: 35.9, lon: -75.6 }, NOW, s, NOW.getTime()).event).toBeNull()
  })

  it('a re-ranking inside the 30 minutes keeps the first asking time; a failed asking is never kept', () => {
    const s = store()
    keepBestSky(place, 15, got, ranked, here, NOW.getTime(), s)
    keepBestSky(place, 15, got, ranked, here, NOW.getTime() + 20 * 60_000, s)
    expect(keptGot(place, 15, NOW.getTime() + 31 * 60_000, s)).toBeNull()
    const f = store()
    keepBestSky(place, 15, { ...got, failed: true }, [], null, NOW.getTime(), f)
    expect(f.m.size).toBe(0)
  })

  it('the home never asks: it reads the kept answer, not useBestSky', () => {
    const home = readFileSync('src/components/Home.tsx', 'utf8')
    expect(home).not.toMatch(/\buseBestSky\b/)
    expect(home).toMatch(/useKeptBestSky\(/)
  })
})
