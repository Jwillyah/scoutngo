import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  addSample,
  BAND_FLOOR_FT,
  buoyFaceFt,
  correctedRange,
  HOUR_MS,
  MAX_SAMPLES_PER_SPOT,
  MIN_SAMPLES,
  SKILL_WINDOW_DAYS,
  skillLine,
  spotKey,
  spotStats,
  UNTESTED_ERROR_FT,
  type SkillSample,
} from '../src/core/spotSkill.ts'
import { surfEstimate } from '../src/core/surf.ts'
import { buildBackup, isYours, restoreBackup } from '../src/lib/backup.ts'
import { MAX_SPOTS, readSkillBook, sampleDue, SPOT_SKILL_KEY, withSample, writeSkillBook } from '../src/lib/spotSkillStore.ts'
import { sampleFrom } from '../src/lib/useSpotSkill.ts'
import type { BuoyReading } from '../src/lib/buoy.ts'
import type { Hourly } from '../src/lib/tideSheetData.ts'

/* Batch N, Section 5: per-spot accuracy that tightens the range. */
const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 8, 12)

function memory(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init))
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
    map: m,
  }
}

/* A month of hourly pairs where the forecast ran `bias` ft high, with a small, fixed wobble (±0.1 ft). */
function month(bias: number, days = SKILL_WINDOW_DAYS): SkillSample[] {
  let out: SkillSample[] = []
  const hours = days * 24 - 1
  for (let i = hours; i >= 0; i -= 1) {
    const at = NOW - i * HOUR_MS
    const buoyFt = 2 + Math.sin(i / 7) * 1.2
    const wobble = ((i % 5) - 2) * 0.05
    out = addSample(out, { at, forecastFt: buoyFt + bias + wobble, buoyFt }, NOW)
  }
  return out
}

describe('per-spot bias and spread', () => {
  it('a spot whose forecast runs +0.8 ft high for 30 days is corrected, with a narrower band than no history', () => {
    const samples = month(0.8)
    const stats = spotStats(samples, NOW)
    expect(stats.n).toBe(SKILL_WINDOW_DAYS * 24)
    expect(stats.days).toBeGreaterThanOrEqual(SKILL_WINDOW_DAYS - 1)
    expect(stats.biasFt).toBeCloseTo(0.8, 1)
    expect(stats.spreadFt as number).toBeLessThan(0.2)

    const forecast = 3.5
    const modelSpread = 0.6
    const withHistory = correctedRange(forecast, modelSpread, stats)
    const without = correctedRange(forecast, modelSpread, spotStats([], NOW))
    console.log('corrected', withHistory, 'untested', without)
    expect(withHistory.corrected).toBe(true)
    expect(withHistory.centerFt).toBeCloseTo(forecast - 0.8, 1)
    expect(without.corrected).toBe(false)
    expect(without.centerFt).toBe(forecast)
    const width = (r: { lowFt: number; highFt: number }) => r.highFt - r.lowFt
    expect(width(withHistory)).toBeLessThan(width(without))
    /* No history: the models' half-spread and the untested error, root-sum-square. */
    expect(width(without) / 2).toBeCloseTo(Math.hypot(modelSpread / 2, UNTESTED_ERROR_FT), 6)
    expect(width(withHistory) / 2).toBeGreaterThanOrEqual(BAND_FLOOR_FT)
    expect(skillLine(stats, 'ft')).toBe(`last 30 days (${stats.n} hours): forecast ran 0.8 ft high here against the buoy, corrected`)
    expect(skillLine(stats, 'm')).toBe(`last 30 days (${stats.n} hours): forecast ran 0.2 m high here against the buoy, corrected`)
  })

  it('a spot that has proved erratic gets a wider band than an untested one', () => {
    let s: SkillSample[] = []
    for (let i = 0; i < 24 * 10; i += 1) s = addSample(s, { at: NOW - i * HOUR_MS, forecastFt: 3, buoyFt: i % 2 === 0 ? 1 : 5 }, NOW)
    const stats = spotStats(s, NOW)
    expect(stats.spreadFt as number).toBeGreaterThan(UNTESTED_ERROR_FT)
    const r = correctedRange(3, 0.6, stats)
    const u = correctedRange(3, 0.6, spotStats([], NOW))
    expect(r.highFt - r.lowFt).toBeGreaterThan(u.highFt - u.lowFt)
  })

  it('few samples: no correction, and the line says how many', () => {
    const s = month(0.8).slice(-(MIN_SAMPLES - 1))
    const stats = spotStats(s, NOW)
    expect(stats.n).toBe(MIN_SAMPLES - 1)
    const r = correctedRange(3.5, 0.6, stats)
    expect(r.corrected).toBe(false)
    expect(r.centerFt).toBe(3.5)
    expect(skillLine(stats, 'ft')).toBe('not enough history here yet (23 hours over 2 days)')
    expect(skillLine(spotStats([], NOW), 'ft')).toBe('no history here yet')
  })

  it('a full day of samples on fewer than three days is not enough either', () => {
    let s: SkillSample[] = []
    for (let i = 0; i < 48; i += 1) s = addSample(s, { at: Date.UTC(2026, 10, 6, 0) + i * HOUR_MS, forecastFt: 3, buoyFt: 2 }, NOW)
    const stats = spotStats(s, NOW)
    expect(stats.n).toBe(48)
    expect(stats.days).toBe(2)
    expect(correctedRange(3, null, stats).corrected).toBe(false)
  })

  it('trims to 30 days, one sample an hour, capped', () => {
    const long = month(0.8, 45)
    expect(long.length).toBeLessThanOrEqual(MAX_SAMPLES_PER_SPOT)
    expect(long.length).toBeGreaterThan(0)
    expect(Math.min(...long.map((s) => s.at))).toBeGreaterThan(NOW - SKILL_WINDOW_DAYS * DAY)
    /* Same hour twice: the later replaces the earlier. */
    const twice = addSample(addSample([], { at: NOW, forecastFt: 3, buoyFt: 2 }, NOW), { at: NOW + 60_000, forecastFt: 4, buoyFt: 2 }, NOW)
    expect(twice).toHaveLength(1)
    expect(twice[0].forecastFt).toBe(4)
    /* A sample older than the window drops out of the stats even if it was kept. */
    expect(spotStats([{ at: NOW - 31 * DAY, forecastFt: 9, buoyFt: 0 }], NOW).n).toBe(0)
  })

  it('keys a spot to two decimals', () => {
    expect(spotKey({ lat: 36.84123, lon: -75.97456 })).toBe('36.84,-75.97')
  })
})

