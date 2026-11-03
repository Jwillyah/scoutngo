import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fireVerdict, leadLayer, type FireContext } from '../src/core/fireOutlook.ts'
import { satRead } from '../src/core/goesNowcast.ts'
import { CEILOMETER_FT, clearMeans, deckTruth, layerOfFt, layerWords, moistLayers, parsePirepSky, phaseOf, rhForCloud, stationDeck, topFromTemperature } from '../src/core/layerTruth.ts'
import { parseMetarSky, type MetarSky } from '../src/core/metar.ts'
import { LAYER_WORD } from '../src/core/skyColour.ts'
import { parseFirePaths, pathsAt } from '../src/lib/skyFireData.ts'
import { launchFor, parseProfile, parseRaob, pirepDeck, truthFrom } from '../src/lib/skyObsData.ts'

/*
 * TRUTH CASE #5 (Batch J): the 2 Nov 2026 sunset at Chix Beach, Virginia
 * Beach. A mid-level altocumulus deck lit orange from underneath while the
 * sun sat in a clear slot on the WSW horizon (about 5:03-5:08 PM), then pink
 * overhead, fading by about 5:25 (Jwilly's drone photos; until the photo
 * times come, the observed window is 5:00-5:20). It FIRED. At 4:28 PM the
 * app said Maybe, "3 of 5 see lit high cirrus".
 *
 * Everything here is what was there at T-60 (4:06 PM): the reports issued by
 * then, the satellite frame of 3:50 PM, the forecast's figures for the hour.
 * Kept by scripts/capture-truth-5.mjs in tests/data/truth5-2026-11-02-sunset/.
 */
const DIR = 'tests/data/truth5-2026-11-02-sunset'
const fx = JSON.parse(readFileSync('tests/data/sky-fire-2026-11-02-sunset.json', 'utf8')) as { payload: unknown; hour: string; event: string; venue: { lat: number; lon: number }; azimuth: number }
export const EVENT = new Date(fx.event)
export const T60 = new Date(EVENT.getTime() - 60 * 60_000)
export const VENUE = fx.venue
export const AZIMUTH = fx.azimuth

/** Every METAR in the archive, by station, with its time. */
export const METARS = readFileSync(`${DIR}/metars.csv`, 'utf8')
  .split('\n')
  .filter((l) => /^[A-Z0-9]{3,4},2026/.test(l))
  .map((l) => {
    const f = l.split(',')
    return { id: f[0], at: new Date(`${f[1].replace(' ', 'T')}:00Z`), lon: Number(f[2]), lat: Number(f[3]), text: f.slice(4).join(',') }
  })
/** The latest report from a station issued by `t`. */
export function latestBy(id: string, t: Date): { sky: MetarSky; at: Date } | null {
  const r = METARS.filter((m) => m.id === id && m.at <= t).sort((a, b) => b.at.getTime() - a.at.getTime())[0]
  const sky = r === undefined ? null : parseMetarSky(r.text)
  return r === undefined || sky === null ? null : { sky, at: r.at }
}
const PIREPS = readFileSync(`${DIR}/pireps.csv`, 'utf8')
  .split('\n')
  .filter((l) => /^\d{12},/.test(l))
  .filter((l) => new Date(`${l.slice(0, 4)}-${l.slice(4, 6)}-${l.slice(6, 8)}T${l.slice(8, 10)}:${l.slice(10, 12)}:00Z`) <= T60)
  .map((l) => l.split(',')[3])
export const PROFILE = parseProfile(JSON.parse(readFileSync(`${DIR}/profile.json`, 'utf8')).payload, EVENT)
const GOES = JSON.parse(readFileSync(`${DIR}/goes.json`, 'utf8')) as { frames: Record<string, { km: number; c: number | null }[]> }
/** The frame the app could have read at T-60 (GIBS runs about 20 minutes behind). */
export const SAT = satRead(GOES.frames['2026-11-02T20:50:00.000Z'], new Date('2026-11-02T20:50:00Z'), PROFILE?.airC ?? null)
export const PATHS = pathsAt(parseFirePaths(fx.payload)!, fx.hour)
export const STATION = latestBy('NTU', T60)

export function verdictAtT60() {
  const ctx: FireContext = { event: EVENT, kind: 'sunset', venue: VENUE, aod: 0.11, station: STATION }
  return fireVerdict(PATHS, ctx)
}

