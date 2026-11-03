/*
 * COAST AND TROPICS, FETCHED (Batch K, Section 5). Arithmetic and reading
 * are src/core/coastWx.ts.
 *
 * WHAT LEAVES THE PHONE.
 *   api.weather.gov  the Water card's beach to 2 decimals: its public and
 *                    marine zones and its forecast office; then the office's
 *                    surf zone forecast and the zone's marine forecast
 *   this app         (/api/nhc) nothing: the active storms, and a storm's
 *                    wind-probability text by the NHC's own URL
 * Which storm is within 1000 km is worked out on the phone.
 */
import { useEffect, useState } from 'react'
import { ASOS_STATIONS } from '../data/asosStations.ts'
import { destinationPoint, distanceMeters, type LatLon } from '../core/geo.ts'
import { parseStorms, pwsFor, ripLine, stormsNear, surfZoneFor, tropicsLine } from '../core/coastWx.ts'
import { TIMEOUT_MS } from './forecast.ts'

const NWS = 'https://api.weather.gov'
export const NHC_ENDPOINT = '/api/nhc'
const r2 = (x: number) => x.toFixed(2)
const OFFICE_NAME: Record<string, string> = { AKQ: 'Wakefield', MHX: 'Newport/Morehead City', ILM: 'Wilmington', CHS: 'Charleston', LWX: 'Sterling', PHI: 'Mount Holly', OKX: 'New York', BOX: 'Boston', MFL: 'Miami', TBW: 'Tampa Bay', JAX: 'Jacksonville', MLB: 'Melbourne', KEY: 'Key West' }

