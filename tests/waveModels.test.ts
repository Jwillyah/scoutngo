import { describe, expect, it } from 'vitest'
import { logWatch, modelTops, seaInCell, swellWatch, WAVE_MODEL_IDS, WAVE_MODELS, WATCH_FT } from '../src/core/swellWatch.ts'
import { keepWatch, readWatchLog } from '../src/lib/swellWatchStore.ts'
import { splitModels, waveModelsUrl, WAVE_MODEL_NAMES, type ModelSea } from '../src/lib/waveModels.ts'
import { modelDayReadings, WATCH_MODEL } from '../src/lib/surfPageData.ts'
import { surfNowFrom } from '../src/lib/useSurfNow.ts'
import { spotStats } from '../src/core/spotSkill.ts'
import type { Hourly } from '../src/lib/tideSheetData.ts'
import { answer } from '../scripts/gate/fixtures.mjs'
import { capeHenryAt, recordedDay, seaAt, TZ, VB } from './surfReplay.ts'

/*
 * MORE WAVE MODELS FOR THE BIGGER-SWELL CHIP (Batch 3D, Section 3.2, Jwilly
 * approved): ECMWF WAM, GFS-Wave and Météo-France MFWAM from Open-Meteo
 * Marine, asked from the phone. The chip shows when any model reads 4 ft or
 * more at the beach within 7 days on a day called 2 ft or under.
 */
