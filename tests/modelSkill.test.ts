import { describe, expect, it } from 'vitest'
import {
  addDay,
  blendHour,
  blendRun,
  blendDays,
  cloudWords,
  coverFromLayers,
  rainChance,
  scoreDay,
  skillAt,
  SKILL_DAYS,
  wetFromCodes,
  weights,
  type ModelId,
  type SkillDay,
  type SkillHistory,
  type StationObs,
} from '../src/core/modelSkill.ts'

/** A history where every hour of every day has the same error per model. */
function history(errs: Partial<Record<ModelId, number>>, days = 30, v: 'temp' | 'wind' = 'temp'): SkillHistory {
  let h: SkillHistory = { stations: 'KNTU,KORF', days: [] }
  for (let d = 0; d < days; d += 1) {
    const date = `2026-10-${String(d + 1).padStart(2, '0')}`
    const err: SkillDay['err'] = {}
    for (const [m, e] of Object.entries(errs)) err[m as ModelId] = { [v]: Array.from({ length: 24 }, () => e + (d % 2 === 0 ? 0.3 : -0.3)) }
    h = addDay(h, { date, err })
  }
  return h
}

describe('the bias correction (Batch K, Section 1)', () => {
  it('removes a model that runs 2° warm: the blend is the truth, not the average', () => {
    /* Truth 15 °C. ECMWF has been right here; GFS has run +2 every day for 30 days. */
    const h = history({ ecmwf_ifs025: 0, gfs_global: 2 })
    expect(skillAt(h, 'gfs_global', 'temp', 14).bias).toBeCloseTo(2, 5)
    const b = blendHour(h, 'temp', 14, { ecmwf_ifs025: 15, gfs_global: 17 })
    expect(b.value).toBeCloseTo(15, 5)
    expect(b.models.find((m) => m.model === 'gfs_global')?.value).toBeCloseTo(15, 5)
    /* And the spread closes: both corrected models now say 15. */
    expect((b.hi ?? 0) - (b.lo ?? 0)).toBeCloseTo(0, 5)
  })

  it('with no history, every model weighs the same and nothing is shifted', () => {
    const b = blendHour(null, 'temp', 14, { ecmwf_ifs025: 15, gfs_global: 17 })
    expect(b.value).toBeCloseTo(16, 5)
    expect(b.lo).toBe(15)
    expect(b.hi).toBe(17)
  })

  it('a model with no history gets the mean weight of those that have one', () => {
    const h = history({ ecmwf_ifs025: 0, gfs_global: 0 })
    const w = weights(h, ['ecmwf_ifs025', 'gfs_global', 'icon_seamless'], 'temp', 3)
    expect(w.get('icon_seamless')).toBeCloseTo(1 / 3, 5)
  })

  it('a model that scatters weighs less than one that is steady', () => {
    let h: SkillHistory = { stations: 'KNTU', days: [] }
    for (let d = 0; d < 30; d += 1) {
      const wild = d % 2 === 0 ? 4 : -4
      h = addDay(h, { date: `2026-10-${String(d + 1).padStart(2, '0')}`, err: { ecmwf_ifs025: { temp: Array(24).fill(0.2) }, gfs_global: { temp: Array(24).fill(wild) } } })
    }
    const w = weights(h, ['ecmwf_ifs025', 'gfs_global'], 'temp', 10)
    expect(w.get('ecmwf_ifs025')).toBeGreaterThan(0.9)
  })

  it('needs three days before it shifts anything', () => {
    const h = history({ gfs_global: 2 }, 2)
    expect(skillAt(h, 'gfs_global', 'temp', 5).bias).toBeNull()
    expect(blendHour(h, 'temp', 5, { gfs_global: 17 }).value).toBe(17)
  })

  it('keeps only the last 30 days', () => {
    const h = history({ gfs_global: 1 }, 40)
    expect(h.days.length).toBe(SKILL_DAYS)
    expect(h.days[0].date).toBe('2026-10-11')
  })

  it('wind and cloud never go below zero, cloud never above 100', () => {
    const h = history({ gfs_global: 3 }, 30, 'wind')
    expect(blendHour(h, 'wind', 2, { gfs_global: 1 }).value).toBe(0)
  })
})

