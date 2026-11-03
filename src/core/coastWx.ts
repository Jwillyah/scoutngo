/*
 * COAST AND TROPICS (Batch K, Section 5): the NWS's own words for the
 * water, read by code, said as facts with their source. No advice: a rip
 * current risk is said as "Rip current risk: high (NWS Miami, surf zone
 * forecast)", never what to do about it (ux-rules 28).
 *
 *   SURF ZONE   the office's Surf Zone Forecast (SRF): the section whose
 *               zone list holds the beach's public zone (VAZ098), its first
 *               period's "Rip Current Risk" and "Surf Height" lines.
 *               Offices issue it in season only; out of season there is
 *               none, and that is said.
 *   MARINE      the nearest coastal marine zone's forecast (ANZ656): the
 *               first period, as written ("E winds 5 kt. Seas around 2 ft.").
 *   TROPICS     the NHC's active storms: any within TROPICS_KM, with its
 *               distance, direction, motion and wind; the wind-speed
 *               probabilities (PWS) for the nearest place the NHC lists.
 */
import { bearingBetween, distanceMeters, type LatLon } from './geo.ts'
import { compassPoint } from './field.ts'

export const TROPICS_KM = 1000

/** Expands a UGC zone list ("FLZ168-172>174-040000-") into codes. */
export function ugcCodes(header: string): string[] {
  const out: string[] = []
  let prefix = ''
  for (const part of header.split('-')) {
    const m = /^([A-Z]{2}[ZC])?(\d{3})(?:>(\d{3}))?$/.exec(part.trim())
    if (m === null) continue
    if (m[1] !== undefined) prefix = m[1]
    if (prefix === '') continue
    const a = Number(m[2])
    const b = m[3] === undefined ? a : Number(m[3])
    for (let n = a; n <= b; n += 1) out.push(`${prefix}${String(n).padStart(3, '0')}`)
  }
  return out
}

export interface SurfZone {
  /** "Coastal Palm Beach". */
  area: string
  period: string
  rip: string | null
  surf: string | null
}

/** The section of a Surf Zone Forecast for one zone; null when the product does not cover it. */
export function surfZoneFor(text: string, zone: string): SurfZone | null {
  const sections = text.split(/\n\$\$\s*\n/)
  for (const sec of sections) {
    const lines = sec.trim().split('\n')
    const hi = lines.findIndex((l) => /^[A-Z]{2}[ZC]\d{3}[->]/.test(l.trim()))
    if (hi < 0) continue
    /* A UGC line may wrap onto the next; it ends with the "-DDHHMM-" expiry. */
    let header = lines[hi].trim()
    let j = hi
    while (!/\d{6}-$/.test(header) && j + 1 < lines.length) header += lines[++j].trim()
    if (!ugcCodes(header).includes(zone)) continue
    const area = (lines[j + 1] ?? '').trim().replace(/-$/, '')
    const body = lines.slice(j + 1).join('\n')
    const period = /\n\.([A-Z][A-Z ]+)\.\.\./.exec(body)?.[1] ?? null
    const first = period === null ? body : body.slice(body.indexOf(`.${period}...`))
    const field = (name: string) => {
      const m = new RegExp(`${name}\\*{0,2}\\.{2,}\\s*([^\\n]+)`).exec(first)
      return m === null ? null : m[1].trim().replace(/\.\s*$/, '')
    }
    return { area, period: period === null ? '' : period[0] + period.slice(1).toLowerCase(), rip: field('Rip Current Risk'), surf: field('Surf Height') }
  }
  return null
}

export function ripLine(s: SurfZone, office: string): string | null {
  if (s.rip === null) return null
  return `Rip current risk ${s.period === '' ? '' : `${s.period.toLowerCase()} `}${s.rip.toLowerCase()} (NWS ${office} surf zone forecast)`
}

/* --------------------------------------------------------------- tropics */

export interface ActiveStorm {
  name: string
  /** "Hurricane", "Tropical Storm"… */
  kind: string
  at: LatLon
  windKt: number | null
  movementDeg: number | null
  movementKt: number | null
  /** The NHC's wind-probability product's id for this storm, when it has one. */
  pwsUrl: string | null
}

