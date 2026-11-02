import { describe, expect, it } from 'vitest'
import { byDay, cloudWord, godRaysRule, iridescenceRule, mergeOverlaps, strong, type Special } from '../src/core/specialLight.ts'
import { parseThin, SPECIAL_MODELS, specialsFrom, thinUrl, type SpecialWeek } from '../src/lib/specialLightData.ts'

/* Batch E, Section 1: fewer, truer alerts (phone, VB Fishing Pier, 1 Nov 8:44 AM). */
const PIER = { lat: 36.8435575, lon: -75.9713104 }

describe('god rays', () => {
  it('0% and 1% low cloud are not god rays, and are not "broken"', () => {
    expect(godRaysRule(12, 0)).toBe(false)
    expect(godRaysRule(12, 1)).toBe(false)
    expect(cloudWord(0)).toBe('clear')
    expect(cloudWord(1)).toBe('clear')
    expect(cloudWord(45)).toBe('scattered')
    expect(cloudWord(70)).toBe('broken')
  })

  /* Five models, one of them 45% low cloud at the pier for a morning, the rest 0%. */
  const week = (() => {
    const hours = Array.from({ length: 24 }, (_, i) => new Date(Date.UTC(2026, 10, 1, i)))
    const series: SpecialWeek['series'] = {}
    SPECIAL_MODELS.forEach((m, k) => {
      const low = hours.map((t) => (k === 0 && t.getUTCHours() >= 12 && t.getUTCHours() <= 14 ? 45 : 0))
      const pt = { temperature_2m: hours.map(() => 60), dew_point_2m: hours.map(() => 40), wind_speed_10m: hours.map(() => 10), cloud_cover_low: low, showers: hours.map(() => 0) }
      series[m] = Array.from({ length: 9 }, () => pt)
    })
    return { hours, series } as SpecialWeek
  })()

  it('says the cover of the model that said yes, never the 0% median of all five', () => {
    const rays = specialsFrom(week, PIER, () => null).filter((s) => s.kind === 'rays')
    expect(rays.length).toBe(1)
    expect(rays[0].agree).toBe(1)
    expect(rays[0].of).toBe(5)
    expect(rays[0].why).toContain('Low cloud 45%, scattered')
    expect(rays[0].why).not.toMatch(/\b0%|broken/)
  })

  it('1 of 5 models does not interrupt: no map chip, a long shot in the list', () => {
    const rays = specialsFrom(week, PIER, () => null).filter((s) => s.kind === 'rays')
    expect(strong(rays[0])).toBe(false)
    const days = byDay(rays, (d) => d.toISOString().slice(0, 10))
    expect(days[0].items).toEqual([])
    expect(days[0].longShots.length).toBe(1)
  })
})

describe('iridescence', () => {
  it('thin mid or high cloud with the sun up and little low cloud', () => {
    expect(iridescenceRule(30, 5, 30, 10)).toBe(true)
    expect(iridescenceRule(30, 5, 0, 5)).toBe(false) /* nothing thin */
    expect(iridescenceRule(30, 5, 95, 0)).toBe(false) /* overcast, not thin */
    expect(iridescenceRule(30, 70, 30, 0)).toBe(false) /* low cloud hides the sun */
    expect(iridescenceRule(2, 5, 30, 0)).toBe(false) /* sun too low */
    expect(iridescenceRule(30, 5, null, null)).toBeNull()
  })

  it('asks one point, two variables, the five models', () => {
    const u = new URL(thinUrl(PIER))
    expect(u.searchParams.get('latitude')).toBe('36.84')
    expect(u.searchParams.get('hourly')).toBe('cloud_cover_mid,cloud_cover_high')
    expect(u.searchParams.get('models')).toBe(SPECIAL_MODELS.join(','))
  })

  it('lines the thin cloud up on the week by time, and finds it', () => {
    const hours = Array.from({ length: 24 }, (_, i) => new Date(Date.UTC(2026, 10, 1, i)))
    const time = hours.map((t) => t.toISOString().slice(0, 16))
    const hourly: Record<string, unknown> = { time }
    for (const m of SPECIAL_MODELS) {
      hourly[`cloud_cover_mid_${m}`] = hours.map(() => 30)
      hourly[`cloud_cover_high_${m}`] = hours.map(() => 10)
    }
    const thin = parseThin({ hourly }, hours)
    expect(thin?.[SPECIAL_MODELS[0]].mid[13]).toBe(30)
    const series: SpecialWeek['series'] = {}
    for (const m of SPECIAL_MODELS) {
      const pt = { temperature_2m: hours.map(() => 60), dew_point_2m: hours.map(() => 40), wind_speed_10m: hours.map(() => 10), cloud_cover_low: hours.map(() => 5), showers: hours.map(() => 0) }
      series[m] = Array.from({ length: 9 }, () => pt)
    }
    const irid = specialsFrom({ hours, series, thin }, PIER, () => null).filter((s) => s.kind === 'iridescence')
    expect(irid.length).toBe(1)
    expect(irid[0].agree).toBe(5)
    expect(irid[0].why).toContain('within about 10° of the sun')
  })
})

describe('the list by day', () => {
  const at = (h: number) => new Date(Date.UTC(2026, 10, 1, h))
  const s = (kind: Special['kind'], from: number, to: number, agree: number): Special => ({ kind, from: at(from), to: at(to), agree, of: 5, word: agree >= 3 ? 'likely' : 'possible', why: '' })

  it('merges overlapping windows of a kind, keeping the better agreement', () => {
    const m = mergeOverlaps([s('rays', 11, 13, 2), s('rays', 12, 15, 4), s('fog', 12, 13, 5)])
    /* Batch G: a join longer than two hours keeps only the better window. */
    expect(m.map((x) => `${x.kind} ${x.from.getUTCHours()}-${x.to.getUTCHours()} ${x.agree}`)).toEqual(['fog 12-13 5', 'rays 12-15 4'])
  })

  it('at most three a day, the most likely first', () => {
    const days = byDay([s('rays', 10, 11, 3), s('fog', 6, 7, 5), s('rainbow', 15, 16, 4), s('iridescence', 13, 14, 3), s('glass', 5, 6, 5)], (d) => d.toISOString().slice(0, 10))
    expect(days.length).toBe(1)
    expect(days[0].items.map((x) => x.kind)).toEqual(['glass', 'fog', 'rainbow'])
  })
})
