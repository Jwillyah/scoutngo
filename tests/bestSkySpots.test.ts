import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compareRanked, offset, rankSpots } from '../src/core/bestSky.ts'
import { STARTER_SPOTS } from '../src/data/bestSkySpots.ts'
import { eventOf, replay, VB } from './bestSkyReplay.ts'

/*
 * WHO SEES THE PATCH, AND WHO RANKS FIRST (Batch BEST SKY, Section 2): the
 * starter spots ranked on the kept answers (tests/bestSkyReplay.ts).
 */
describe('the satellite\'s patch overhead, seen facing away (Section 2)', () => {
  it('12 Nov sunrise: a spot facing away still has the satellite\'s patch overhead lit, below the east-facing ones (never "patch overhead" at 0.00)', () => {
    const sat = readdirSync('tests/data/bestsky-2026-11-12').find((f) => f.startsWith('goes-'))!
    const ranked = rankSpots(replay('2026-11-12', 'sunrise', sat), STARTER_SPOTS, eventOf('2026-11-12', 'sunrise').az, VB)
    for (const r of ranked) if (r.why[0] === 'patch overhead') expect(r.score).toBeGreaterThan(0)
    const east = ranked.filter((r) => r.seesSun)
    expect(east.map((r) => r.spot.id).sort()).toEqual(['fort-story', 'rudee-inlet', 'sandbridge', 'vb-pier'])
    expect(ranked.slice(0, 2).every((r) => r.seesSun)).toBe(true)
  })
})


describe('who sees the patch (Section 2)', () => {
  it('11 Nov: Lynnhaven Inlet first of the starter spots; a spot facing away sees only what is overhead', () => {
    const grid = replay('2026-11-11', 'sunset', null)
    const ranked = rankSpots(grid, STARTER_SPOTS, eventOf('2026-11-11', 'sunset').az)
    expect(ranked[0].spot.id).toBe('lynnhaven-inlet')
    /* Five spots read 1.00; the tie-break, from code, puts Lynnhaven Inlet first alone: it faces the sun most directly. */
    expect(ranked.filter((r) => r.score === ranked[0].score).length).toBeGreaterThan(1)
    expect(ranked[0].tie.aimDeg).toBeLessThan(ranked[1].tie.aimDeg)
    expect(compareRanked(ranked[0], ranked[1])).toBeLessThan(0)
    expect(ranked.findIndex((r) => r.spot.id === 'lynnhaven-inlet')).toBeLessThan(ranked.findIndex((r) => r.spot.id === 'vb-pier'))
    const pier = ranked.find((r) => r.spot.id === 'vb-pier')!
    expect(pier.seesSun).toBe(false)
    /* The oceanfront was cloudless (the truth file): 13% mid overhead is no canvas for a view facing away; the clear east is the Belt of Venus at most (Batch NOW, Section 0), Little alone. */
    expect(pier.why[0]).toMatch(/^Belt of Venus /)
    expect(pier.word).toBe('Little')
    expect(ranked.slice(0, 3).map((r) => `${r.spot.name} ${r.score.toFixed(2)}`)).toHaveLength(3)
  })
})

describe('the tie-break, from code (11 Nov: five spots at 1.00)', () => {
  it('in order: aim at the sun, then the patch in view, then water, then distance from you', () => {
    const at = { lat: 36.9, lon: -76.1 }
    /* One patch, a 5 km ring of points round the spots, every one a canvas with the gap open. */
    const grid = [0, 45, 90, 135, 180, 225, 270, 315].map((b) => {
      const p = offset(at, b, 5)
      return { ...p, sunScore: 1, sunWhy: [], glow: 0, glowFires: false, belt: false, canvas: 1, overhead: 1, gap: 1, blocked: false, score: 1, word: 'Likely' as const, why: [] }
    })
    const base = { at, openDeg: 60, water: true, silhouette: null }
    const ids = (from: { lat: number; lon: number } | null, spots: Parameters<typeof rankSpots>[1]) => rankSpots(grid, spots, 270, from).map((r) => r.spot.id)
    /* Aim: 2° off beats 25° off, whatever else. */
    expect(ids(null, [{ ...base, id: 'b', name: 'b', facing: 295, openDeg: 180 }, { ...base, id: 'a', name: 'a', facing: 268 }])).toEqual(['a', 'b'])
    /* Same aim step: the wider view holds more of the patch. */
    expect(ids(null, [{ ...base, id: 'b', name: 'b', facing: 270, openDeg: 30 }, { ...base, id: 'a', name: 'a', facing: 270, openDeg: 100 }])).toEqual(['a', 'b'])
    /* Same view: water in front. */
    expect(ids(null, [{ ...base, id: 'b', name: 'b', facing: 270, water: false }, { ...base, id: 'a', name: 'a', facing: 270 }])).toEqual(['a', 'b'])
    /* All else equal: the nearer to you. */
    const near = offset(at, 0, 1)
    expect(ids(near, [{ ...base, id: 'b', name: 'b', facing: 270, at: offset(at, 180, 0.5) }, { ...base, id: 'a', name: 'a', facing: 270, at: offset(at, 0, 0.5) }])).toEqual(['a', 'b'])
  })
})