const CLASS: Record<string, string> = { HU: 'Hurricane', TS: 'Tropical Storm', TD: 'Tropical Depression', STS: 'Subtropical Storm', STD: 'Subtropical Depression', PTC: 'Potential Tropical Cyclone', PC: 'Post-Tropical Cyclone' }

/** NHC CurrentStorms.json, as the app's /api/nhc passes it on. */
export function parseStorms(payload: unknown): ActiveStorm[] {
  const list = (payload as { activeStorms?: Record<string, unknown>[] } | null)?.activeStorms
  if (!Array.isArray(list)) return []
  const n = (x: unknown) => (typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x)) ? Number(x) : null)
  return list.flatMap((s) => {
    const lat = n(s.latitudeNumeric)
    const lon = n(s.longitudeNumeric)
    if (lat === null || lon === null) return []
    const pws = (s.windSpeedProbabilities as { url?: unknown } | undefined)?.url
    return [{ name: String(s.name ?? ''), kind: CLASS[String(s.classification ?? '')] ?? String(s.classification ?? 'Storm'), at: { lat, lon }, windKt: n(s.intensity), movementDeg: n(s.movementDir), movementKt: n(s.movementSpeed), pwsUrl: typeof pws === 'string' ? pws : null }]
  })
}

export function stormsNear(venue: LatLon, storms: readonly ActiveStorm[]): (ActiveStorm & { km: number; bearingDeg: number })[] {
  return storms
    .map((s) => ({ ...s, km: distanceMeters(venue, s.at) / 1000, bearingDeg: bearingBetween(venue, s.at) }))
    .filter((s) => s.km <= TROPICS_KM)
    .sort((a, b) => a.km - b.km)
}

/** "Hurricane Erin 640 km SSE · moving N 15 kt · 85 kt winds (NHC)". */
export function tropicsLine(s: ActiveStorm & { km: number; bearingDeg: number }, dist: 'mi' | 'km'): string {
  const d = Math.round(dist === 'mi' ? s.km / 1.609344 : s.km)
  const move = s.movementDeg === null || s.movementKt === null ? '' : ` · moving ${compassPoint(s.movementDeg)} ${Math.round(s.movementKt)} kt`
  return `${s.kind} ${s.name} ${d} ${dist} ${compassPoint(s.bearingDeg)}${move}${s.windKt === null ? '' : ` · ${Math.round(s.windKt)} kt winds`} (NHC)`
}

/**
 * The PWS text's rows for places: "NORFOLK VA     34  X   2( 2)   9(11) …".
 * Returns the place nearest the venue among those given with positions, and
 * its cumulative probabilities of 34, 50 and 64 kt winds over the 5 days.
 */
export function pwsFor(text: string, places: readonly { name: string; at: LatLon }[], venue: LatLon): { place: string; km: number; p34: number | null; p50: number | null; p64: number | null } | null {
  const rows = new Map<string, Partial<Record<'34' | '50' | '64', number>>>()
  for (const line of text.split('\n')) {
    const m = /^([A-Z][A-Z .'/-]+?)\s+(34|50|64)\s+(.*)$/.exec(line.trimEnd())
    if (m === null) continue
    /* The last "(nn)" on the row is the cumulative probability to 120 h. */
    const cums = [...m[3].matchAll(/\(\s*(\d+|X)\)/g)].map((x) => (x[1] === 'X' ? 0 : Number(x[1])))
    if (cums.length === 0) continue
    const name = m[1].trim()
    rows.set(name, { ...(rows.get(name) ?? {}), [m[2]]: cums[cums.length - 1] })
  }
  let best: { place: string; km: number } | null = null
  for (const p of places) {
    if (!rows.has(p.name)) continue
    const km = distanceMeters(venue, p.at) / 1000
    if (best === null || km < best.km) best = { place: p.name, km }
  }
  if (best === null) return null
  const r = rows.get(best.place) ?? {}
  return { ...best, p34: r['34'] ?? null, p50: r['50'] ?? null, p64: r['64'] ?? null }
}
