/*
 * THE FAA'S DRONE LAYERS, FETCHED WHOLE AND KEPT ON THE PHONE (Batch DRONE,
 * Section 2.3). Arithmetic in src/core/faaLive.ts.
 *
 * WHAT IS SENT. Nothing about the spot or the marker: every request is the
 * whole national dataset, `where=1=1` (or a type filter), no geometry, no
 * box, no point. The FAA's ArcGIS organisation (services6.arcgis.com, the
 * same one the baked airspace comes from) answers with CORS; the TFR map
 * service does not, so it comes through this app's /api/tfr, a POST with an
 * empty body.
 *
 * KEPT. Each layer, parsed, in Cache Storage (public map data, nothing about
 * you) with the time it arrived. With no signal, or when the FAA does not
 * answer, the kept copy is used and its date said. TFRs are asked again
 * after TFR_KEEP_MS, the rest after LAYER_KEEP_MS.
 */
import { parseFria, parseHeliports, parseNsufr, parseSua, parseTfrs, type FaaArea, type FaaLayerId, type FaaPoint } from '../core/faaLive.ts'

export const FAA_ORG = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services'
export const TFR_ENDPOINT = '/api/tfr'
export const FAA_CACHE = 'scoutngo-faa-v1'
export const LAYER_KEEP_MS = 7 * 86_400_000
export const TFR_KEEP_MS = 30 * 60_000

interface Query {
  service: string
  where: string
  fields: string
  /** The service's own page size (its maxRecordCount). */
  page: number
  /** Polygons simplified to this, degrees (about 20 m); points not. */
  offset: number | null
}

/* The datasets, as the FAA names them (checked 16 Nov 2026 against the org's service list). */
export const QUERIES: Record<Exclude<FaaLayerId, 'tfr'>, Query[]> = {
  nsufr: [
    { service: 'DoD_Mar_13', where: '1=1', fields: 'Base,Facility,Reason,Floor,Ceiling', page: 1000, offset: 0.0002 },
    { service: 'Part_Time_National_Security_UAS_Flight_Restrictions', where: '1=1', fields: 'Base,Facility,Reason,Floor,Ceiling', page: 2000, offset: 0.0002 },
  ],
  fria: [{ service: 'FAA_Recognized_Identification_Areas', where: '1=1', fields: 'title,city,state', page: 2000, offset: 0.0002 }],
  heliport: [{ service: 'US_Airport', where: "TYPE_CODE='HP'", fields: 'IDENT,NAME', page: 1000, offset: null }],
  sua: [{ service: 'Special_Use_Airspace', where: "TYPE_CODE IN ('W','A','MOA')", fields: 'NAME,TYPE_CODE,LOWER_VAL,LOWER_UOM,LOWER_CODE,TIMESOFUSE', page: 2000, offset: 0.002 }],
}

/** One page of a dataset: no geometry filter, so nothing about a place is in it. */
export function queryUrl(q: Query, offset: number): string {
  const p = new URLSearchParams({
    where: q.where,
    outFields: q.fields,
    returnGeometry: 'true',
    geometryPrecision: '4',
    orderByFields: 'OBJECTID',
    resultOffset: String(offset),
    resultRecordCount: String(q.page),
    f: 'geojson',
  })
  if (q.offset !== null) p.set('maxAllowableOffset', String(q.offset))
  return `${FAA_ORG}/${q.service}/FeatureServer/0/query?${p}`
}

/** Every page of one dataset, at most 12 pages. */
async function allPages(q: Query, fetchImpl: typeof fetch): Promise<unknown[] | null> {
  const out: unknown[] = []
  for (let i = 0; i < 12; i += 1) {
    const r = await fetchImpl(queryUrl(q, i * q.page), { signal: AbortSignal.timeout(20_000) })
    if (!r.ok) return null
    const body = (await r.json()) as { features?: unknown[]; properties?: { exceededTransferLimit?: boolean }; error?: unknown }
    if (body.error !== undefined || !Array.isArray(body.features)) return null
    out.push(...body.features)
    if (body.properties?.exceededTransferLimit !== true && body.features.length < q.page) break
  }
  return out
}

