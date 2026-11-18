/*
 * THE FAA'S OTHER DRONE LAYERS, READ ON THE PHONE (Batch DRONE, Section 2.3;
 * boards Drone_P3, Drone_Layers).
 *
 * The class airspace, the facility map grid, restricted and prohibited areas
 * and the national parks are baked into the app (docs/airspace-sources.md).
 * These are fetched whole, nationwide, the same answer for everyone, so the
 * request carries no place at all; which of them is near the marker is
 * worked out here:
 *
 *   nsufr     National Security UAS Flight Restrictions (14 CFR 99.7), full
 *             and part time
 *   fria      FAA-Recognized Identification Areas: Remote ID broadcast is
 *             not needed inside one (14 CFR 89.105)
 *   heliport  NASR heliports (airports with TYPE_CODE 'HP')
 *   sua       special use airspace the bake leaves out: warning, alert and
 *             military operations areas
 *   tfr       temporary flight restrictions, from the FAA's TFR map service
 *             through this app's /api/tfr (tfr.faa.gov sends no CORS header)
 *
 * NEVER A PERMISSION. Every line is a fact with its source; nothing says an
 * area is open, clear or safe, and nothing here issues or stands for LAANC.
 */
import type { LatLon } from './geo.ts'
import { polygonsOf } from './airspaceLayer.ts'
import { heliportShown } from './heliportRule.ts'

export type FaaLayerId = 'nsufr' | 'fria' | 'heliport' | 'sua' | 'tfr'

export interface FaaArea {
  /** Outer rings and holes as [lon, lat] pairs: "inside an odd number of rings". */
  rings: [number, number][][]
  bbox: [number, number, number, number]
  name: string
  /** One line of detail: floor and ceiling, the controlling base, the dates. */
  detail: string
  /** For TFRs: the dates the title gives, inclusive, as YYYY-MM-DD; null when it gives none. */
  fromIso?: string | null
  toIso?: string | null
  /** For special use: W, A or MOA. */
  type?: string
}

export interface FaaPoint {
  at: LatLon
  name: string
  id: string
}

/* ------------------------------------------------------------ geometry */

function bboxOf(rings: readonly (readonly [number, number])[][]): [number, number, number, number] {
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const r of rings) {
    for (const [x, y] of r) {
      w = Math.min(w, x)
      e = Math.max(e, x)
      s = Math.min(s, y)
      n = Math.max(n, y)
    }
  }
  return [w, s, e, n]
}

