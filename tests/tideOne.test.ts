import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * BATCH CORE, SECTION 3: TIDE AND MAP. 15 Nov at inland VB: the Tide page
 * said "Could not reach NOAA for tide predictions, and none is saved for this
 * date" on 5G while the map strip said "Low 5:52p"; the home said "Low 9:15
 * PM". tests/data/tide-2026-11-15/ is NOAA CO-OPS's own table for that day.
 */
const hilo = (st: string) => (JSON.parse(readFileSync(`tests/data/tide-2026-11-15/hilo-${st}.json`, 'utf8')) as { predictions: { t: string; type: string }[] }).predictions
const lows = (st: string) => hilo(st).filter((p) => p.type === 'L').map((p) => p.t.slice(11))

describe('3.2 the two lows were two stations', () => {
  it('home "Low 9:15 PM" is Buchanan Creek entrance (8638854); map "Low 5:52p" is Rudee Heights, Lake Wesley (8639214): NOAA, local time', () => {
    expect(lows('8638854')).toContain('21:15')
    expect(lows('8639214')).toContain('17:52')
    /* The ocean side's own reference stations, for the report: Rudee Inlet 17:55, the Bridge Tunnel 18:19. */
    expect(lows('8639207')).toContain('17:55')
    expect(lows('8638863')).toContain('18:19')
  })
  it('one station for a spot: chosen once, after the coast has answered, and every screen reads it', () => {
    const src = readFileSync('src/lib/useTide.ts', 'utf8')
    expect(src).toMatch(/const beach = await beachFor\(\{ lat, lon \}\)/)
    expect(src).toMatch(/chosen\.set\(spot, candidate\.station\.id\)/)
    expect(src).not.toMatch(/fromLat|setIsland/)
  })
})

describe('3.1 a week of tides kept on each good answer', () => {
  let store: Record<string, string>
  beforeEach(() => {
    store = {}
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v), removeItem: (k: string) => void delete store[k] })
    vi.resetModules()
  })
  const at = new Date('2026-11-15T17:00:00Z')
  /* A turn every 6 h 12 m from 13 Nov to 24 Nov, as NOAA answers hilo; the curve request refused (a subordinate station). */
  const answer = (url: string) => {
    const u = new URL(url)
    if (u.searchParams.get('interval') !== 'hilo') return { error: { message: 'No Predictions data was found. Please make sure the Datum input is valid.' } }
    const out = []
    for (let t = Date.UTC(2026, 10, 14, 0, 30); t < Date.UTC(2026, 10, 24); t += 372 * 60_000) out.push({ t: new Date(t).toISOString().slice(0, 16).replace('T', ' '), v: '1.0', type: out.length % 2 === 0 ? 'H' : 'L' })
    return { predictions: out }
  }
  it('one request to 7 days ahead; the day asked gets its usual window; each later day\'s window is saved', async () => {
    const asked: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url)
      return new Response(JSON.stringify(answer(url)), { status: 200 })
    })
    const { fetchPredictions, TIDE_AHEAD_DAYS, predictionsKey } = await import('../src/lib/noaa.ts')
    const { readForecast } = await import('../src/lib/savedForecast.ts')
    const r = await fetchPredictions('8638854', at)
    expect(r.status).toBe('ok')
    expect(TIDE_AHEAD_DAYS).toBe(7)
    expect(new URL(asked[0]).searchParams.get('end_date')).toBe('20261122')
    if (r.status === 'ok') {
      expect(Math.min(...r.predictions.extremes.map((e) => e.at.getTime()))).toBeGreaterThanOrEqual(Date.UTC(2026, 10, 14))
      expect(Math.max(...r.predictions.extremes.map((e) => e.at.getTime()))).toBeLessThan(Date.UTC(2026, 10, 17))
    }
    for (let k = 1; k < 7; k += 1) expect(readForecast(predictionsKey('8638854', new Date(at.getTime() + k * 86_400_000))), `day +${k}`).not.toBeNull()
  })
  it('three days later with no signal: the saved table, with its age, never "none is saved"', async () => {
    vi.stubGlobal('fetch', async (url: string) => new Response(JSON.stringify(answer(url)), { status: 200 }))
    const first = await import('../src/lib/noaa.ts')
    await first.fetchPredictions('8638854', at)
    vi.resetModules()
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Load failed')
    })
    const { fetchPredictions } = await import('../src/lib/noaa.ts')
    const r = await fetchPredictions('8638854', new Date(at.getTime() + 3 * 86_400_000))
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.predictions.provenance.kind).toBe('saved')
  })
})

describe('3.3 and 3.4 the map', () => {
  it('each map source that fails goes to the phone\'s error log with its host', () => {
    expect(readFileSync('src/components/MapView.tsx', 'utf8')).toMatch(/recordError\('Map', `\$\{id\}\$\{host === '' \? '' : ` \(\$\{host\}\)`\}/)
  })
  it('opening the map from the home puts the bar at now', () => {
    expect(readFileSync('src/App.tsx', 'utf8')).toMatch(/if \(homeWasOpen\.current && !briefOpen\) onBackToNow\(\)/)
  })
})