const weekday = (iso: string) => new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`))

describe('the request and its answer', () => {
  it("names Open-Meteo Marine's own ids, one request, the coordinate to 2 decimals", () => {
    expect(WAVE_MODEL_IDS).toEqual(['ecmwf_wam025', 'ncep_gfswave016', 'ncep_gfswave025', 'meteofrance_wave'])
    const u = new URL(waveModelsUrl({ lat: 36.84181, lon: -75.97382 }))
    expect(u.host).toBe('marine-api.open-meteo.com')
    expect(u.searchParams.get('models')).toBe('ecmwf_wam025,ncep_gfswave016,ncep_gfswave025,meteofrance_wave')
    expect(u.searchParams.get('latitude')).toBe('36.84')
    expect(u.searchParams.get('longitude')).toBe('-75.97')
  })

  it("the gate's fixture answers it (scripts/gate/fixtures.mjs, suffixed by model) and it splits into the three models", async () => {
    const a = await answer(waveModelsUrl({ lat: 36.84, lon: -75.97 }))
    expect(a.status).toBe(200)
    const got = splitModels(JSON.parse(new TextDecoder().decode(a.body)))
    expect(got.map((m) => [m.model, m.id])).toEqual([
      ['ECMWF WAM', 'ecmwf_wam025'],
      ['GFS-Wave', 'ncep_gfswave016'],
      ['Météo-France MFWAM', 'meteofrance_wave'],
    ])
    for (const m of got) expect(m.marine.values.wave_height.length).toBe(7 * 24)
  })

  /* Live, 17 Nov at 37.00,-76.00: ncep_gfswave025 0.00 m every hour (a land-masked cell), ncep_gfswave016 up to 1.92 m; at Wrightsville ecmwf_wam025 null throughout. */
  it('a land-masked cell (0 every hour) or a model with nothing is no reading; GFS-Wave falls to the next grid', () => {
    expect(seaInCell([0, 0, 0])).toBe(false)
    expect(seaInCell([null, null])).toBe(false)
    expect(seaInCell(undefined)).toBe(false)
    expect(seaInCell([0, 0.12])).toBe(true)
    const time = ['2026-11-18T00:00', '2026-11-18T01:00']
    const hourly: Record<string, unknown> = { time }
    for (const n of WAVE_MODEL_NAMES) {
      hourly[`${n}_ecmwf_wam025`] = [null, null]
      hourly[`${n}_ncep_gfswave016`] = [null, null]
      hourly[`${n}_ncep_gfswave025`] = n === 'wave_height' ? [0.8, 0.9] : [8, 8]
      hourly[`${n}_meteofrance_wave`] = [0, 0]
    }
    expect(splitModels({ hourly }).map((m) => m.id)).toEqual(['ncep_gfswave025'])
    expect(splitModels(null)).toEqual([])
    expect(WAVE_MODELS.map((m) => m.name)).toEqual(['ECMWF WAM', 'GFS-Wave', 'Météo-France MFWAM'])
  })
})

/* A model's week at the 17 Nov sea's hours: `big` metres square-on at 13 s on Mon 23 Nov, 0.3 m otherwise; whole sea only, as ECMWF WAM gives it. */
function modelSea(times: number[], big: number): Hourly {
  const mon = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone: TZ }) === '2026-11-23'
  const v = (f: (t: number) => number | null) => times.map(f)
  return {
    times,
    values: {
      wave_height: v((t) => (mon(t) ? big : 0.3)),
      wave_period: v(() => 13),
      wave_direction: v(() => VB.facing),
      swell_wave_height: v(() => null),
      swell_wave_period: v(() => null),
      swell_wave_direction: v(() => null),
      wind_wave_height: v(() => null),
      wind_wave_period: v(() => null),
      wind_wave_direction: v(() => null),
    },
  }
}

describe('17 Nov 7:05 AM at VB, the week the phone had, with the models beside it', () => {
  const d = recordedDay('tests/data/surf-2026-11-17')
  const now = new Date('2026-11-17T12:05:00Z')
  const station = capeHenryAt(now, VB.facing)?.obs ?? null
  const read = (models: ModelSea[]) => surfNowFrom({ ...seaAt(d, VB, now), models }, spotStats([], 0), now, TZ, station)

  it('fires: one model at 2.2 m on Mon 23 Nov, our call 1-2, the best match under 4 ft', () => {
    const r = read([{ model: 'ECMWF WAM', id: 'ecmwf_wam025', marine: modelSea(d.marine.times, 2.2) }])
    const mon = r.week.find((x) => x.date === '2026-11-23')
    expect(mon?.call?.highFt).toBeLessThanOrEqual(2)
    const best = Math.max(...(mon?.readings ?? []).filter((x) => x.model === WATCH_MODEL).map((x) => x.faceFt))
    expect(best).toBeLessThan(WATCH_FT)
    const ecmwf = (mon?.readings ?? []).filter((x) => x.model === 'ECMWF WAM')
    expect(ecmwf.map((x) => x.read)).toEqual(['the whole sea as one'])
    expect(ecmwf[0].faceFt).toBeGreaterThanOrEqual(WATCH_FT)
    expect(r.watch?.date).toBe('2026-11-23')
    expect(r.watch?.words).toBe('Possible bigger swell Mon · models disagree · low confidence')
  })

  it("doesn't fire: every model under 4 ft at the beach (0.6 m on Mon)", () => {
    const r = read([
      { model: 'ECMWF WAM', id: 'ecmwf_wam025', marine: modelSea(d.marine.times, 0.6) },
      { model: 'GFS-Wave', id: 'ncep_gfswave016', marine: modelSea(d.marine.times, 0.6) },
    ])
    const mon = r.week.find((x) => x.date === '2026-11-23')
    expect(new Set((mon?.readings ?? []).map((x) => x.model))).toEqual(new Set([WATCH_MODEL, 'ECMWF WAM', 'GFS-Wave']))
    expect(Math.max(...(mon?.readings ?? []).map((x) => x.faceFt))).toBeLessThan(WATCH_FT)
    expect(r.watch).toBe(null)
  })

  it("doesn't fire on a day called over 2 ft, whatever a model says", () => {
    expect(swellWatch([{ date: '2026-11-23', callHighFt: 3, readings: [{ model: 'ECMWF WAM', read: 'the whole sea as one', faceFt: 6 }] }], weekday)).toBe(null)
  })

  it('a model with swell parts is read part by part too', () => {
    const m = modelSea(d.marine.times, 2.2)
    m.values.swell_wave_height = m.values.wave_height.slice()
    m.values.swell_wave_period = m.values.wave_period.slice()
    m.values.swell_wave_direction = m.values.wave_direction.slice()
    const rs = modelDayReadings([{ model: 'GFS-Wave', marine: m }], '2026-11-23', TZ, VB.facing, 0.833)
    expect(rs.map((x) => x.read)).toEqual(['part by part', 'the whole sea as one'])
  })
})

describe('the daily log keeps each model (scoutngo.swellWatch.v1)', () => {
  it("each model's top that day, one decimal", () => {
    expect(modelTops([
      { model: 'ECMWF WAM', read: 'the whole sea as one', faceFt: 4.26 },
      { model: 'GFS-Wave', read: 'part by part', faceFt: 3.04 },
      { model: 'GFS-Wave', read: 'the whole sea as one', faceFt: 3.31 },
    ])).toEqual({ 'ECMWF WAM': 4.3, 'GFS-Wave': 3.3 })
  })

  it('a later write that day without the models (a screen that did not ask) keeps them; a new day starts fresh', () => {
    const one = logWatch([], '2026-11-18', [{ date: '2026-11-23', callLowFt: 1, callHighFt: 2, topFt: 4.3, models: { 'ECMWF WAM': 4.3 } }])
    const two = logWatch(one, '2026-11-18', [{ date: '2026-11-23', callLowFt: 1, callHighFt: 2, topFt: 1.9 }])
    expect(two).toEqual([{ made: '2026-11-18', date: '2026-11-23', callLowFt: 1, callHighFt: 2, topFt: 1.9, models: { 'ECMWF WAM': 4.3 } }])
    const three = logWatch(two, '2026-11-19', [{ date: '2026-11-23', callLowFt: 1, callHighFt: 2, topFt: 1.9 }])
    expect(three.find((r) => r.made === '2026-11-19')?.models).toBeUndefined()
  })

  it('round-trips through the store; a row with a broken models column is dropped, an old row without one kept', () => {
    const mem = new Map<string, string>()
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
    keepWatch('36.83,-75.97', '2026-11-18', [{ date: '2026-11-23', callLowFt: 1, callHighFt: 2, topFt: 4.3, models: { 'ECMWF WAM': 4.3, 'Météo-France MFWAM': 2.1 } }], 1, store)
    expect(readWatchLog('36.83,-75.97', store)[0].models).toEqual({ 'ECMWF WAM': 4.3, 'Météo-France MFWAM': 2.1 })
    const raw = JSON.parse(mem.get('scoutngo.swellWatch.v1') ?? '{}')
    raw['36.83,-75.97'].r.push({ made: '2026-11-18', date: '2026-11-24', callLowFt: 1, callHighFt: 2, topFt: 1, models: { x: 'big' } })
    raw['36.83,-75.97'].r.push({ made: '2026-11-17', date: '2026-11-24', callLowFt: 1, callHighFt: 2, topFt: 1 })
    mem.set('scoutngo.swellWatch.v1', JSON.stringify(raw))
    expect(readWatchLog('36.83,-75.97', store).map((r) => `${r.made} ${r.date}`)).toEqual(['2026-11-18 2026-11-23', '2026-11-17 2026-11-24'])
  })
})
