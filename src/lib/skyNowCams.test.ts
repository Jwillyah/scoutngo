import { describe, expect, it } from 'vitest'
import { skyCams, type CamEntry, type CamTag } from '../core/camPick.ts'
import { destinationPoint } from '../core/geo.ts'
import CAMS from '../data/cams.json'
import { camKind, SKY_STRIP, skyMomentAt, skyNowCams } from './skyNowCams.ts'

/*
 * Batch SIMPLE-2, Sections 4 and 6.4: Sky › Now's cams. The moment comes from
 * the sun (suncalc), the pick is camPick's, and the page shows the big one,
 * a row of four and "N road-only cams hidden · Show all".
 * Chic's Beach, Thu 19 Nov 2026: sunset 4:52 PM EST (21:52Z), sun ~247°.
 */
const SPOT = { lat: 36.92, lon: -76.1 }
const SUNSET = new Date('2026-11-19T21:52:00Z')
const MIDDAY = new Date('2026-11-19T17:00:00Z')
const cam = (id: string, km: number, tags: CamTag[], facing: number | null, bearing = 90): CamEntry => {
  const at = destinationPoint(SPOT, bearing, km * 1000)
  return { id, name: id, lat: at.lat, lon: at.lon, source: 'other', operator: 'test', url: `https://example.org/${id}`, access: 'free', tags, facing, facingIs: facing === null ? null : 'sea', embed: false }
}
const SEA = cam('sea-east', 1, ['sky', 'surf'], 80)
const WEST = cam('looks-west', 6, ['sky', 'road'], 250, 270)
const FAR = cam('far', 9, ['sky'], null, 180)
const MORE = [2, 3, 4, 5].map((km) => cam(`sky-${km}`, km, ['sky'], null, 0))
const ROAD = [cam('road-a', 3, ['road'], null, 200), cam('road-b', 7, ['road'], null, 10)]
const OUT = cam('road-out', 40, ['road'], null, 200)
const ALL = [SEA, WEST, FAR, ...MORE, ...ROAD, OUT]

describe('the moment the Now cams are picked for', () => {
  it('at sunset: the sun’s azimuth and minutes from the event', () => {
    const m = skyMomentAt(SPOT, SUNSET)
    expect(m.sunAzimuthDeg).toBeGreaterThan(240)
    expect(m.sunAzimuthDeg).toBeLessThan(252)
    expect(Math.abs(m.minutesFromSunEvent!)).toBeLessThanOrEqual(1)
    expect(m.cloudDeckBearingDeg).toBeNull()
  })
  it('at noon: hours from either event', () => {
    expect(Math.abs(skyMomentAt(SPOT, MIDDAY).minutesFromSunEvent!)).toBeGreaterThan(150)
  })
  it('before sunrise: the morning’s sunrise is the nearest event, not yesterday’s sunset', () => {
    const m = skyMomentAt(SPOT, new Date('2026-11-19T11:17:00Z'))
    expect(m.minutesFromSunEvent).toBe(30)
  })
})

describe('the Now cams', () => {
  it('at sunset the big one faces the sun, even past nearer cams', () => {
    const c = skyNowCams(SPOT, ALL, SUNSET)
    expect(c.big?.cam.id).toBe('looks-west')
    expect(c.bigWhy).toBe('sun')
  })
  it('at noon, with no deck bearing, the big one is the nearest, said as such', () => {
    const c = skyNowCams(SPOT, ALL, MIDDAY)
    expect(c.big?.cam.id).toBe('sea-east')
    expect(c.bigWhy).toBe('nearest')
  })
  it('is camPick’s pick, never a second one', () => {
    const c = skyNowCams(SPOT, ALL, SUNSET)
    const p = skyCams(SPOT, ALL, skyMomentAt(SPOT, SUNSET))
    expect(c.big).toEqual(p.big)
    expect(c.others).toEqual(p.others)
    expect(c.hiddenRoadOnlyCount).toBe(p.hiddenRoadOnlyCount)
  })
  it('a row of four, nearest first, never the big one', () => {
    const c = skyNowCams(SPOT, ALL, SUNSET)
    expect(SKY_STRIP).toBe(4)
    expect(c.strip.map((x) => x.cam.id)).toEqual(['sea-east', 'sky-2', 'sky-3', 'sky-4'])
    expect(c.strip.some((x) => x.cam.id === c.big?.cam.id)).toBe(false)
  })
  it('the road-only cams Show all opens are the hidden count, in reach, nearest first', () => {
    const c = skyNowCams(SPOT, ALL, SUNSET)
    expect(c.road.map((x) => x.cam.id)).toEqual(['road-a', 'road-b'])
    expect(c.road.length).toBe(c.hiddenRoadOnlyCount)
  })
  it('no sky cam in reach: no big one, nothing invented', () => {
    const c = skyNowCams(SPOT, [...ROAD, OUT], SUNSET)
    expect(c.big).toBeNull()
    expect(c.strip).toEqual([])
    expect(c.hiddenRoadOnlyCount).toBe(2)
  })
  it('what each is, by its tags', () => {
    expect(camKind(SEA)).toBe('surf cam')
    expect(camKind(WEST)).toBe('traffic cam')
    expect(camKind(FAR)).toBe('cam')
  })
  it('the real list at Chic’s Beach: sky cams in reach, every one a link out today', () => {
    const list = CAMS as unknown as CamEntry[]
    const c = skyNowCams(SPOT, list, SUNSET)
    expect(c.big).not.toBeNull()
    expect([c.big!, ...c.others].every((x) => x.km <= 15)).toBe(true)
    expect([c.big!, ...c.others].every((x) => x.cam.embed === false)).toBe(true)
    expect(c.road.length).toBe(c.hiddenRoadOnlyCount)
  })
})
