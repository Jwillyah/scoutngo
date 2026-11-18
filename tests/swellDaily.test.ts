import { afterEach, describe, expect, it, vi } from 'vitest'
import { dailyModelsDue, modelsLoggedOn, type WatchLogRow } from '../src/core/swellWatch.ts'
import { keepWatch, readWatchLog, SWELL_DAILY_KEY, takeDailyModelsAsk } from '../src/lib/swellWatchStore.ts'
import { fetchWaveModels, waveModelsUrl } from '../src/lib/waveModels.ts'
import { clearWeatherStore } from '../src/lib/weatherStore.ts'
import { answer } from '../scripts/gate/fixtures.mjs'

/*
 * THE DAILY WAVE-MODEL CHECK (Batch SIMPLE-1, Section 5). The bigger-swell
 * log's models were asked only by the Surf page and the home's Week; now the
 * home asks them once a day per spot, after its first load, so Mon 23 Nov's
 * log fills on a day neither was opened. One open with no row today adds a
 * row with the models; a second open the same day asks nothing.
 *
 * These are the steps the home's open runs (src/lib/useSurfNow.ts, models
 * 'daily'): takeDailyModelsAsk, then fetchWaveModels through the weather
 * store, then keepWatch with the models' tops. The hook wiring itself is
 * measured in the browser (measurements/2026-11-18-openmeteo-calls.md).
 */
const SPOT = '36.84,-75.97'
const AT = { lat: 36.84, lon: -75.97 }
const TODAY = '2026-11-18'

function memoryStore(): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

/** The gate's fixture answer for the models' question (scripts/gate/fixtures.mjs), every request recorded. */
function recordingFetch(asked: string[]) {
  return async (input: RequestInfo | URL) => {
    const href = String(input instanceof Request ? input.url : input)
    asked.push(href)
    const a = await answer(href)
    return new Response(new TextDecoder().decode(a.body), { status: a.status, headers: { 'content-type': 'application/json' } })
  }
}

/** One app open of the home: the daily check's steps. */
async function openHome(store: ReturnType<typeof memoryStore>, made: string): Promise<void> {
  /* A new session: nothing kept in memory from the last open. */
  await clearWeatherStore()
  if (!takeDailyModelsAsk(SPOT, made, store)) return
  const models = await fetchWaveModels(AT)
  const tops = Object.fromEntries(models.map((m) => [m.model, 1.5]))
  keepWatch(SPOT, made, [{ date: made, callLowFt: 1, callHighFt: 2, topFt: 1.5, models: tops }], Date.now(), store)
}

afterEach(() => vi.unstubAllGlobals())

describe('when the daily check is due', () => {
  const row = (made: string, models?: Record<string, number>): WatchLogRow => ({ made, date: made, callLowFt: 1, callHighFt: 2, topFt: 1.5, ...(models === undefined ? {} : { models }) })

  it('a row made today without the models is not the check done; one with them is', () => {
    expect(modelsLoggedOn([row(TODAY)], TODAY)).toBe(false)
    expect(modelsLoggedOn([row(TODAY, {})], TODAY)).toBe(false)
    expect(modelsLoggedOn([row('2026-11-17', { 'ECMWF WAM': 2 })], TODAY)).toBe(false)
    expect(modelsLoggedOn([row(TODAY, { 'ECMWF WAM': 2 })], TODAY)).toBe(true)
  })

  it('due with no models row today and no ask today; not after either', () => {
    expect(dailyModelsDue([], TODAY, null)).toBe(true)
    expect(dailyModelsDue([], TODAY, '2026-11-17')).toBe(true)
    expect(dailyModelsDue([], TODAY, TODAY)).toBe(false)
    expect(dailyModelsDue([row(TODAY, { 'ECMWF WAM': 2 })], TODAY, null)).toBe(false)
  })
})

describe('the app opened twice in a day', () => {
  it('a day with no row: one open adds the row with the models, in one request; a second open the same day asks no model', async () => {
    const asked: string[] = []
    vi.stubGlobal('fetch', recordingFetch(asked))
    const store = memoryStore()
    expect(readWatchLog(SPOT, store)).toEqual([])

    await openHome(store, TODAY)
    expect(asked).toHaveLength(1)
    expect(asked[0]).toBe(waveModelsUrl(AT))
    const log = readWatchLog(SPOT, store)
    expect(log.filter((r) => r.made === TODAY)).toHaveLength(1)
    expect(Object.keys(log[0].models ?? {})).toEqual(['ECMWF WAM', 'GFS-Wave', 'Météo-France MFWAM'])

    await openHome(store, TODAY)
    expect(asked).toHaveLength(1)

    /* The next day it is due again. */
    await openHome(store, '2026-11-19')
    expect(asked).toHaveLength(2)
  })

  it('an ask that never landed is not repeated that day: once a day, inside the budget', async () => {
    const asked: string[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      asked.push(String(input))
      return new Response('', { status: 503 })
    })
    const store = memoryStore()
    await openHome(store, TODAY)
    expect(asked).toHaveLength(1)
    /* The failed answer wrote no models' column... */
    expect(modelsLoggedOn(readWatchLog(SPOT, store), TODAY)).toBe(false)
    expect(JSON.parse(store.data.get(SWELL_DAILY_KEY) ?? '{}')).toEqual({ [SPOT]: TODAY })
    /* ...and a second open the same day still asks nothing. */
    await openHome(store, TODAY)
    expect(asked).toHaveLength(1)
  })

  it('no storage: nothing to remember it by, so nothing extra is asked', () => {
    expect(takeDailyModelsAsk(SPOT, TODAY, null)).toBe(false)
  })
})