function inRing(ring: readonly (readonly [number, number])[], lon: number, lat: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Inside an odd number of the area's rings. */
export function inArea(area: FaaArea, at: LatLon): boolean {
  const [w, s, e, n] = area.bbox
  if (at.lon < w || at.lon > e || at.lat < s || at.lat > n) return false
  return area.rings.filter((r) => inRing(r, at.lon, at.lat)).length % 2 === 1
}

const R = 6_371_000
/** Great-circle distance, metres. */
export function metresBetween(a: LatLon, b: LatLon): number {
  const p1 = (a.lat * Math.PI) / 180
  const p2 = (b.lat * Math.PI) / 180
  const dp = p2 - p1
  const dl = ((b.lon - a.lon) * Math.PI) / 180
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Roughly how far the area's nearest vertex is, metres; 0 inside it. */
export function metresToArea(area: FaaArea, at: LatLon): number {
  if (inArea(area, at)) return 0
  let best = Infinity
  for (const r of area.rings) for (const [lon, lat] of r) best = Math.min(best, metresBetween(at, { lat, lon }))
  return best
}

/* ------------------------------------------------------- the answers */

type Geo = { type?: string; coordinates?: unknown }
type Feature = { geometry?: Geo | null; properties?: Record<string, unknown> | null }

/** A GeoJSON Polygon or MultiPolygon's rings, flattened: pieces and holes alike. */
function ringsOf(g: Geo | null | undefined): [number, number][][] {
  if (g == null || !Array.isArray(g.coordinates)) return []
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? (g.coordinates as unknown[]) : []
  const out: [number, number][][] = []
  for (const p of polys) {
    if (!Array.isArray(p)) continue
    for (const ring of p) {
      if (!Array.isArray(ring)) continue
      const pts = ring.filter((c): c is [number, number] => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])).map((c) => [c[0], c[1]] as [number, number])
      if (pts.length >= 3) out.push(pts)
    }
  }
  return out
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
const featuresOf = (fc: unknown): Feature[] => {
  const f = (fc as { features?: unknown } | null)?.features
  return Array.isArray(f) ? (f as Feature[]) : []
}

function area(f: Feature, name: string, detail: string, extra: Partial<FaaArea> = {}): FaaArea[] {
  const rings = ringsOf(f.geometry)
  return rings.length === 0 ? [] : [{ rings, bbox: bboxOf(rings), name, detail, ...extra }]
}

/** "Surface to 400' AGL", the restriction's floor and ceiling as the FAA writes them. */
const floorCeiling = (floor: unknown, ceiling: unknown) => {
  const f = str(floor)
  const c = str(ceiling)
  return f === '' && c === '' ? '' : `${f === '' ? 'floor not given' : f} to ${c === '' ? 'ceiling not given' : c}`
}

export function parseNsufr(fc: unknown): FaaArea[] {
  return featuresOf(fc).flatMap((f) => {
    const p = f.properties ?? {}
    const base = str(p.Base) || str(p.Facility) || 'National security area'
    const fc2 = floorCeiling(p.Floor, p.Ceiling)
    const reason = str(p.Reason)
    return area(f, base, [reason, fc2].filter((s) => s !== '').join(' · '))
  })
}

export function parseFria(fc: unknown): FaaArea[] {
  return featuresOf(fc).flatMap((f) => {
    const p = f.properties ?? {}
    const where = [str(p.city), str(p.state)].filter((s) => s !== '').join(', ')
    return area(f, str(p.title) || 'FAA-Recognized Identification Area', where)
  })
}

export function parseSua(fc: unknown): FaaArea[] {
  const kind: Record<string, string> = { W: 'Warning area', A: 'Alert area', MOA: 'Military operations area' }
  return featuresOf(fc).flatMap((f) => {
    const p = f.properties ?? {}
    const type = str(p.TYPE_CODE)
    const floor = str(p.LOWER_VAL)
    const floorWords = floor === '' || floor === '0' ? 'from the surface' : `from ${floor} ${str(p.LOWER_UOM) === 'FL' ? 'FL' : 'ft'}${str(p.LOWER_CODE) === 'MSL' ? ' MSL' : ''}`
    const times = str(p.TIMESOFUSE)
    return area(f, `${str(p.NAME) || 'Special use area'} (${kind[type] ?? type})`, [floorWords, times].filter((s) => s !== '').join(' · '), { type })
  })
}

export function parseHeliports(fc: unknown): FaaPoint[] {
  return featuresOf(fc).flatMap((f) => {
    const c = (f.geometry as { coordinates?: unknown } | null)?.coordinates
    if (!Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return []
    const p = f.properties ?? {}
    return [{ at: { lat: c[1] as number, lon: c[0] as number }, name: str(p.NAME) || 'Heliport', id: str(p.IDENT) }]
  })
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** The dates a TFR's title gives: "…, Tuesday, November 17, 2026 through Wednesday, November 18, 2026 UTC". */
export function tfrDates(title: string): { fromIso: string | null; toIso: string | null } {
  const found = [...title.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})/gi)].map(
    (m) => `${m[3]}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`,
  )
  if (found.length === 0) return { fromIso: null, toIso: null }
  /* One date: the day it took effect; it runs until it is cancelled. */
  return { fromIso: found[0], toIso: found.length > 1 ? found[found.length - 1] : null }
}

export function parseTfrs(fc: unknown): FaaArea[] {
  return featuresOf(fc).flatMap((f) => {
    const p = f.properties ?? {}
    const title = str(p.TITLE)
    const key = str(p.NOTAM_KEY).split('-')[0]
    const legal = str(p.LEGAL)
    return area(f, `TFR ${key}${legal === '' ? '' : ` · ${legal.toLowerCase()}`}`, title, tfrDates(title))
  })
}

/** In force on `todayIso` by the dates its title gives; a TFR with no dates counts as in force. */
export const tfrOn = (t: FaaArea, todayIso: string): boolean => (t.fromIso == null || t.fromIso <= todayIso) && (t.toIso == null || t.toIso >= todayIso)

/* ---------------------------------------------------- at the marker */

export interface FaaLayers {
  nsufr: FaaArea[] | null
  fria: FaaArea[] | null
  heliport: FaaPoint[] | null
  sua: FaaArea[] | null
  tfr: FaaArea[] | null
}

/** TFRs counted within this of the marker, metres (20 statute miles). */
export const TFR_NEAR_M = 20 * 1609.344

export interface AtMarker {
  /** null: that layer has not arrived. */
  tfrsToday: { inside: FaaArea[]; near: number } | null
  heliport: { point: FaaPoint; metres: number } | null | 'none'
  fria: FaaArea | null | 'unknown'
  nsufr: FaaArea[] | null
  sua: FaaArea[] | null
}

