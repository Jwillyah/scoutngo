/*
 * WHAT OPENSTREETMAP SAYS ABOUT A PLACE, IN ONE REQUEST.
 *
 * The buildings and trees the 3D view draws, the coastline the elevation is
 * cleaned against (src/lib/seaMask.ts) and the mapped water: one Overpass
 * query per venue, through the one-at-a-time client (overpassClient.ts).
 * They used to be three requests (buildings, trees, coastline), each with
 * its own retries, and at Virginia Beach on 26 Oct a busy Overpass answered
 * none of them.
 *
 * Asked once when a venue is set, and shared: the 2D map's elevation and the
 * 3D view read the same answer. Each part is kept on the phone (buildings in
 * savedBuildings.ts, the coastline in seaMask.ts, trees and water here), so a
 * place loaded once still draws with no signal.
 *
 * WHAT GOES TO OVERPASS: a bounding box around the venue, the same trade the
 * site geometry and the forecast already make. No key, no account.
 */
import type { LatLon, Position } from '../core/geo.ts'
import { parseBuildings, savedBuildingsFor, keepBuildings, type Building } from './buildings.ts'
import { askOverpass } from './overpassClient.ts'
import { stitchRings } from './overpass.ts'
import { parseCoastlines, readSavedCoastline, saveCoastline, setSeaMask, SEA_CLEAN_METERS, SEA_FETCH_METERS } from './seaMask.ts'
import { boxAround } from './tileRange.ts'
import { parseTrees, SPARSE_TREES, TREE_BOX_METERS, type MappedTree, type TreesResult } from './trees.ts'

/* 600 m around the venue for buildings: past that a clay box is a speck. */
export const PLACE_BUILDING_METERS = 600
/** Mapped water for the place: lakes, ponds, rivers drawn as areas. */
export const PLACE_WATER_METERS = 1000
/*
 * THE LONGEST A PLACE MAY BE "LOADING": 50 s from asking, every server and
 * back-off included (overpassClient.ts), so the 3D view says one thing or
 * the other within a minute. With every server hanging the pill said "Map
 * data didn't load" 45.9 s after 3D was opened, 50.5 s after the venue was
 * set (measurements/2026-10-27-3d-overpass-faults.md).
 */
export const PLACE_BUDGET_MS = 50_000
const SAVED_KEY = 'scoutngo.place.v1'
const SAVED_LIMIT = 4

const bbox = (b: { south: number; west: number; north: number; east: number }) => `${b.south},${b.west},${b.north},${b.east}`

/**
 * One query, four answers. Each part has its own box and its own output, in
 * one request: buildings and water with their geometry, the coastline with
 * its ways in their own order (the sea is on the right), trees as points.
 */
export function placeQuery(venue: LatLon): string {
  const buildings = bbox(boxAround(venue, PLACE_BUILDING_METERS))
  const coast = bbox(boxAround(venue, SEA_FETCH_METERS))
  const water = bbox(boxAround(venue, PLACE_WATER_METERS))
  const trees = bbox(boxAround(venue, TREE_BOX_METERS))
  return `[out:json][timeout:45];
(
  way["building"](${buildings});
  relation["building"](${buildings});
);
out geom tags;
way["natural"="coastline"](${coast});
out geom tags;
(
  way["natural"="water"](${water});
  relation["natural"="water"](${water});
  relation["waterway"="riverbank"](${water});
);
out geom tags;
node["natural"="tree"](${trees});
out;`
}

export interface PlaceData {
  buildings: Building[]
  coastlines: Position[][]
  /** Closed rings, [lon, lat]. Kept with the place; nothing draws them yet. */
  water: Position[][]
  trees: MappedTree[]
}

export function parsePlace(payload: unknown): PlaceData {
  return { buildings: parseBuildings(payload), coastlines: parseCoastlines(payload), water: parseWater(payload), trees: parseTrees(payload) }
}

function parseWater(payload: unknown): Position[][] {
  const elements = (payload as { elements?: unknown } | null)?.elements
  if (!Array.isArray(elements)) return []
  const out: Position[][] = []
  type Raw = { type?: string; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[]; members?: { type?: string; role?: string; geometry?: { lat: number; lon: number }[] }[] }
  for (const e of elements as Raw[]) {
    const tags = e.tags ?? {}
    if (tags.natural !== 'water' && tags.waterway !== 'riverbank') continue
    if (e.type === 'way' && Array.isArray(e.geometry) && e.geometry.length >= 4) {
      const ring = e.geometry.map((p) => [p.lon, p.lat] as Position)
      const [a, b] = [ring[0], ring[ring.length - 1]]
      if (a[0] === b[0] && a[1] === b[1]) out.push(ring)
    } else if (e.type === 'relation') {
      const outers = (e.members ?? []).filter((m) => m.type === 'way' && m.role === 'outer' && Array.isArray(m.geometry))
      out.push(...stitchRings(outers.map((m) => (m.geometry ?? []).map((p) => [p.lon, p.lat] as Position))))
    }
  }
  return out
}

