import { afterEach, describe, expect, it } from 'vitest'
import { answer } from '../scripts/gate/fixtures.mjs'
import { POST, TFR_WFS, trimTfrs } from '../api/tfr.ts'
import { parseTfrs } from '../src/core/faaLive.ts'

/*
 * /api/tfr (Batch DRONE, Section 2.3): an empty POST, the FAA's TFR shapes
 * whole, only the fields the phone reads. The gate's fixture for tfr.faa.gov
 * is the shape this reads, so the gate's run is a run of this code.
 */
const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

describe('the TFR function', () => {
  it('asks the FAA for every TFR, with no place in the request', () => {
    const u = new URL(TFR_WFS)
    expect(u.hostname).toBe('tfr.faa.gov')
    for (const k of ['bbox', 'BBOX', 'cql_filter', 'CQL_FILTER', 'lat', 'lon']) expect(u.searchParams.has(k)).toBe(false)
  })

  it('keeps only the fields the phone reads', () => {
    const t = trimTfrs({ features: [{ geometry: { type: 'Polygon', coordinates: [] }, properties: { NOTAM_KEY: '6/1', TITLE: 't', LEGAL: 'VIP', GID: 9, CNS_LOCATION_ID: 'ZDC' } }] })
    expect(t?.features).toEqual([{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: { NOTAM_KEY: '6/1', TITLE: 't', LEGAL: 'VIP', LAST_MODIFICATION_DATETIME: null, STATE: null } }])
    expect(trimTfrs({})).toBeNull()
  })

  it('answers the gate’s fixture as the phone reads it', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const a = await answer(String(input))
      return new Response(new Uint8Array(a.body), { status: a.status, headers: { 'content-type': a.type } })
    }) as typeof fetch
    const r = await POST()
    expect(r.status).toBe(200)
    const body = (await r.json()) as { status: string; tfrs: unknown }
    expect(body.status).toBe('ok')
    const tfrs = parseTfrs(body.tfrs)
    expect(tfrs).toHaveLength(1)
    expect(tfrs[0].fromIso).toBe('2026-10-30')
  })

  it('says the FAA did not answer, never an empty list', async () => {
    globalThis.fetch = (async () => new Response('down', { status: 503 })) as typeof fetch
    const r = await POST()
    expect(r.status).toBe(502)
  })
})