describe('both sides through the same function', () => {
  const t0 = Date.UTC(2026, 10, 8, 11)
  const marine: Hourly = {
    times: [t0, t0 + HOUR_MS],
    values: { swell_wave_height: [1.2, 1.2], swell_wave_period: [9, 9], swell_wave_direction: [100, 100] },
  }
  const buoy = (waveM: number, periodS: number | null, fromDeg: number | null, at = new Date(t0 + 20 * 60_000)): BuoyReading => ({
    status: 'ok',
    buoy: { id: '44099', name: 'Cape Henry', at: { lat: 36.9, lon: -75.7 }, km: 23 },
    at,
    waveM,
    periodS,
    fromDeg,
    split: null,
  })

  it('the same sea gives the same face height on both sides', () => {
    const s = sampleFrom(marine, buoy(1.2, 9, 100), 90, NOW)
    expect(s).not.toBeNull()
    expect(s?.forecastFt).toBeCloseTo(s?.buoyFt as number, 9)
    expect(s?.buoyFt).toBeCloseTo(surfEstimate(1.2, 9, 100, 90).faceFt, 9)
    expect(s?.at).toBe(t0)
  })

  it('a smaller measured sea makes the forecast run high', () => {
    const s = sampleFrom(marine, buoy(0.9, 9, 100), 90, NOW) as SkillSample
    expect(s.forecastFt - s.buoyFt).toBeGreaterThan(0)
  })

  it('takes no sample it cannot work out', () => {
    expect(buoyFaceFt({ waveM: 1, periodS: null, fromDeg: 90 }, 90)).toBeNull()
    expect(buoyFaceFt({ waveM: 1, periodS: 8, fromDeg: null }, 90)).toBeNull()
    expect(sampleFrom(marine, buoy(1, 8, 90, new Date(NOW - 3 * HOUR_MS)), 90, NOW)).toBeNull()
    expect(sampleFrom(marine, { status: 'none', reason: 'x' }, 90, NOW)).toBeNull()
  })
})

describe('kept on this phone', () => {
  it('round-trips, at most once an hour, at most MAX_SPOTS spots', () => {
    const store = memory()
    let book = withSample({}, '36.84,-75.97', { at: NOW, forecastFt: 3.21, buoyFt: 2.4, rating: 'Fun' }, NOW)
    writeSkillBook(book, store)
    const back = readSkillBook(store)
    expect(back['36.84,-75.97'].samples).toEqual([{ at: NOW, forecastFt: 3.21, buoyFt: 2.4, rating: 'Fun' }])
    expect(sampleDue(back, '36.84,-75.97', NOW + HOUR_MS - 1)).toBe(false)
    expect(sampleDue(back, '36.84,-75.97', NOW + HOUR_MS)).toBe(true)
    for (let i = 0; i < MAX_SPOTS + 5; i += 1) book = withSample(book, `k${i}`, null, NOW + (i + 1) * 1000)
    expect(Object.keys(book)).toHaveLength(MAX_SPOTS)
    expect(book['36.84,-75.97']).toBeUndefined()
    expect(readSkillBook(memory({ [SPOT_SKILL_KEY]: 'not json' }))).toEqual({})
  })

  it('is in the backup file and comes back from it', () => {
    const store = memory()
    writeSkillBook(withSample({}, '36.84,-75.97', { at: NOW, forecastFt: 3, buoyFt: 2 }, NOW), store)
    expect(isYours(SPOT_SKILL_KEY)).toBe(true)
    const entries = buildBackup(store, new Date(NOW))
    const json = entries.find((e) => e.name === 'backup.json')
    expect(json).toBeDefined()
    const file = JSON.parse(new TextDecoder().decode(json?.bytes)) as { keys: Record<string, string> }
    expect(file.keys[SPOT_SKILL_KEY]).toBe(store.getItem(SPOT_SKILL_KEY))
    const fresh = memory()
    const restored = restoreBackup(json?.bytes as Uint8Array, fresh)
    expect(restored.ok).toBe(true)
    expect(readSkillBook(fresh)['36.84,-75.97'].samples).toHaveLength(1)
  })

  it('Privacy › Clear this phone removes it', () => {
    const page = readFileSync('src/components/PrivacyPage.tsx', 'utf8')
    expect(page).toMatch(/k\.startsWith\('scoutngo\.'\)\)\s*localStorage\.removeItem\(k\)/)
    expect(SPOT_SKILL_KEY.startsWith('scoutngo.')).toBe(true)
  })
})
