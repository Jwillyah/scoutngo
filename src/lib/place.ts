/*
 * WHAT THE MAP KNOWS ABOUT A PLACE: ITS BUILDINGS, AND ITS TREES.
 *
 * THE BUILDINGS COME FROM THE MAP TILES (src/lib/vectorTiles.ts, through
 * fetchBuildings): OpenFreeMap's footprints with their heights, read through
 * the same cache as the photograph. They used to come from Overpass, in one
 * query with the coastline, water and trees, and at Virginia Beach Fishing
 * Pier on 27 Oct a phone behind iCloud Private Relay got "Map data didn't
 * load" every time while a Mac on the same network did not: Overpass limits
 * by address, and Private Relay shares one between many phones. The sea the
 * elevation is cleaned against comes from the same tiles (src/lib/seaMask.ts).
 *
 * THE TREES ARE STILL OVERPASS'S, because the tiles do not carry single
 * trees. Asked after the buildings, through the one-at-a-time client
 * (overpassClient.ts), and a failure there never blocks the 3D view: the
 * buildings stand, the pill stays quiet, and the legend says the trees did
 * not load.
 *
 * Asked once when a venue is set, and shared by the 2D map and the 3D view.
 * Both parts are kept on the phone, so a place loaded once still draws with
 * no signal.
 *
 * WHAT GOES WHERE: tile numbers to OpenFreeMap, the same trade the
 * photograph makes with Esri; a box around the venue to Overpass for the
 * trees. No key, no account.
 */
import type { LatLon } from '../core/geo.ts'
import { fetchBuildings, savedBuildingsFor, type Building } from './buildings.ts'
import { askOverpass } from './overpassClient.ts'
import { boxAround } from './tileRange.ts'
import { forgetVectorFailures } from './vectorTiles.ts'
import { parseTrees, SPARSE_TREES, TREE_BOX_METERS, type MappedTree, type TreesResult } from './trees.ts'

/* 600 m around the venue for buildings: past that a clay box is a speck. */
export const PLACE_BUILDING_METERS = 600
/*
 * THE LONGEST THE TREES MAY BE "LOADING": 50 s from asking, every Overpass
 * server and back-off included (overpassClient.ts). With every server
 * hanging the old place request gave up 45.9 s after 3D was opened
 * (measurements/2026-10-27-3d-overpass-faults.md).
 */
export const TREES_BUDGET_MS = 50_000
const SAVED_KEY = 'scoutngo.trees.v1'
const SAVED_LIMIT = 4

/** Single mapped trees around the venue, as points. */
export function treesQuery(venue: LatLon): string {
  const b = boxAround(venue, TREE_BOX_METERS)
  return `[out:json][timeout:45];
node["natural"="tree"](${b.south},${b.west},${b.north},${b.east});
out;`
}

/* ------------------------------------------------------------ the state */

export type PlaceStatus = 'idle' | 'loading' | 'ready' | 'failed'

export interface PlaceState {
  /** The buildings': the map data the 3D view stands on. */
  status: PlaceStatus
  /** Why it failed, in a sentence, when it did. */
  reason: string | null
  /** What there is to draw: loaded now, or the copy saved on this phone (with when). */
  buildings: { list: Building[]; savedAt: string | null } | null
  /** Null while the trees are being asked for and nothing is saved. */
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
}

interface SavedTrees {
  key: string
  fetchedAt: string
  trees: MappedTree[]
}

function readTrees(key: string): SavedTrees | null {
  try {
    const list = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]') as SavedTrees[]
    return Array.isArray(list) ? (list.find((e) => e?.key === key) ?? null) : null
  } catch {
    return null
  }
}

function saveTrees(entry: SavedTrees): void {
  try {
    const list = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]') as SavedTrees[]
    const next = [entry, ...(Array.isArray(list) ? list.filter((e) => e?.key !== entry.key) : [])].slice(0, SAVED_LIMIT)
    localStorage.setItem(SAVED_KEY, JSON.stringify(next))
  } catch {
    /* Storage full or refused: the trees still draw for this session. */
  }
}

const treesFrom = (trees: MappedTree[]): TreesResult =>
  trees.length < SPARSE_TREES ? { status: 'sparse', count: trees.length } : { status: 'drawn', trees }

/**
 * The place around a venue. What the phone has saved is put up at once; then
 * the buildings from the map tiles, then the trees from Overpass. The same
 * venue asked twice shares the one load; `retry` asks again after a failure,
 * of the buildings or of the trees. Never throws.
 */
export function loadPlace(venue: LatLon, options: { retry?: boolean; refresh?: boolean; budgetMs?: number; fetcher?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {}): Promise<PlaceState> {
  const key = keyFor(venue)
  /* `refresh`: ask again even after a success, because the heights changed (a 3D scan arrived). */
  const again = options.refresh === true || (options.retry === true && (state.status === 'failed' || state.trees?.status === 'unavailable'))
  if (current !== null && current.key === key && !again) return current.run
  /* A Retry pressed asks the map tiles again now, not when their failure is forgotten (vectorTiles.ts). */
  if (again) forgetVectorFailures()

  const bounds = boxAround(venue, PLACE_BUILDING_METERS)
  const savedBuildings = savedBuildingsFor(bounds)
  const savedTrees = readTrees(key)
  set({
    status: 'loading',
    reason: null,
    /* A retry keeps what is already drawn; a new venue starts from what was saved for it. */
    buildings: savedBuildings !== null ? { list: savedBuildings.buildings, savedAt: savedBuildings.fetchedAt } : current?.key === key ? state.buildings : null,
    trees: savedTrees === null ? null : treesFrom(savedTrees.trees),
  })

  const run = (async (): Promise<PlaceState> => {
    const buildings = await fetchBuildings(bounds)
    if (current?.key !== key) return state
    if (buildings.status === 'ok') {
      set({ ...state, status: 'ready', reason: null, buildings: { list: buildings.buildings, savedAt: buildings.savedAt ?? null } })
    } else {
      set({ ...state, status: 'failed', reason: buildings.reason })
    }

    const answer = await askOverpass(treesQuery(venue), { budgetMs: options.budgetMs ?? TREES_BUDGET_MS, fetcher: options.fetcher, sleep: options.sleep })
    if (current?.key !== key) return state
    if (answer.ok) {
      const trees = parseTrees(answer.payload)
      saveTrees({ key, fetchedAt: new Date().toISOString(), trees })
      set({ ...state, trees: treesFrom(trees) })
    } else if (state.trees === null) {
      /* Nothing saved and no answer: said in the legend, never in the way. */
      set({ ...state, trees: { status: 'unavailable' } })
    }
    return state
  })()
  current = { key, run }
  return run
}