export type LayerData = { nsufr: FaaArea[]; fria: FaaArea[]; heliport: FaaPoint[]; sua: FaaArea[]; tfr: FaaArea[] }

async function fetchLayer<K extends FaaLayerId>(id: K, fetchImpl: typeof fetch): Promise<LayerData[K] | null> {
  try {
    if (id === 'tfr') {
      const r = await fetchImpl(TFR_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15_000) })
      if (!r.ok) return null
      const body = (await r.json()) as { status?: string; tfrs?: unknown }
      return body.status === 'ok' ? (parseTfrs(body.tfrs) as LayerData[K]) : null
    }
    const parts = await Promise.all(QUERIES[id as Exclude<FaaLayerId, 'tfr'>].map((q) => allPages(q, fetchImpl)))
    if (parts.some((p) => p === null)) return null
    const fc = { features: parts.flat() }
    const parsed = id === 'nsufr' ? parseNsufr(fc) : id === 'fria' ? parseFria(fc) : id === 'heliport' ? parseHeliports(fc) : parseSua(fc)
    return parsed as LayerData[K]
  } catch {
    return null
  }
}

/* The cache's key, on this app's own origin: never asked for, only a name for the kept answer. */
const keyOf = (id: FaaLayerId) => `/__faa/${id}`
const memory = new Map<FaaLayerId, { at: number; data: unknown }>()

async function kept(id: FaaLayerId): Promise<{ at: number; data: unknown } | null> {
  const hit = memory.get(id)
  if (hit !== undefined) return hit
  try {
    const r = await (await caches.open(FAA_CACHE)).match(keyOf(id))
    if (r === undefined) return null
    const body = (await r.json()) as { at: number; data: unknown }
    memory.set(id, body)
    return body
  } catch {
    return null
  }
}

async function keep(id: FaaLayerId, data: unknown): Promise<number> {
  const at = Date.now()
  memory.set(id, { at, data })
  try {
    await (await caches.open(FAA_CACHE)).put(keyOf(id), new Response(JSON.stringify({ at, data }), { headers: { 'content-type': 'application/json' } }))
  } catch {
    /* No Cache Storage (a private window): the memory copy for this session. */
  }
  return at
}

export interface LayerAnswer<T> {
  data: T | null
  /** When it arrived from the FAA, ms; null when there is nothing. */
  at: number | null
  /** 'kept': from the phone, because there was no signal or the FAA did not answer. */
  from: 'live' | 'kept' | 'none'
}

const pending = new Map<FaaLayerId, Promise<LayerAnswer<unknown>>>()

/** One layer: the kept copy while fresh, else the FAA's, else the kept copy with its date. */
export function faaLayer<K extends FaaLayerId>(id: K, online: boolean, fetchImpl: typeof fetch = fetch): Promise<LayerAnswer<LayerData[K]>> {
  const running = pending.get(id)
  if (running !== undefined) return running as Promise<LayerAnswer<LayerData[K]>>
  const job = (async (): Promise<LayerAnswer<LayerData[K]>> => {
    const have = await kept(id)
    const fresh = have !== null && Date.now() - have.at < (id === 'tfr' ? TFR_KEEP_MS : LAYER_KEEP_MS)
    if (fresh) return { data: have.data as LayerData[K], at: have.at, from: 'live' }
    if (!online) return have === null ? { data: null, at: null, from: 'none' } : { data: have.data as LayerData[K], at: have.at, from: 'kept' }
    const got = await fetchLayer(id, fetchImpl)
    if (got !== null) return { data: got, at: await keep(id, got), from: 'live' }
    return have === null ? { data: null, at: null, from: 'none' } : { data: have.data as LayerData[K], at: have.at, from: 'kept' }
  })().finally(() => pending.delete(id))
  pending.set(id, job as Promise<LayerAnswer<unknown>>)
  return job
}
