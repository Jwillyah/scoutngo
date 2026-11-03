/*
 * THE SHARED CORRECTIONS FILE, DOWNLOADED (Batch L, Section 1). The
 * arithmetic is src/core/sharedSkill.ts; the file is made each night by
 * .github/workflows/model-skill.yml and served by GitHub Pages.
 *
 * WHAT LEAVES THE PHONE. Two fixed URLs: the region's manifest and the dated
 * file it names. No coordinates, no station, no query string: every phone in
 * the region asks for the same bytes. Which region is worked out here from
 * the venue (inside the region's box), and only a venue inside one asks at all.
 *
 * KEPT. Only the stations within reach of the venues used (at most KEEP), not
 * the whole file, in localStorage; checked again at most every CHECK_MS.
 * Offline, or a file older than SHARED_MAX_AGE_DAYS: the phone's own scores
 * (src/lib/blendData.ts) are used instead, never a mix.
 */
import type { LatLon } from '../core/geo.ts'
import { nearestShared, SHARED_STATION_KM, validateShared, type SharedFile } from '../core/sharedSkill.ts'
import { distanceMeters } from '../core/geo.ts'
import MIDATL from '../../skill/midatl.json' with { type: 'json' }

export const SHARED_BASE = 'https://jwillyah.github.io/scoutngo/skill/v1'
const KEY = 'scoutngo.sharedSkill.v1'
const CHECK_MS = 6 * 3_600_000
const KEEP = 4
const TIMEOUT_MS = 15_000

interface Region {
  region: string
  bbox: { south: number; west: number; north: number; east: number }
}
export const REGIONS: readonly Region[] = [MIDATL]

/** The region whose box holds the venue, worked out on the phone; null outside every region. */
export function regionFor(venue: LatLon): string | null {
  return REGIONS.find((r) => venue.lat >= r.bbox.south && venue.lat <= r.bbox.north && venue.lon >= r.bbox.west && venue.lon <= r.bbox.east)?.region ?? null
}

export const manifestUrl = (region: string) => `${SHARED_BASE}/${region}/latest.json`
export const fileUrl = (region: string, file: string) => `${SHARED_BASE}/${region}/${encodeURIComponent(file)}`

interface Kept {
  file: SharedFile
  /** When the manifest was last asked, ms. */
  checkedAt: number
}

function readKept(region: string): Kept | null {
  try {
    const k = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Kept | null
    if (k === null || k.file?.region !== region) return null
    const v = validateShared(k.file)
    return v.ok ? { file: v.file, checkedAt: k.checkedAt } : null
  } catch {
    return null
  }
}

function writeKept(k: Kept): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(k))
  } catch {
    /* storage full or off: asked again next time */
  }
}

/** The file cut down to the KEEP stations nearest the venue (and any kept before that are still near it). */
export function slim(f: SharedFile, venue: LatLon, before: SharedFile | null): SharedFile {
  const near = f.stations
    .map((s) => ({ s, km: distanceMeters(venue, { lat: s.lat, lon: s.lon }) / 1000 }))
    .filter((x) => x.km <= SHARED_STATION_KM * 1.5)
    .sort((a, b) => a.km - b.km)
  const ids = new Set(near.slice(0, KEEP).map((x) => x.s.id))
  for (const s of before?.stations ?? []) if (ids.size < KEEP * 2 && f.cells[s.id] !== undefined) ids.add(s.id)
  return { ...f, stations: f.stations.filter((s) => ids.has(s.id)), cells: Object.fromEntries(Object.entries(f.cells).filter(([id]) => ids.has(id))), check: Object.fromEntries(Object.entries(f.check).filter(([id]) => ids.has(id))) }
}

async function gunzipJson(buf: ArrayBuffer): Promise<unknown> {
  const b = new Uint8Array(buf)
  /* GitHub Pages serves a .gz as bytes; a proxy may already have opened it. */
  if (b[0] === 0x1f && b[1] === 0x8b) {
    const s = new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))
    return JSON.parse(await new Response(s).text())
  }
  return JSON.parse(new TextDecoder().decode(b))
}

/** Downloads the region's newest file whole, validated; the reason when it cannot. */
export async function downloadShared(region: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: true; file: SharedFile } | { ok: false; reason: string }> {
  try {
    const m = await fetchImpl(manifestUrl(region), { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-cache' })
    if (!m.ok) return { ok: false, reason: `manifest ${m.status}` }
    const man = (await m.json()) as { file?: unknown }
    if (typeof man.file !== 'string' || !/^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(man.file)) return { ok: false, reason: 'manifest names no file' }
    const r = await fetchImpl(fileUrl(region, man.file), { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!r.ok) return { ok: false, reason: `file ${r.status}` }
    const v = validateShared(await gunzipJson(await r.arrayBuffer()))
    return v.ok ? { ok: true, file: v.file } : { ok: false, reason: `not the schema: ${v.reason}` }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'failed' }
  }
}

/**
 * The shared file for the venue's region: the kept one, refreshed when it
 * is due or holds no station near the venue. Null outside every region or
 * when nothing was ever downloaded.
 */
export async function sharedFor(venue: LatLon, now: Date, fetchImpl: typeof fetch = fetch): Promise<SharedFile | null> {
  const region = regionFor(venue)
  if (region === null) return null
  const kept = readKept(region)
  const due = kept === null || now.getTime() - kept.checkedAt > CHECK_MS || nearestShared(kept.file, venue) === null
  if (!due) return kept.file
  const got = await downloadShared(region, fetchImpl)
  if (!got.ok) {
    if (kept !== null) writeKept({ ...kept, checkedAt: now.getTime() - CHECK_MS + 30 * 60_000 })
    return kept?.file ?? null
  }
  const file = slim(got.file, venue, kept?.file ?? null)
  writeKept({ file, checkedAt: now.getTime() })
  return file
}
