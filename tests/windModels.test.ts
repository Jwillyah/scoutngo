import { describe, expect, it } from 'vitest'
import { circularMean, overRated, quantile, summarise, windTo } from '../src/core/windModels.ts'
import { parseMetarWind } from '../src/core/metar.ts'
import { parseWindModels, windModelsUrl, WIND_MODELS } from '../src/lib/windModelsData.ts'
import { parseRealtimeWind } from '../api/buoy.ts'
import { windToBeach } from '../src/core/coastFacing.ts'

describe('FROM and TO', () => {
  it('a north wind comes from 0° and blows to 180°: the arrow points south', () => {
    expect(windTo(0)).toBe(180)
    expect(windTo(270)).toBe(90)
    expect(windTo(200)).toBe(20)
  })

  it('offshore is the wind coming from the land: FROM, not TO', () => {
    /* A beach facing east (90°): a west wind (from 270°) blows off the land, out to sea. */
    expect(windToBeach(270, 90)).toBe('offshore')
    expect(windToBeach(90, 90)).toBe('onshore')
  })

  it('a METAR says where the wind comes from, in knots', () => {
    expect(parseMetarWind('METAR KNTU 291056Z 02007KT 10SM BKN030')).toEqual({ fromDeg: 20, kt: 7, gustKt: null })
    expect(parseMetarWind('KORF 291051Z 27015G25KT 10SM')).toEqual({ fromDeg: 270, kt: 15, gustKt: 25 })
    expect(parseMetarWind('KORF 291051Z VRB03KT 10SM')).toEqual({ fromDeg: null, kt: 3, gustKt: null })
  })

  it('a buoy file’s WDIR is FROM too, and its speed is m/s', () => {
    const text = '#YY  MM DD hh mm WDIR WSPD GST  WVHT\n#yr  mo dy hr mn degT m/s  m/s     m\n2026 10 30 02 40 350  6.0  8.0   MM\n'
    expect(parseRealtimeWind(text)).toEqual({ at: '2026-10-30T02:40:00Z', mps: 6, fromDeg: 350, gustMps: 8 })
  })
})

describe('five models into one number', () => {
  it('averages directions round the circle: 350° and 10° are north, not south', () => {
    expect(circularMean([350, 10])).toBeCloseTo(0, 6)
    expect(circularMean([80, 100])).toBeCloseTo(90, 6)
    /* Opposite winds have no prevailing direction, and it is not invented. */
    expect(circularMean([0, 180])).toBeNull()
  })

  it('reads the median and the 10-90% range, so one wild model does not move it', () => {
    const h = summarise([4, 5, 5, 6, 20], [0, 10, 350, 5, 355], [9, 11, 10, 12, 30])
    expect(h.median).toBe(5)
    expect(h.p10).toBeCloseTo(4.4, 6)
    expect(h.p90).toBeCloseTo(14.4, 6)
    expect(h.gust).toBe(30)
    expect(h.models).toBe(5)
    expect(quantile([], 0.5)).toBeNull()
  })

  it('says over the rating, and never under it as safe', () => {
    expect(overRated(12.5, 12)).toBe(true)
    expect(overRated(11, 12)).toBe(false)
    expect(overRated(null, 12)).toBe(false)
  })

  it('asks five models at three heights, the venue to 2 decimals', () => {
    const u = new URL(windModelsUrl({ lat: 36.8435575, lon: -75.9713104 }))
    expect(u.searchParams.get('latitude')).toBe('36.84')
    expect(u.searchParams.get('models')).toBe(WIND_MODELS.join(','))
    expect(u.searchParams.get('hourly')).toMatch(/wind_speed_120m/)
    const payload = { hourly: { time: ['2026-10-30T12:00'], ...Object.fromEntries(WIND_MODELS.flatMap((m, i) => [[`wind_speed_10m_${m}`, [4 + i]], [`wind_direction_10m_${m}`, [i * 5]], [`wind_gusts_10m_${m}`, [8]]])) } }
    const w = parseWindModels(payload)
    expect(w?.byLevel.ground[0].median).toBe(6)
    expect(w?.byLevel.ground[0].models).toBe(5)
    expect(w?.byLevel['120m'][0].models).toBe(0)
  })
})