describe('truth case #5, kept', () => {
  it('KNTU at T-60 is the BKN120 Jwilly saw: a deck at the ceilometer\'s limit', () => {
    expect(STATION?.sky.groups.map((g) => `${g.amount}${g.baseFt}`)).toEqual(['BKN12000', 'BKN25000'])
    expect(stationDeck(STATION!.sky)).toEqual({ station: 'KNTU', amount: 'BKN', baseFt: 12000, atLeast: true })
  })
  it('the forecast said it (the latest run\'s figures for the hour), and the satellite saw cloud over you and warm beyond', () => {
    expect(PATHS.length).toBe(6)
    expect(SAT?.canvas).toBe(true)
  })
})

describe('Section 1: layer truth', () => {
  it('names a layer by its base: under 6,500 ft low, to 20,000 mid, over that high', () => {
    expect(layerOfFt(3400)).toBe('low')
    expect(layerOfFt(6500)).toBe('mid')
    expect(layerOfFt(12000)).toBe('mid')
    expect(layerOfFt(20000)).toBe('mid')
    expect(layerOfFt(25000)).toBe('high')
  })

  it('never takes the ceilometer\'s 12,000 ft for a height, nor CLR for a clear sky', () => {
    expect(CEILOMETER_FT).toBe(12000)
    expect(stationDeck(parseMetarSky('KFKN 022055Z AUTO 04003KT 10SM BKN110 19/09 A3035')!)?.atLeast).toBe(false)
    expect(clearMeans(parseMetarSky('KTDF 022055Z AUTO 00000KT 10SM CLR 19/10 A3036')!)).toBe('clear below 12,000 ft')
    const t = deckTruth({ station: { station: 'KNTU', amount: 'BKN', baseFt: 12000, atLeast: true } })
    expect(t?.words).toBe('mid deck (12k or higher)')
    expect(t?.atLeast).toBe(true)
  })

  it('reads a pilot\'s base and top in the forms they come in', () => {
    expect(parsePirepSky('ORF UA /OV ORF090010/TM 2130/FL080/TP C172/SK BKN040-TOP070/TB NEG')).toEqual([{ amount: 'BKN', baseFt: 4000, topFt: 7000 }])
    expect(parsePirepSky('RIC UA /OV RIC/TM 2100/FL120/TP B737/SK OVC100-TOP125')?.[0]).toEqual({ amount: 'OVC', baseFt: 10000, topFt: 12500 })
    expect(parsePirepSky('RIC UA /OV RIC/TM 2100/FL120/TP B737/SK 040BKN065')?.[0]).toEqual({ amount: 'BKN', baseFt: 4000, topFt: 6500 })
    expect(parsePirepSky('RIC UA /OV RIC/TM 2100/FL310/TP B737/TB MOD')).toBeNull()
    /* A pilot's base beats every other source. */
    const t = deckTruth({ station: { station: 'KNTU', amount: 'BKN', baseFt: 12000, atLeast: true }, pirep: { base: 13000, top: 15000, amount: 'BKN', from: 'ORF 2130 Z' }, modelRh: [{ baseM: 6000, topM: 7000 }] })
    expect(t?.source).toBe('pirep')
    expect(t?.words).toBe('mid deck (13,000 ft)')
  })

  it('finds a moist layer where the humidity crosses 90% (over ice below freezing)', () => {
    /* -15 °C at 87% over water is 100% over ice: cloud. */
    expect(rhForCloud({ heightM: 5000, tempC: -15, rhPct: 87 })).toBeGreaterThan(100)
    const layers = moistLayers([
      { heightM: 1000, tempC: 10, rhPct: 50 },
      { heightM: 3000, tempC: 0, rhPct: 70 },
      { heightM: 4000, tempC: -5, rhPct: 95 },
      { heightM: 5000, tempC: -12, rhPct: 95 },
      { heightM: 6000, tempC: -20, rhPct: 40 },
    ])
    expect(layers).toHaveLength(1)
    expect(layers[0].baseM).toBeGreaterThan(3000)
    expect(layers[0].baseM).toBeLessThan(4000)
    expect(layers[0].topM).toBeGreaterThan(5000)
  })

  it('puts a satellite top on the temperature profile, and says its phase', () => {
    const levels = [
      { heightM: 0, tempC: 15, rhPct: 50 },
      { heightM: 4000, tempC: -5, rhPct: 50 },
      { heightM: 8000, tempC: -35, rhPct: 50 },
    ]
    expect(topFromTemperature(-20, levels)).toBeCloseTo(6000, 0)
    expect(topFromTemperature(20, levels)).toBeNull()
    expect(phaseOf(-5)).toBe('water')
    expect(phaseOf(-18)).toBe('mixed')
    expect(phaseOf(-40)).toBe('ice')
  })

  it('a sounding counts within six hours of the event: none for the 2 Nov sunset at T-60 (12 Z was ten hours before)', () => {
    expect(launchFor(EVENT, T60)).toBeNull()
    /* The 00 Z launch is in for a sunrise: an hour after it, 12 Z at 7 AM EST. */
    expect(launchFor(new Date('2026-11-03T11:30:00Z'), new Date('2026-11-03T14:00:00Z'))?.toISOString()).toBe('2026-11-03T12:00:00.000Z')
    const raob = parseRaob({ profiles: [JSON.parse(readFileSync(`${DIR}/raob.json`, 'utf8')).raob['KMHX-202611021200']] })
    expect(raob?.length).toBeGreaterThan(50)
  })

  it('2 Nov sunset at T-60: "mid deck (12k or higher)", never "cirrus"', () => {
    const v = verdictAtT60()!
    /* Before: the models' split, said as it was at 4:28 PM. */
    expect(LAYER_WORD[leadLayer(v).layer]).toBe('high cirrus')
    expect(pirepDeck(PIREPS)).toBeNull()
    const truth = truthFrom({ station: STATION!.sky, pireps: PIREPS, sounding: null, profile: PROFILE, sat: SAT, modelLayer: leadLayer(v).layer })
    expect(truth?.words).toBe('mid deck (12k or higher)')
    expect(truth?.layer).toBe('mid')
    expect(truth?.source).toBe('model-rh')
    /* The models' lit "high" is that deck, so it is said that way. */
    expect(layerWords('high', truth, LAYER_WORD)).toBe('mid deck (12k or higher)')
    expect(layerWords('high', truth, LAYER_WORD)).not.toMatch(/cirrus/)
    /* The Why keeps every source that spoke. */
    expect(truth?.notes.join(' · ')).toMatch(/^KNTU BKN120: a deck at 12k or higher \(the ceilometer sees to 12,000 ft\)/)
    expect(truth?.notes.join(' · ')).toMatch(/forecast humidity: moist/)
  })
})