describe('scoring a day against the stations', () => {
  const at = (hh: number) => new Date(Date.UTC(2026, 10, 2, hh + 5))
  const hours = Array.from({ length: 24 }, (_, i) => at(i))
  const obs: StationObs[] = hours.flatMap((h) => [
    { station: 'KNTU', at: new Date(h.getTime() - 4 * 60_000), tempC: 10, windMps: 3, gustMps: null, cloudPct: null, wet: false },
    { station: 'KORF', at: new Date(h.getTime() - 9 * 60_000), tempC: 12, windMps: 5, gustMps: 9, cloudPct: 75, wet: h.getUTCHours() === 20 },
  ])
  const series = (v: number) => new Map(hours.map((h) => [h.toISOString().slice(0, 16), v]))
  const day = scoreDay('2026-11-02', hours, ['KNTU', 'KORF'], obs, {
    KNTU: { gfs_global: { temp: series(13), wind: series(4), gust: series(6), cloud: series(50), rain: series(0) } },
    KORF: { gfs_global: { temp: series(13), wind: series(4), gust: series(6), cloud: series(50), rain: series(0) } },
  })

  it('a forecast of 13 against 10 and 12 is +2 on average', () => {
    expect(day.err.gfs_global?.temp?.[0]).toBe(2)
  })
  it('a gust with no gust group is scored against the steady wind', () => {
    /* KNTU: 6 - 3 = 3; KORF: 6 - 9 = -3 */
    expect(day.err.gfs_global?.gust?.[0]).toBe(0)
  })
  it('CLR is not scored for cloud', () => {
    /* only KORF's 75 % counts: 50 - 75 */
    expect(day.err.gfs_global?.cloud?.[0]).toBe(-25)
  })
  it('rain is a hit or a miss', () => {
    /* 15 local = 20 UTC: KORF wet, model dry: one miss and one hit */
    expect(day.err.gfs_global?.rain?.[15]).toBe(0.5)
    expect(day.err.gfs_global?.rain?.[3]).toBe(1)
  })
  it('a model with no forecast is not in the day', () => {
    expect(day.err.ecmwf_ifs025).toBeUndefined()
  })
})

describe('reports as numbers', () => {
  it('cover from layers', () => {
    expect(coverFromLayers(['FEW', 'BKN', null])).toBe(75)
    expect(coverFromLayers(['CLR', null])).toBeNull()
  })
  it('vicinity showers are not rain at the station', () => {
    expect(wetFromCodes('VCSH')).toBe(false)
    expect(wetFromCodes('-RA BR')).toBe(true)
    expect(wetFromCodes('TSRA')).toBe(true)
    expect(wetFromCodes(null)).toBe(false)
  })
  it('rain chance is the weighted share of wet models', () => {
    expect(rainChance(null, 10, { gfs_global: 1, ecmwf_ifs025: 0, icon_seamless: 0.5, gfs_hrrr: 0 }).chance).toBeCloseTo(0.5, 5)
  })
})

describe('the seven days', () => {
  it('a day high, its spread across the models, and when rain is likeliest', () => {
    const times = Array.from({ length: 48 }, (_, i) => new Date(Date.UTC(2026, 10, 3, 5 + i)).toISOString().slice(0, 16))
    const run = {
      times,
      series: {
        gfs_global: { temp: times.map((_, i) => 10 + (i % 24 === 14 ? 8 : 0)), rain: times.map((_, i) => (i % 24 === 16 ? 2 : 0)) },
        ecmwf_ifs025: { temp: times.map((_, i) => 10 + (i % 24 === 14 ? 6 : 0)), rain: times.map(() => 0) },
      },
    }
    const days = blendDays(blendRun(run, null, 'America/New_York'), 'America/New_York')
    expect(days[0].date).toBe('2026-11-03')
    expect(days[0].hi).toBe(17)
    expect(days[0].hiLo).toBe(16)
    expect(days[0].hiHi).toBe(18)
    expect(days[0].rainChance).toBeCloseTo(0.5, 5)
    expect(days[0].rainFrom?.toISOString()).toBe('2026-11-03T21:00:00.000Z')
  })
})

describe('the Weather tab says cloud as an amount', () => {
  it('never "clear"', () => {
    for (const p of [0, 10, 30, 60, 90, 100, null]) expect(cloudWords(p)).not.toMatch(/clear|safe/i)
    expect(cloudWords(5)).toBe('little cloud')
  })
})