export function atMarker(layers: FaaLayers, at: LatLon, todayIso: string): AtMarker {
  const tfrs = layers.tfr?.filter((t) => tfrOn(t, todayIso)) ?? null
  const heli = layers.heliport === null ? null : layers.heliport.reduce<{ point: FaaPoint; metres: number } | null>((best, p) => {
    const m = metresBetween(at, p.at)
    return best === null || m < best.metres ? { point: p, metres: m } : best
  }, null)
  return {
    tfrsToday: tfrs === null ? null : { inside: tfrs.filter((t) => inArea(t, at)), near: tfrs.filter((t) => metresToArea(t, at) <= TFR_NEAR_M).length },
    heliport: layers.heliport === null ? null : heli ?? 'none',
    fria: layers.fria === null ? 'unknown' : (layers.fria.find((f) => inArea(f, at)) ?? null),
    nsufr: layers.nsufr === null ? null : layers.nsufr.filter((a) => inArea(a, at)),
    sua: layers.sua === null ? null : layers.sua.filter((a) => inArea(a, at)),
  }
}

/** The sheet's headline: "Class D · max 250 ft here", from the baked class airspace and grid. Never "clear". */
export function markerHeadline(classes: readonly string[], ceilingFt: number | null): string {
  const controlled = classes.filter((c) => c !== 'E')
  const cls = controlled[0] ?? (classes.includes('E') ? 'E' : null)
  if (cls === null) return ceilingFt === null ? 'No class airspace in the app’s data here' : `Facility map · max ${ceilingFt} ft here`
  return ceilingFt === null ? `Class ${cls} · no grid square here` : `Class ${cls} · max ${ceilingFt} ft here`
}

/** Miles to one decimal under 10, whole past it: "0.8 mi", "12 mi". */
export const milesWords = (m: number): string => {
  const mi = m / 1609.344
  return mi < 10 ? `${Math.round(mi * 10) / 10} mi` : `${Math.round(mi)} mi`
}

/** The chips under the headline, in words. `sunset` is already written. */
export function markerChips(m: AtMarker, sunset: string | null): { text: string; tone: 'hazard' | 'note' }[] {
  const out: { text: string; tone: 'hazard' | 'note' }[] = []
  if (m.tfrsToday === null) out.push({ text: "TFRs: couldn't check", tone: 'note' })
  else if (m.tfrsToday.inside.length > 0) out.push({ text: `Inside ${m.tfrsToday.inside.length === 1 ? 'a TFR' : `${m.tfrsToday.inside.length} TFRs`} today`, tone: 'hazard' })
  else out.push({ text: `${m.tfrsToday.near} TFR${m.tfrsToday.near === 1 ? '' : 's'} within 20 mi today`, tone: 'note' })
  if (m.heliport === null) out.push({ text: 'Heliports not received', tone: 'note' })
  else if (m.heliport !== 'none') out.push({ text: `Heliport ${milesWords(m.heliport.metres)}`, tone: 'note' })
  if (m.fria === 'unknown') out.push({ text: 'FRIAs not received', tone: 'note' })
  else out.push({ text: m.fria === null ? 'Remote ID needed' : 'In a FRIA · no broadcast needed', tone: 'note' })
  if (sunset !== null) out.push({ text: `Sunset ${sunset}`, tone: 'note' })
  return out
}

/* ------------------------------------------------------- on the map */

export interface View {
  south: number
  west: number
  north: number
  east: number
}

const meets = (b: readonly number[], v: View) => b[0] <= v.east && b[2] >= v.west && b[1] <= v.north && b[3] >= v.south

/** The layers' shapes that meet the view, as GeoJSON for the map, each tagged with its kind. TFRs only those in force today. */
export function liveCollection(layers: FaaLayers, view: View, on: Readonly<Record<FaaLayerId, boolean>>, todayIso: string, heli?: { marker: LatLon; zoom: number }): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  const add = (kind: FaaLayerId, list: FaaArea[] | null) => {
    if (!on[kind] || list === null) return
    for (const a of list) {
      if (!meets(a.bbox, view)) continue
      if (kind === 'tfr' && !tfrOn(a, todayIso)) continue
      /* Pieces and holes sorted the way the baked shapes are (src/core/airspaceLayer.ts polygonsOf). */
      features.push({ type: 'Feature', properties: { kind, name: a.name }, geometry: { type: 'MultiPolygon', coordinates: polygonsOf(a.rings.map((r) => r.flat())) } })
    }
  }
  add('sua', layers.sua)
  add('fria', layers.fria)
  add('nsufr', layers.nsufr)
  add('tfr', layers.tfr)
  if (on.heliport && layers.heliport !== null) {
    for (const h of layers.heliport) {
      if (h.at.lon < view.west || h.at.lon > view.east || h.at.lat < view.south || h.at.lat > view.north) continue
      /* Batch SIMPLE-1, Section 1: near the marker, or zoomed in (src/core/heliportRule.ts). */
      if (heli !== undefined && !heliportShown(metresBetween(heli.marker, h.at), heli.zoom)) continue
      features.push({ type: 'Feature', properties: { kind: 'heliport', name: h.name }, geometry: { type: 'Point', coordinates: [h.at.lon, h.at.lat] } })
    }
  }
  return { type: 'FeatureCollection', features }
}