describe('Section 1: the deck said once', () => {
  it('when the models\' mid and high are both the measured deck, the agreement line says it once, each model once', async () => {
    const { agreementLine } = await import('../src/core/fireOutlook.ts')
    const v = verdictAtT60()!
    const truth = truthFrom({ station: STATION!.sky, pireps: [], sounding: null, profile: PROFILE, sat: SAT, modelLayer: 'high' })
    const line = agreementLine(v, (l) => layerWords(l, truth, LAYER_WORD))
    expect(line.match(/mid deck/g)).toHaveLength(1)
    expect(line).toMatch(/^\d of 5 see lit mid deck \(12k or higher\)$/)
    expect(truth?.short).toBe('mid deck ≥12k')
  })
})

describe('Section 2: the gap watch', async () => {
  const { stationsAlong, stationGap, gapRead, fromSatellite } = await import('../src/core/gapWatch.ts')
  const { gapFrom } = await import('../src/lib/skyObsData.ts')
  const { ASOS_STATIONS } = await import('../src/data/asosStations.ts')
  const { eventCall } = await import('../src/core/briefing.ts')
  const line = stationsAlong(VENUE, AZIMUTH, ASOS_STATIONS)
  const reportsAt = (t: Date) => new Map(line.flatMap((s) => {
    const r = latestBy(s.id.slice(1), t)
    return r === null ? [] : [[s.id, r.sky] as const]
  }))
  const NEXRAD = JSON.parse(readFileSync(`${DIR}/nexrad.json`, 'utf8')) as { frames: Record<string, { km: number; rgba?: number[] }[]> }
  const echoes = NEXRAD.frames['202611022055'].filter((x) => (x.rgba?.[3] ?? 0) > 0).map((x) => x.km)

  it('walks the sun\'s line WSW and finds the stations near it: Suffolk, Franklin, Emporia, out to Henderson and Roxboro', () => {
    expect(line.map((s) => s.id)).toEqual(expect.arrayContaining(['KSFQ', 'KFKN', 'KEMV', 'KIXA', 'KHNZ', 'KTDF']))
    expect(line.every((s) => s.offKm <= 25 && s.alongKm <= 300)).toBe(true)
  })

  it('a station is open with few or scattered under the deck, shut with broken or overcast, unknown with a CLR under a deck at 12k or higher', () => {
    expect(stationGap(parseMetarSky('KHNZ 022055Z AUTO 00000KT 10SM SCT110 18/09 A3035')!, 10000)).toEqual({ state: 'open', word: 'scattered' })
    expect(stationGap(parseMetarSky('KEMV 022055Z AUTO 06003KT 10SM OVC100 19/10 A3037')!, 10000).state).toBe('shut')
    expect(stationGap(parseMetarSky('KTDF 022055Z AUTO 00000KT 10SM CLR 19/10 A3036')!, 10000)).toEqual({ state: 'open', word: 'clear' })
    expect(stationGap(parseMetarSky('KTDF 022055Z AUTO 00000KT 10SM CLR 19/10 A3036')!, 12000).state).toBe('unknown')
  })

  it('2 Nov sunset at T-60: the gap to the WSW is open, by the stations and the satellite, no showers', () => {
    const gap = gapFrom({ azimuthDeg: AZIMUTH, line, reports: reportsAt(T60), station: STATION!.sky, sat: SAT, echoesKm: echoes })
    expect(gap.state).toBe('open')
    expect(gap.stationsSay).toBe('open')
    expect(gap.satSays).toBe('open')
    expect(gap.showers).toBe(false)
    expect(gap.line).toBe('Gap to the WSW: open · Henderson scattered, Roxboro clear')
    /* The deck ends between Roanoke Rapids (broken, 151 km) and Henderson (225 km). */
    expect(gap.edgeKm).toBeGreaterThan(150)
    expect(gap.edgeKm).toBeLessThan(226)
  })

  it('2 Nov sunset: Go by T-60, measured over modelled', () => {
    const v = verdictAtT60()!
    const truth = truthFrom({ station: STATION!.sky, pireps: [], sounding: null, profile: PROFILE, sat: SAT, modelLayer: leadLayer(v).layer })
    const gap = gapFrom({ azimuthDeg: AZIMUTH, line, reports: reportsAt(T60), station: STATION!.sky, sat: SAT, echoesKm: echoes })
    /* Before: the models alone, "possible", a Maybe. */
    expect(eventCall(v, 'sunset', EVENT, T60).call).toBe('Maybe')
    const c = eventCall(v, 'sunset', EVENT, T60, null, { truth, gap })
    expect(c.call).toBe('Go')
    expect(c.why).toBe('Stations see a mid deck ≥12k over you and the gap toward the sun open.')
    expect(c.gapLine).toBe('Gap to the WSW: open · Henderson scattered, Roxboro clear')
  })

  it('a shut gap: the far stations broken, the satellite cold to the end; showers past the edge shut an open one', () => {
    const shut = gapRead({ azimuthDeg: 250, line: [{ id: 'KAAA', name: 'A', alongKm: 100, offKm: 5 }, { id: 'KBBB', name: 'B', alongKm: 200, offKm: 5 }], reports: new Map([['KAAA', parseMetarSky('KAAA 021955Z SCT100')!], ['KBBB', parseMetarSky('KBBB 021955Z OVC100')!]]), deckFt: 10000 })
    expect(shut.state).toBe('shut')
    expect(shut.line).toBe('Gap to the WSW: shut · B overcast')
    expect(fromSatellite(Array.from({ length: 31 }, (_, i) => ({ km: i * 10, c: -30 })), 18).says).toBe('shut')
    const wet = gapRead({ azimuthDeg: 250, line: [{ id: 'KBBB', name: 'B', alongKm: 200, offKm: 5 }], reports: new Map([['KBBB', parseMetarSky('KBBB 021955Z SCT100')!]]), deckFt: 10000, echoesKm: [240] })
    expect(wet.state).toBe('shut')
    expect(wet.line).toMatch(/showers in the gap/)
  })
})
