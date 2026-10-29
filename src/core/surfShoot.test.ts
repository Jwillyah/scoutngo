import { describe, expect, it } from 'vitest'
import { bestWindow, droneOverLineup, faceLight, hourQuality, lensDistance, ratingWord, sizeWords, standToward, type ShootHour } from './surfShoot.ts'

describe('the surf in words', () => {
  it('says sizes the way surfers do', () => {
    expect(sizeWords(0.5)).toBe('flat')
    expect(sizeWords(3.4)).toBe('waist to chest')
    expect(sizeWords(7)).toBe('overhead')
  })
  it('rates: Fun needs clean water; messy is poor; no wind forecast is never good', () => {
    expect(ratingWord(3, 'Clean')).toBe('Fun')
    expect(ratingWord(5, 'Clean')).toBe('Good')
    expect(ratingWord(3, 'Bumpy')).toBe('Fair')
    expect(ratingWord(3, 'Messy')).toBe('Poor')
    expect(hourQuality(3, null)).toBe('ok')
    expect(ratingWord(0.4, 'Clean')).toBe('Flat')
  })
})

describe('the light on the face', () => {
  /* Virginia Beach faces east. A swell from the east (90) travels west: its face looks west, at the beach. */
  it('morning sun out to sea behind an east swell: backlit, the lip glows', () => {
    expect(faceLight(100, 8, 90)).toBe('back')
  })
  it('afternoon sun behind the shooter on the beach: front-lit', () => {
    expect(faceLight(260, 25, 90)).toBe('front')
  })
  it('sun along the beach: side-lit; sun down: dark', () => {
    expect(faceLight(180, 30, 90)).toBe('side')
    expect(faceLight(260, -2, 90)).toBe('dark')
  })
})

describe('the best window to shoot', () => {
  const h = (hour: number, faceFt: number, shape: ShootHour['shape'], light: ShootHour['light'], sunAltitude: number): ShootHour => ({ at: new Date(Date.UTC(2026, 9, 29, hour)), faceFt, shape, light, sunAltitude })
  it('is the longest run of Fun-or-bigger, clean, low-sun hours', () => {
    const w = bestWindow([h(11, 3, 'Clean', 'back', 5), h(12, 3.5, 'Clean', 'side', 15), h(13, 3.2, 'Clean', 'side', 25), h(14, 3, 'Clean', 'side', 38), h(15, 4, 'Bumpy', 'front', 40)])
    expect(w?.from.getUTCHours()).toBe(11)
    expect(w?.to.getUTCHours()).toBe(14)
    expect(w?.light).toBe('side')
    expect(w?.faceFt).toBe(3.5)
  })
  it('is none when nothing qualifies, rather than the least bad', () => {
    expect(bestWindow([h(11, 1, 'Clean', 'side', 10), h(12, 3, 'Messy', 'side', 10)])).toBeNull()
  })
})

describe('where to stand', () => {
  it('walks toward the sun along the beach', () => {
    /* East-facing beach; morning sun in the south-east: walk south. */
    expect(standToward(120, 90)).toBe(180)
    expect(standToward(60, 90)).toBe(0)
    expect(standToward(90, 90)).toBeNull()
  })
  it('frames a wave and rider: 600 mm from the beach, 24 mm from the water', () => {
    expect(lensDistance(600, 24).from).toBe('beach')
    expect(lensDistance(600, 24).metres).toBeCloseTo(75, 6)
    expect(lensDistance(24, 24).from).toBe('water')
    expect(lensDistance(2400, 24).from).toBe('pier or jetty')
  })
})

describe('the drone over the lineup', () => {
  it('compares the wind at height with the rating, and the ceiling with the shot', () => {
    expect(droneOverLineup(9, 12, 400)).toEqual({ wind: 'within', ceiling: 'room' })
    expect(droneOverLineup(14, 12, 200)).toEqual({ wind: 'over', ceiling: 'tight' })
    expect(droneOverLineup(null, 12, 0)).toEqual({ wind: 'unknown', ceiling: 'none' })
  })
})
