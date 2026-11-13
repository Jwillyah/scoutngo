import { describe, expect, it } from 'vitest'
import { cloudHeightWord, cloudTile, pressureTrend, pressureWords, rainTileLine, uvBand, uvLine } from '../src/core/weatherTiles.ts'
import { cloudWords } from '../src/core/modelSkill.ts'
import { parseMetarSky } from '../src/core/metar.ts'

/* The Weather page's six tiles (Batch Pages, Section 2; board WeatherPage). */
const T0 = Date.parse('2026-11-09T17:00:00Z')
const h = (k: number) => new Date(T0 + k * 3_600_000)
const clock = (d: Date) => `${(d.getUTCHours() + 19) % 24}h`

describe('the UV tile', () => {
  it('the WHO bands by their lower bounds', () => {
    expect(uvBand(0).word).toBe('low')
    expect(uvBand(2.9).word).toBe('low')
    expect(uvBand(3).word).toBe('moderate')
    expect(uvBand(6).word).toBe('high')
    expect(uvBand(8).word).toBe('very high')
    expect(uvBand(11).word).toBe('extreme')
  })
  it('"moderate till" the hour it drops below its band; low and rising: when; low all day; no forecast: null', () => {
    expect(uvLine(3, [{ at: h(1), uv: 3 }, { at: h(2), uv: 2 }], clock)).toBe(`moderate till ${clock(h(2))}`)
    expect(uvLine(1, [{ at: h(1), uv: 2 }, { at: h(2), uv: 4 }], clock)).toBe(`low, moderate from ${clock(h(2))}`)
    expect(uvLine(0, [{ at: h(1), uv: 1 }], clock)).toBe('low all day')
    expect(uvLine(null, [], clock)).toBeNull()
  })
})

describe('the Pressure tile', () => {
  it('steady under 1 hPa in three hours, else rising or falling; a dash when the forecast said nothing', () => {
    expect(pressureTrend(1019.8, 1019.5)).toBe('steady')
    expect(pressureTrend(1021, 1019.5)).toBe('rising')
    expect(pressureTrend(1017, 1019.5)).toBe('falling')
    expect(pressureTrend(null, 1019)).toBeNull()
  })
  it('inches of mercury in feet and miles, hPa in metres', () => {
    expect(pressureWords(1019.8, true)).toBe('30.11')
    expect(pressureWords(1019.8, false)).toBe('1020 hPa')
    expect(pressureWords(null, true)).toBe('—')
  })
})

describe('the Cloud tile', () => {
  it('the station first: the most cloud it reports, how high, and which station', () => {
    expect(cloudTile(parseMetarSky('KNTU 091953Z 29008KT 10SM FEW250 18/06 A3012'), 30, cloudWords)).toEqual({ big: 'Few clouds', line: 'high, at KNTU' })
    expect(cloudTile(parseMetarSky('KNTU 091953Z 29008KT 10SM SCT035 BKN120 18/06 A3012'), 30, cloudWords)).toEqual({ big: 'Mostly cloudy', line: 'mid, at KNTU' })
    /* Batch NOW, Section 1.4: CLR under forecast cloud is not "Clear". */
    expect(cloudTile(parseMetarSky('KORF 091953Z 29008KT 10SM CLR 18/06 A3012'), 30, cloudWords)).toEqual({ big: 'Above 12,000 ft', line: 'KORF clear below' })
    expect(cloudTile(parseMetarSky('KNTU 091953Z 29008KT 10SM CLR 18/06 A3012'), 5, cloudWords)).toEqual({ big: 'Clear', line: 'below 12,000 ft, at KNTU' })
  })
  it('no station: the forecast, said as the forecast; nothing: a dash', () => {
    expect(cloudTile(null, 40, cloudWords)).toEqual({ big: 'Partly cloudy', line: 'forecast' })
    expect(cloudTile(null, null, cloudWords)).toEqual({ big: '—', line: 'not said' })
  })
  it('heights: low under 6,500 ft, high from 20,000 ft', () => {
    expect(cloudHeightWord(3000)).toBe('low')
    expect(cloudHeightWord(12000)).toBe('mid')
    expect(cloudHeightWord(25000)).toBe('high')
  })
})

describe('the Rain tile', () => {
  it('none in the next 6 hours, from when, or now; not said when the models said nothing', () => {
    const now = h(0)
    expect(rainTileLine([{ at: h(0), chance: 0 }, { at: h(1), chance: 0.1 }], now, clock)).toBe('none next 6 h')
    expect(rainTileLine([{ at: h(0), chance: 0 }, { at: h(3), chance: 0.5 }], now, clock)).toBe(`from ${clock(h(3))}`)
    expect(rainTileLine([{ at: h(0), chance: 0.6 }], now, clock)).toBe('now')
    expect(rainTileLine([{ at: h(0), chance: null }], now, clock)).toBe('not said')
  })
})
