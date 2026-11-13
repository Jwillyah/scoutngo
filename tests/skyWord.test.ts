import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseMetarSky } from '../src/core/metar.ts'
import { freshSky, metarVisMiles, skyCondition, stationLayers } from '../src/core/skyWord.ts'

/*
 * ONE SKY WORD (Batch TRUTH, Section 0.6). 12 Nov, 7:21 AM at the Virginia
 * Beach pier: the home said "Fog", the map strip "Overcast", under a mackerel
 * sky. The inputs the phone had: HRRR's 09Z run for 12Z (weather code 45,
 * low cloud 100%, visibility 100 m; tests/data/sunrise-2026-11-12/
 * hrrr-09z-pier.json, Open-Meteo's single-runs archive) and KNTU's 11:56Z
 * report (metars.txt there).
 */
const hrrr = JSON.parse(readFileSync('tests/data/sunrise-2026-11-12/hrrr-09z-pier.json', 'utf8')) as { hourly: Record<string, (number | string | null)[]> }
const i = hrrr.hourly.time.indexOf('2026-11-12T12:00')
const code = hrrr.hourly.weather_code[i] as number
const layers = { low: hrrr.hourly.cloud_cover_low[i] as number, mid: hrrr.hourly.cloud_cover_mid[i] as number, high: hrrr.hourly.cloud_cover_high[i] as number }
const KNTU = 'KNTU 121156Z 22004KT 10SM BKN120 13/12 A2957 RMK AO2 SLP016 60000 T01330122 10133 20111 56015'

describe('12 Nov 7:21: no Fog, and one word for the home and the strip', () => {
  it('the model said fog at the pier, and the home showed it (fixtures/truth/2026-11-12-vb.json)', () => {
    const truth = JSON.parse(readFileSync('fixtures/truth/2026-11-12-vb.json', 'utf8')) as { sunrise: { weShowed: { home: string } } }
    expect(truth.sunrise.weShowed.home).toBe('Fog')
    expect(code).toBe(45)
    expect(layers.low).toBe(100)
  })
  it('KNTU read 10 miles: not Fog; the word comes from the layers, with the station\'s low and mid', () => {
    const station = { sky: parseMetarSky(KNTU), visMi: metarVisMiles(KNTU) }
    const home = skyCondition({ code, layers, day: true, station })
    const strip = skyCondition({ code: null, layers, day: true, station })
    expect(home?.word).not.toBe('Fog')
    expect(home?.word).toBe(strip?.word)
    /* Nothing under 6,500 ft, a broken deck at 12,000: mostly cloudy, not the model's overcast low deck. */
    expect(home?.word).toBe('Mostly cloudy')
  })
  it('without a fresh station, the model\'s fog code is still not the word: the layers are', () => {
    expect(skyCondition({ code, layers, day: true, station: null })?.word).toBe('Overcast')
    expect(skyCondition({ code: 45, layers: null, day: true, station: null })).toBeNull()
  })
  it('Fog only when the station measures under a mile', () => {
    const fog = 'KNTU 120156Z AUTO 00000KT 1/2SM FG VV002 12/12 A2978 RMK AO2 SLP086 T01220122'
    expect(metarVisMiles(fog)).toBe(0.5)
    expect(skyCondition({ code: 0, layers, day: false, station: { sky: parseMetarSky(fog), visMi: metarVisMiles(fog) } })?.word).toBe('Fog')
    const mist = 'KNTU 120215Z AUTO 00000KT 2 1/2SM BR FEW003 12/12 A2977 RMK AO2'
    expect(metarVisMiles(mist)).toBe(2.5)
    expect(skyCondition({ code: 45, layers, day: false, station: { sky: parseMetarSky(mist), visMi: metarVisMiles(mist) } })?.word).not.toBe('Fog')
  })
  it('rain is still the model\'s word', () => {
    expect(skyCondition({ code: 63, layers, day: true, station: null })?.word).toBe('Rain')
  })
  it('a station\'s report as layers', () => {
    expect(stationLayers(parseMetarSky('KORF 121051Z 20004KT 9SM CLR 12/11 A2958')!)).toEqual({ low: 0, mid: null })
    expect(stationLayers(parseMetarSky('KNGU 120759Z 18006KT 9SM SCT046 BKN100 14/12 A2965')!)).toEqual({ low: 50, mid: 75 })
    expect(metarVisMiles('KXXX 121156Z 00000KT M1/4SM FG VV001')).toBeLessThan(0.25)
    expect(metarVisMiles('KXXX 121156Z 00000KT P6SM SKC')).toBe(6)
  })
})