async function nws<T>(path: string, fetchImpl: typeof fetch): Promise<T | null> {
  try {
    const r = await fetchImpl(`${NWS}${path}`, { headers: { accept: 'application/geo+json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    return r.ok ? ((await r.json()) as T) : null
  } catch {
    return null
  }
}

type Zones = { features?: { properties?: { id?: string } }[] }

export interface Coast {
  /** "Rip current risk today moderate (NWS Wakefield surf zone forecast)"; null when none is issued for the beach now. */
  rip: string | null
  surf: string | null
  /** Why there is no rip line: out of season, or the service did not answer. */
  ripWhy: string | null
  /** The marine zone's first period, as written, and its name. */
  marine: { period: string; text: string; zone: string } | null
}

/** A beach's point is often over the water, where weather.gov has no land zone or office: the nearest land round it, 1.5 then 3 km out. */
function around(beach: LatLon): LatLon[] {
  return [beach, ...[1500, 3000].flatMap((m) => [270, 0, 180, 90].map((b) => destinationPoint(beach, b, m)))]
}

/* Asked again after half an hour: the Water card opens often, and these change twice a day. */
const kept = new Map<string, { at: number; coast: Promise<Coast> }>()
export function coastFor(beach: LatLon, now = Date.now()): Promise<Coast> {
  const key = `${r2(beach.lat)},${r2(beach.lon)}`
  const k = kept.get(key)
  if (k !== undefined && now - k.at < 30 * 60_000) return k.coast
  const coast = fetchCoast(beach)
  kept.set(key, { at: now, coast })
  return coast
}

export async function fetchCoast(beach: LatLon, fetchImpl: typeof fetch = fetch): Promise<Coast> {
  const at = `${r2(beach.lat)},${r2(beach.lon)}`
  const mar = await nws<Zones>(`/zones?type=marine&point=${at}`, fetchImpl)
  let zone: string | null = null
  let office: string | null = null
  let asked = 0
  let answered = 0
  for (const p of around(beach)) {
    const q = `${r2(p.lat)},${r2(p.lon)}`
    asked += 1
    const [pub, pt] = await Promise.all([nws<Zones>(`/zones?type=public&point=${q}`, fetchImpl), nws<{ properties?: { cwa?: string } }>(`/points/${q}`, fetchImpl)])
    if (pub !== null || pt !== null) answered += 1
    zone = pub?.features?.[0]?.properties?.id ?? null
    office = pt?.properties?.cwa ?? null
    if (zone !== null && office !== null) break
    if (answered === 0 && asked >= 1) break
  }
  const marineZone = mar?.features?.[0]?.properties?.id ?? null
  let rip: string | null = null
  let surf: string | null = null
  let ripWhy: string | null = answered === 0 ? 'weather.gov did not answer' : zone === null ? 'no land zone near the beach' : null
  if (zone !== null && office !== null && /^[A-Z]{3}$/.test(office)) {
    const list = await nws<{ '@graph'?: { id?: string }[] }>(`/products/types/SRF/locations/${office}`, fetchImpl)
    const id = list?.['@graph']?.[0]?.id
    if (list === null) ripWhy = 'weather.gov did not answer'
    else if (id === undefined) ripWhy = `NWS ${OFFICE_NAME[office] ?? office} is not issuing a surf zone forecast now (it does in season)`
    else {
      const prod = /^[\w-]+$/.test(id) ? await nws<{ productText?: string }>(`/products/${id}`, fetchImpl) : null
      const s = prod?.productText === undefined ? null : surfZoneFor(prod.productText, zone)
      if (s === null) ripWhy = `the surf zone forecast does not cover ${zone}`
      else {
        rip = ripLine(s, OFFICE_NAME[office] ?? office)
        surf = s.surf
      }
    }
  }
  let marine: Coast['marine'] = null
  if (marineZone !== null && /^[A-Z]{3}\d{3}$/.test(marineZone)) {
    const f = await nws<{ properties?: { periods?: { name?: string; detailedForecast?: string }[] } }>(`/zones/marine/${marineZone}/forecast`, fetchImpl)
    const p = f?.properties?.periods?.[0]
    if (p?.detailedForecast !== undefined) marine = { period: p.name ?? '', text: p.detailedForecast, zone: marineZone }
  }
  return { rip, surf, ripWhy, marine }
}

export interface Tropics {
  lines: string[]
  /** "34-kt winds 22% over 5 days at NORFOLK NAS (NHC)". */
  odds: string | null
}

/** The PWS rows are named for places; the nearest is found among weather stations whose names start them, within 100 km. */
function pwsPlaces(venue: LatLon): { name: string; at: LatLon }[] {
  return ASOS_STATIONS.filter(([, , lat, lon]) => distanceMeters(venue, { lat, lon }) <= 100_000).map(([, name, lat, lon]) => ({ name: name.toUpperCase(), at: { lat, lon } }))
}

export async function fetchTropics(venue: LatLon, dist: 'mi' | 'km', fetchImpl: typeof fetch = fetch): Promise<Tropics | null> {
  try {
    const r = await fetchImpl(NHC_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!r.ok) return null
    const near = stormsNear(venue, parseStorms(((await r.json()) as { storms?: unknown }).storms))
    if (near.length === 0) return { lines: [], odds: null }
    let odds: string | null = null
    const url = near[0].pwsUrl
    if (url !== null) {
      const t = await fetchImpl(NHC_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pws: url }), signal: AbortSignal.timeout(TIMEOUT_MS) })
      const text = t.ok ? ((await t.json()) as { text?: string }).text : undefined
      /* Row names are like "NORFOLK NAS": a station named "Norfolk" within 100 km stands for it. */
      const rows = text === undefined ? [] : [...new Set([...text.matchAll(/^([A-Z][A-Z .'/-]+?)\s+34\s/gm)].map((m) => m[1].trim()))]
      const places = pwsPlaces(venue).flatMap((p) => rows.filter((row) => row.startsWith(p.name)).map((row) => ({ name: row, at: p.at })))
      const p = text === undefined ? null : pwsFor(text, places, venue)
      if (p !== null && p.p34 !== null) odds = `Tropical-storm-force winds (34 kt) ${p.p34}% over 5 days at ${p.place.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}${p.p64 === null || p.p64 === 0 ? '' : `, hurricane-force ${p.p64}%`} (NHC)`
    }
    return { lines: near.map((s) => tropicsLine(s, dist)), odds }
  } catch {
    return null
  }
}

export function useCoast(beach: LatLon | null, venue: LatLon | null, dist: 'mi' | 'km', on: boolean): { coast: Coast | null; tropics: Tropics | null } {
  const [coast, setCoast] = useState<Coast | null>(null)
  const [tropics, setTropics] = useState<Tropics | null>(null)
  const bl = beach?.lat
  const bo = beach?.lon
  const vl = venue?.lat
  const vo = venue?.lon
  useEffect(() => {
    if (!on) return
    let live = true
    if (bl !== undefined && bo !== undefined) void coastFor({ lat: bl, lon: bo }).then((c) => live && setCoast(c))
    if (vl !== undefined && vo !== undefined) void fetchTropics({ lat: vl, lon: vo }, dist).then((t) => live && setTropics(t))
    return () => {
      live = false
    }
  }, [on, bl, bo, vl, vo, dist])
  return { coast, tropics }
}