/* ------------------------------------------------------------ the state */

export type PlaceStatus = 'idle' | 'loading' | 'ready' | 'failed'

export interface PlaceState {
  status: PlaceStatus
  /** Why it failed, in a sentence, when it did. */
  reason: string | null
  /** What there is to draw: fetched now, or the copy saved on this phone (with when). */
  buildings: { list: Building[]; savedAt: string | null } | null
  trees: TreesResult | null
}

const IDLE: PlaceState = { status: 'idle', reason: null, buildings: null, trees: null }
let state: PlaceState = IDLE
let current: { key: string; run: Promise<PlaceState> } | null = null
const listeners = new Set<(s: PlaceState) => void>()

export const placeState = (): PlaceState => state
export function onPlace(listener: (s: PlaceState) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
function set(next: PlaceState): void {
  state = next
  for (const listener of listeners) listener(state)
}

const keyFor = (at: LatLon) => `${at.lat.toFixed(3)},${at.lon.toFixed(3)}`

export function clearPlace(): void {
  current = null
  set(IDLE)
  setSeaMask(null)
}

interface SavedExtras {
  key: string
  fetchedAt: string
  trees: MappedTree[]
  water: Position[][]
}

function readExtras(key: string): SavedExtras | null {
  try {
    const list = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]') as SavedExtras[]
    return Array.isArray(list) ? (list.find((e) => e?.key === key) ?? null) : null
  } catch {
    return null
  }
}

function saveExtras(entry: SavedExtras): void {
  try {
    const list = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]') as SavedExtras[]
    const next = [entry, ...(Array.isArray(list) ? list.filter((e) => e?.key !== entry.key) : [])].slice(0, SAVED_LIMIT)
    localStorage.setItem(SAVED_KEY, JSON.stringify(next))
  } catch {
    /* Storage full or refused: the place still works for this session. */
  }
}

const treesFrom = (trees: MappedTree[]): TreesResult =>
  trees.length < SPARSE_TREES ? { status: 'sparse', count: trees.length } : { status: 'drawn', trees }

/**
 * The place around a venue. What the phone has saved is put up at once; then
 * one request asks for all of it. The same venue asked twice shares the one
 * request; `retry` asks again after a failure. Never throws.
 */
export function loadPlace(venue: LatLon, options: { retry?: boolean; budgetMs?: number; fetcher?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {}): Promise<PlaceState> {
  const key = keyFor(venue)
  if (current !== null && current.key === key && !(options.retry === true && state.status === 'failed')) return current.run

  const buildingBounds = boxAround(venue, PLACE_BUILDING_METERS)
  const seaBox = boxAround(venue, SEA_CLEAN_METERS)
  const savedBuildings = savedBuildingsFor(buildingBounds)
  const savedCoast = readSavedCoastline(key)
  const savedExtras = readExtras(key)

  if (savedCoast !== null) setSeaMask({ box: seaBox, coastlines: savedCoast })
  else setSeaMask(null, 'loading')
  set({
    status: 'loading',
    reason: null,
    buildings: savedBuildings === null ? null : { list: savedBuildings.buildings, savedAt: savedBuildings.fetchedAt },
    trees: savedExtras === null ? null : treesFrom(savedExtras.trees),
  })

  const run = (async (): Promise<PlaceState> => {
    const answer = await askOverpass(placeQuery(venue), { budgetMs: options.budgetMs ?? PLACE_BUDGET_MS, fetcher: options.fetcher, sleep: options.sleep })
    if (current?.key !== key) return state
    if (!answer.ok) {
      if (savedCoast === null) setSeaMask(null, 'failed')
      set({ ...state, status: 'failed', reason: answer.reason })
      return state
    }
    const place = parsePlace(answer.payload)
    const now = new Date().toISOString()
    keepBuildings(buildingBounds, place.buildings)
    saveCoastline(key, place.coastlines)
    saveExtras({ key, fetchedAt: now, trees: place.trees, water: place.water })
    setSeaMask({ box: seaBox, coastlines: place.coastlines })
    set({ status: 'ready', reason: null, buildings: { list: place.buildings, savedAt: null }, trees: treesFrom(place.trees) })
    return state
  })()
  current = { key, run }
  return run
}
