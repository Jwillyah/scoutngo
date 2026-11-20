import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveCam, skyCams, skyLine, SUN_EVENT_WINDOW_MIN, surfCams, type CamEntry, type CamTag } from '../src/core/camPick.ts'
import { destinationPoint } from '../src/core/geo.ts'

/*
 * Batch SIMPLE-2, Section 6: which cams, and which one big (src/core/camPick.ts).
 * Synthetic cams at known bearings and distances from one spot, then the real
 * list at Chic's Beach.
 */
const SPOT = { lat: 36.92, lon: -76.1 }
const cam = (id: string, km: number, tags: CamTag[], facing: number | null, bearing = 90): CamEntry => {
  const at = destinationPoint(SPOT, bearing, km * 1000)
  return { id, name: id, lat: at.lat, lon: at.lon, source: 'other', operator: 'test', url: `https://example.org/${id}`, access: 'free', tags, facing, facingIs: facing === null ? null : 'sea', embed: false }
}

const NEAR_EAST = cam('near-east', 2, ['sky', 'surf'], 95)
const MID_WEST = cam('mid-west', 6, ['sky', 'road'], 250, 270)
const FAR_SOUTH = cam('far-south', 9, ['sky'], 180, 180)
const UNKNOWN = cam('unknown', 1, ['sky', 'road'], null, 0)
const ROAD_ONLY = cam('road-only', 3, ['road'], null, 200)
const ROAD_FAR = cam('road-far', 40, ['road'], null, 200)
const SURF_FAR = cam('surf-far', 30, ['surf', 'sky'], 100)
const SURF_OUT = cam('surf-out', 60, ['surf', 'sky'], 100)
const ALL = [NEAR_EAST, MID_WEST, FAR_SOUTH, UNKNOWN, ROAD_ONLY, ROAD_FAR, SURF_FAR, SURF_OUT]

describe('surfCams', () => {
  it('only surf-tagged cams, within 30 mi, nearest first', () => {
    expect(surfCams(SPOT, ALL).map((x) => x.cam.id)).toEqual(['near-east', 'surf-far'])
    const [a, b] = surfCams(SPOT, ALL)
    expect(a.km).toBeCloseTo(2, 1)
    expect(b.km).toBeCloseTo(30, 1)
  })
})