describe('the home and the map strip ask the same function', () => {
  it('both call skyCondition; neither words the sky from the code or the layers alone', () => {
    const home = readFileSync('src/components/Home.tsx', 'utf8')
    const plan = readFileSync('src/components/PlanMode.tsx', 'utf8')
    expect(home).toMatch(/const cond = skyCondition\(/)
    expect(plan).toMatch(/const sky = skyCondition\(/)
    expect(plan).not.toMatch(/skyCell\(/)
    expect(home).not.toMatch(/const cond = conditionOf\(/)
  })
})

/*
 * THE STATION'S OWN WORD (Batch NOW, Section 1.3; fixtures/truth/2026-11-13-vb.json,
 * fixtures/truth/2026-11-12-vb-sunset.json). KNTU's reports from
 * tests/data/metars-2026-11-12-13.txt (the Iowa Environmental Mesonet's archive).
 */
describe('one sky word, the station first (Batch NOW)', () => {
  const rows = readFileSync('tests/data/metars-2026-11-12-13.txt', 'utf8').split('\n').filter((l) => /^(NTU|ORF),/.test(l))
  const latest = (id: string, at: string) =>
    rows
      .map((l) => l.split(','))
      .filter(([st, t]) => st === id && new Date(`${t.replace(' ', 'T')}:00Z`) <= new Date(at))
      .map(([, t, m]) => ({ at: new Date(`${t.replace(' ', 'T')}:00Z`), raw: m }))
      .at(-1)!
  const wordAt = (id: string, at: string, model: { low: number; mid: number; high: number }) => {
    const r = latest(id, at)
    const station = freshSky({ sky: parseMetarSky(r.raw), visMi: metarVisMiles(r.raw), skyAt: r.at }, new Date(at))
    expect(station).not.toBeNull()
    return skyCondition({ code: 3, layers: model, day: true, station })?.word
  }
  const overcastModel = { low: 100, mid: 100, high: 0 }
  const clearModel = { low: 0, mid: 0, high: 0 }
  it('12 Nov 7:21 AM: not Overcast (KNTU BKN120)', () => {
    expect(wordAt('NTU', '2026-11-12T12:21:00Z', overcastModel)).toBe('Mostly cloudy')
  })
  it('13 Nov 7:55 AM: not Overcast (KNTU FEW050 BKN065, 59 min old)', () => {
    expect(wordAt('NTU', '2026-11-13T12:55:00Z', overcastModel)).toBe('Mostly cloudy')
  })
  it('12 Nov 4:36 PM: not Clear (KNTU three broken decks; KORF a few at 9,000 ft)', () => {
    expect(wordAt('NTU', '2026-11-12T21:36:00Z', clearModel)).toBe('Mostly cloudy')
    expect(wordAt('ORF', '2026-11-12T21:36:00Z', clearModel)).toBe('Few clouds')
  })
  it('Pembroke and Sandbridge: the same station, the same word, whatever each spot\'s model says', () => {
    expect(wordAt('NTU', '2026-11-13T12:55:00Z', overcastModel)).toBe(wordAt('NTU', '2026-11-13T12:55:00Z', clearModel))
  })
  it('FEW, SCT, BKN, OVC in words; CLR is Clear only when the sky above is empty too', () => {
    const w = (m: string, extra: Partial<Parameters<typeof skyCondition>[0]> = {}) => skyCondition({ code: 0, layers: { low: 0, mid: 0, high: 0 }, day: true, station: { sky: parseMetarSky(m), visMi: 10 }, ...extra })?.word
    expect(w('KXXX 131256Z 00000KT 10SM FEW040 A2961')).toBe('Few clouds')
    expect(w('KXXX 131256Z 00000KT 10SM SCT040 A2961')).toBe('Partly cloudy')
    expect(w('KXXX 131256Z 00000KT 10SM FEW040 BKN065 A2961')).toBe('Mostly cloudy')
    expect(w('KXXX 131256Z 00000KT 10SM OVC060 A2961')).toBe('Overcast')
    expect(w('KXXX 131256Z 00000KT 10SM CLR A2961')).toBe('Clear')
    expect(w('KXXX 131256Z 00000KT 10SM CLR A2961', { satCover: 40 })).not.toBe('Clear')
    expect(w('KXXX 131256Z 00000KT 10SM CLR A2961', { layers: { low: 0, mid: 0, high: 70 } })).toBe('High cloud')
  })
  it('a report older than 75 minutes is not the word', () => {
    const r = latest('NTU', '2026-11-13T12:55:00Z')
    expect(freshSky({ sky: parseMetarSky(r.raw), visMi: 10, skyAt: r.at }, new Date(r.at.getTime() + 76 * 60_000))).toBeNull()
  })
})
