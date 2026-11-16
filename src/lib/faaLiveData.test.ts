import { describe, expect, it } from 'vitest'
import { faaLayer, QUERIES, queryUrl, TFR_ENDPOINT } from './faaLiveData.ts'

/*
 * NOTHING ABOUT A PLACE IN AN FAA REQUEST (Batch DRONE, Section 2.3). The
 * layers are asked whole: no geometry, no box, no point, the same URL for
 * every user anywhere.
 */
describe('the FAA layers are asked whole', () => {
  it('no query carries a geometry, a box or a coordinate', () => {
    for (const list of Object.values(QUERIES)) {
      for (const q of list) {
        const u = new URL(queryUrl(q, 0))
        expect(u.hostname).toBe('services6.arcgis.com')
        for (const k of ['geometry', 'geometryType', 'inSR', 'spatialRel', 'distance', 'lat', 'lon', 'bbox']) expect(u.searchParams.has(k), `${q.service} ${k}`).toBe(false)
        expect(u.searchParams.get('f')).toBe('geojson')
      }
    }
  })

  it('pages until a short page, and keeps what it read', async () => {
    const asked: string[] = []
    const fake = (async (input: RequestInfo | URL) => {
      const url = String(input)
      asked.push(url)
      const offset = Number(new URL(url).searchParams.get('resultOffset'))
      const n = offset === 0 ? 1000 : 3
      const features = Array.from({ length: n }, (_, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [-75 - i / 1000, 36] }, properties: { IDENT: `H${offset + i}`, NAME: 'h' } }))
      return new Response(JSON.stringify({ type: 'FeatureCollection', features }), { status: 200 })
    }) as typeof fetch
    const a = await faaLayer('heliport', true, fake)
    expect(asked).toHaveLength(2)
    expect(a.from).toBe('live')
    expect(a.data).toHaveLength(1003)
    /* Asked again while fresh: no request. */
    await faaLayer('heliport', true, fake)
    expect(asked).toHaveLength(2)
  })

  it('asks TFRs of this app’s function with an empty POST', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      return new Response(JSON.stringify({ status: 'ok', tfrs: { type: 'FeatureCollection', features: [] } }), { status: 200 })
    }) as typeof fetch
    const a = await faaLayer('tfr', true, fake)
    expect(calls).toEqual([{ url: TFR_ENDPOINT, init: expect.objectContaining({ method: 'POST', body: '{}' }) }])
    expect(a.data).toEqual([])
  })

  it('offline with nothing kept: says nothing arrived, asks nothing', async () => {
    let asked = 0
    const fake = (async () => {
      asked += 1
      return new Response('{}')
    }) as typeof fetch
    const a = await faaLayer('fria', false, fake)
    expect(asked).toBe(0)
    expect(a).toEqual({ data: null, at: null, from: 'none' })
  })
})