describe('skyCams: the big one', () => {
  it('within 90 min of sunset: the cam facing closest to the sun, even when it is not the nearest', () => {
    const p = skyCams(SPOT, ALL, { sunAzimuthDeg: 245, minutesFromSunEvent: -20, cloudDeckBearingDeg: 100 })
    expect(p.big?.cam.id).toBe('mid-west')
    expect(p.bigWhy).toBe('sun')
    expect(p.bigOffDeg).toBe(5)
    /* the nearest (unknown, 1 km) was passed over: the check can tell a facing pick from a nearest pick */
    expect(p.others[0].cam.id).toBe('unknown')
  })

  it('outside the window: the cam facing the observed cloud deck', () => {
    const p = skyCams(SPOT, ALL, { sunAzimuthDeg: 245, minutesFromSunEvent: 300, cloudDeckBearingDeg: 170 })
    expect(p.big?.cam.id).toBe('far-south')
    expect(p.bigWhy).toBe('deck')
  })

  it('the window edge is 90 minutes, either side of the event', () => {
    expect(skyLine({ sunAzimuthDeg: 245, minutesFromSunEvent: SUN_EVENT_WINDOW_MIN, cloudDeckBearingDeg: 170 })).toEqual({ deg: 245, why: 'sun' })
    expect(skyLine({ sunAzimuthDeg: 245, minutesFromSunEvent: -SUN_EVENT_WINDOW_MIN, cloudDeckBearingDeg: 170 })).toEqual({ deg: 245, why: 'sun' })
    expect(skyLine({ sunAzimuthDeg: 245, minutesFromSunEvent: SUN_EVENT_WINDOW_MIN + 1, cloudDeckBearingDeg: 170 })).toEqual({ deg: 170, why: 'deck' })
    expect(skyLine({ sunAzimuthDeg: 245, minutesFromSunEvent: null, cloudDeckBearingDeg: null })).toBeNull()
  })

  it('no deck observed: the nearest, said as the nearest', () => {
    const p = skyCams(SPOT, ALL, { sunAzimuthDeg: 245, minutesFromSunEvent: 300, cloudDeckBearingDeg: null })
    expect(p.big?.cam.id).toBe('unknown')
    expect(p.bigWhy).toBe('nearest')
    expect(p.bigOffDeg).toBeNull()
  })

  it('an unknown facing is never picked for facing, and nothing beyond 90° counts as facing', () => {
    const onlyUnknownAndBehind = [UNKNOWN, NEAR_EAST]
    const p = skyCams(SPOT, onlyUnknownAndBehind, { sunAzimuthDeg: 250, minutesFromSunEvent: 0, cloudDeckBearingDeg: null })
    expect(p.big?.cam.id).toBe('unknown')
    expect(p.bigWhy).toBe('nearest')
  })

  it('ties on facing go to the nearer cam', () => {
    const twin = cam('twin-far', 8, ['sky'], 95)
    expect(skyCams(SPOT, [twin, NEAR_EAST], { sunAzimuthDeg: 95, minutesFromSunEvent: 5, cloudDeckBearingDeg: null }).big?.cam.id).toBe('near-east')
  })

  it('others: every other sky cam in reach, nearest first; road-only cams counted, not listed', () => {
    const p = skyCams(SPOT, ALL, { sunAzimuthDeg: 245, minutesFromSunEvent: -20, cloudDeckBearingDeg: null })
    expect(p.others.map((x) => x.cam.id)).toEqual(['unknown', 'near-east', 'far-south'])
    /* road-only at 3 km counts; road-far at 40 km is out of reach; road + sky cams are shown, not hidden */
    expect(p.hiddenRoadOnlyCount).toBe(1)
  })

  it('nothing in reach: no big cam', () => {
    const p = skyCams(SPOT, [SURF_OUT, ROAD_ONLY], { sunAzimuthDeg: 245, minutesFromSunEvent: 0, cloudDeckBearingDeg: null })
    expect(p).toEqual({ big: null, bigWhy: null, bigOffDeg: null, others: [], hiddenRoadOnlyCount: 1 })
  })
})

describe('resolveCam: the remembered cam', () => {
  const list = surfCams(SPOT, ALL)
  it('finds a stored id in the list, and nothing for a cam no longer in it', () => {
    expect(resolveCam('surf-far', list)?.cam.id).toBe('surf-far')
    expect(resolveCam('surf-out', list)).toBeNull()
    expect(resolveCam(null, list)).toBeNull()
    expect(resolveCam('', list)).toBeNull()
  })
})

describe("the real list at Chic's Beach (36.92, -76.10)", () => {
  const cams = JSON.parse(readFileSync('src/data/cams.json', 'utf8')) as CamEntry[]
  it('surf: the Virginia Beach and Sandbridge cams, nearest first', () => {
    const ids = surfCams(SPOT, cams).map((x) => x.cam.id)
    expect(ids[0]).toBe('va-virginia-beach-north-end')
    expect(ids).toContain('va-sandbridge')
    expect(ids.every((id) => id.startsWith('va-'))).toBe(true)
  })
  it('sky at the morning deck to the east: a cam facing the sea; road-only cams hidden', () => {
    const p = skyCams(SPOT, cams, { sunAzimuthDeg: 200, minutesFromSunEvent: 300, cloudDeckBearingDeg: 100 })
    expect(p.bigWhy).toBe('deck')
    expect(p.big?.cam.facing).toBe(100)
    expect(p.hiddenRoadOnlyCount).toBeGreaterThan(0)
  })
  it('sky at sunset: no cam here is recorded facing west, so the nearest, said as the nearest', () => {
    const p = skyCams(SPOT, cams, { sunAzimuthDeg: 240, minutesFromSunEvent: 10, cloudDeckBearingDeg: null })
    expect(p.bigWhy).toBe('nearest')
    expect(p.big?.cam.id).toBe('va-virginia-beach-north-end')
  })
})
