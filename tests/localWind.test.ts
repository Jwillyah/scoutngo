import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { aloftFactor, beachWindLine, seaBreeze, seaBreezeLine, stabilityOf, type SbHour } from '../src/core/localWind.ts'
import { windToBeach } from '../src/core/coastFacing.ts'

/*
 * LOCAL PHYSICS (Batch L, Section 2): the sea breeze's onset from the land
 * against the sea and the wind off the land, onshore/offshore said one way
 * everywhere, and 400 ft from the air's stability.
 */
/* Virginia Beach's oceanfront looks east (90°): onshore comes from the east, offshore from the west. */
const FACING = 90
const day = (temps: number[], dirs: number[], speeds: number[]): SbHour[] =>
  temps.map((t, i) => ({ at: new Date(Date.UTC(2026, 6, 15, 11 + i)), hour: 7 + i, tempC: t, fromDeg: dirs[i], mps: speeds[i] }))
const say = { speed: (m: number) => `${Math.round(m * 2.237)} mph`, hour: (d: Date) => `${((d.getUTCHours() - 4 + 11) % 12) + 1} PM`, diff: (c: number) => `${Math.round(c * 1.8)}°` }

describe('the sea breeze', () => {
  /* 07-17 local: a light westerly morning, the land warming from 22 to 31 over a 24° sea, the models turning SE at 1 PM. */
  const temps = [22, 23, 25, 26, 27, 28, 29, 30, 31, 31, 30]
  const dirs = [270, 260, 250, 250, 240, 230, 135, 130, 130, 140, 140]
  const speeds = [2, 2, 2.5, 2.5, 2, 1.5, 4.5, 5, 5, 4.5, 4]
  it('a light offshore morning and a warm land: onset, then the models’ own turn onshore', () => {
    const sb = seaBreeze(day(temps, dirs, speeds), FACING, 24)
    expect(sb?.kind).toBe('turn')
    if (sb?.kind !== 'turn') return
    /* The 9 AM 2.5 m/s from 250° is 2.35 m/s off the land, which asks 3 + 0.6 x 2.35 = 4.4°: noon's 28 over a 24° sea is under, 1 PM's 29 over; the models turn at 1 PM. */
    expect(sb.at.toISOString()).toBe('2026-07-15T17:00:00.000Z')
    expect(sb.fromDeg).toBe(135)
    expect(seaBreezeLine(sb, say)).toBe('Sea breeze ~1 PM, turns SE 10 mph')
  })

  it('a warm land with the models never turning: "possible" with the contrast, and no speed it does not know', () => {
    const sb = seaBreeze(day(temps, dirs.map(() => 250), speeds), FACING, 24)
    expect(sb?.kind).toBe('possible')
    expect(seaBreezeLine(sb, say)).toMatch(/^Sea breeze possible from ~\d+ PM · land \d+° warmer than the sea$/)
  })

  it('a sea as warm as the land: nothing said', () => {
    expect(seaBreeze(day(temps, dirs, speeds), FACING, 30)).toBeNull()
  })

  it('a strong wind off the land holds it off', () => {
    const sb = seaBreeze(day(temps, dirs.map(() => 270), speeds.map(() => 9)), FACING, 24)
    expect(sb).toEqual({ kind: 'held', holdMps: 9 })
  })

  it('already onshore all morning: no turn to say', () => {
    expect(seaBreeze(day(temps, dirs.map(() => 100), speeds), FACING, 24)).toBeNull()
  })

  it('inland (no facing) or no sea temperature: nothing', () => {
    expect(seaBreeze(day(temps, dirs, speeds), null, 24)).toBeNull()
    expect(seaBreeze(day(temps, dirs, speeds), FACING, null)).toBeNull()
  })
})

describe('400 ft from the air’s stability', () => {
  it('sun-heated afternoon: a small step up; a clear calm night: a big one; overcast or windy: between', () => {
    const day = aloftFactor(50, 20, 3)
    const night = aloftFactor(-20, 10, 2)
    const grey = aloftFactor(50, 95, 3)
    const windy = aloftFactor(-20, 10, 8)
    expect(day.cls).toBe('mixing')
    expect(night.cls).toBe('inversion')
    expect(grey.cls).toBe('neutral')
    expect(windy.cls).toBe('neutral')
    /* (121.92 / 10) ^ alpha */
    expect(day.factor).toBeCloseTo(12.192 ** 0.1, 6)
    expect(night.factor).toBeCloseTo(12.192 ** 0.35, 6)
    expect(day.factor).toBeLessThan(grey.factor)
    expect(grey.factor).toBeLessThan(night.factor)
    expect(day.factor).toBeCloseTo(1.28, 2)
    expect(night.factor).toBeCloseTo(2.4, 2)
  })

  it('a cloudy night is between a clear night and neutral', () => {
    expect(stabilityOf(-10, 80, 2).alpha).toBe(0.25)
  })
})

describe('onshore or offshore, one way everywhere', () => {
  it('says what windToBeach says', () => {
    for (const from of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const line = beachWindLine(from, 5, FACING, (m) => `${m} m/s`) ?? ''
      const word = { offshore: 'offshore', cross: 'cross-shore', onshore: 'onshore' }[windToBeach(from, FACING)]
      expect(line.startsWith(`Wind ${word},`)).toBe(true)
    }
    expect(beachWindLine(90, 5, null, String)).toBeNull()
  })

  it('the Surf page, the Water card and the home all reach it through coastFacing’s windToBeach', () => {
    const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')
    expect(src('components/SurfPage.tsx')).toMatch(/windToBeach\(/)
    /* Batch N: the home (Home.tsx) replaced Today (Briefing.tsx, StormToday.tsx); its Wind card's side is windTag's. */
    expect(src('components/Home.tsx')).toMatch(/windTag\(/)
    expect(src('lib/useBriefing.ts')).toMatch(/windTag\(|windToBeach\(/)
    expect(src('core/briefing.ts')).toMatch(/windToBeach\(fromDeg, facing\)/)
    /* Nobody else classifies by their own angle arithmetic. */
    for (const p of ['components/SurfPage.tsx', 'components/Home.tsx']) expect(src(p)).not.toMatch(/['"]onshore['"]\s*:\s*['"]?\w+['"]?\s*\?|angleApart\([^)]*facing/)
  })
})
