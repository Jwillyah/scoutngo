/*
 * SEARCH v2 (Batch Map, Section 2; board docs/mockups/SearchV2.png). 9 Nov:
 * "First st outer banks" found "Outer Banks, Meridian Idaho", a restaurant
 * and a hospital, and never 1st Street, Kill Devil Hills.
 *
 *   normalise   "first" and "1st", "st" and "street", "ave" and "avenue",
 *               apostrophes dropped ("jennettes" is "Jennette's")
 *   region      "outer banks", "obx" and the like are a filter on where, not
 *               words to match ("first st outer banks" is "1st st" there)
 *   order       our own spots (src/data/surfSpots.ts) first; then beaches,
 *               beach accesses, surf spots and piers from OpenStreetMap; then
 *               towns; businesses only when the words look like one
 *   distance    sorted on the phone, from the current spot: only the typed
 *               words ever go to a geocoder
 *   typos       one letter off in a word of four or more, two in eight or more
 */
import { distanceMeters, type LatLon } from './geo.ts'
import { REGIONS, SURF_SPOTS, type SurfSpot } from '../data/surfSpots.ts'

const ORDINAL: Record<string, string> = { first: '1st', second: '2nd', third: '3rd', fourth: '4th', fifth: '5th', sixth: '6th', seventh: '7th', eighth: '8th', ninth: '9th', tenth: '10th' }
const SAME: Record<string, string> = { street: 'st', avenue: 'ave', road: 'rd', drive: 'dr', north: 'n', south: 's', east: 'e', west: 'w', beach: 'beach', saint: 'st', mount: 'mt', point: 'pt', fishing: 'fishing' }
/** Words that only say "a place": dropped from matching. */
const FILLER = new Set(['the', 'at', 'in', 'near', 'nc', 'va', 'sc', 'of'])
/** Words that make a query look like a business: only then are businesses shown. */
const BUSINESS = new Set(['restaurant', 'cafe', 'coffee', 'bar', 'grill', 'pizza', 'hotel', 'motel', 'inn', 'shop', 'store', 'surf shop', 'rentals', 'rental', 'market', 'pub', 'brewery', 'hospital', 'clinic', 'pharmacy', 'gas', 'station', 'bank', 'church', 'school', 'deli', 'bakery', 'diner', 'tavern', 'outfitters'])

/** One word, as the search compares it. */
export function canonWord(w: string): string {
  const x = w.toLowerCase().replace(/['’`.]/g, '')
  return ORDINAL[x] ?? SAME[x] ?? x
}

export const words = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/['’`]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== '')
    .map(canonWord)

export interface Query {
  words: string[]
  region: (typeof REGIONS)[number] | null
  business: boolean
  /** What goes to the geocoder: the typed words, the region's words left out. */
  geocoderText: string
}

export function parseQuery(raw: string): Query {
  let text = ` ${raw.toLowerCase().replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `
  let region: Query['region'] = null
  for (const r of REGIONS) {
    for (const phrase of r.words) {
      const at = text.indexOf(` ${phrase} `)
      /* A region is a filter only beside other words: "virginia beach" alone is the town. */
      if (at >= 0 && text.trim() !== phrase) {
        region = r
        text = `${text.slice(0, at)} ${text.slice(at + phrase.length + 1)}`
      }
    }
  }
  const ws = words(text).filter((w) => !FILLER.has(w))
  const business = ws.some((w) => BUSINESS.has(w))
  return { words: ws, region, business, geocoderText: text.replace(/\s+/g, ' ').trim() }
}

/** Edit distance with a swapped pair counted as one ("peir" is "pier"), small words only. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[a.length][b.length]
}

/** Does a query word match a name word: equal, a prefix (the last word, being typed), or a typo away. */
export function wordMatches(q: string, n: string, last: boolean): boolean {
  if (q === n) return true
  if (last && q.length >= 2 && n.startsWith(q)) return true
  /* "jennettes" is "Jennette's" said as people type it: a trailing s either way. */
  if (q.replace(/s$/, '') === n.replace(/s$/, '')) return true
  const allowed = q.length >= 8 ? 2 : q.length >= 4 ? 1 : 0
  return allowed > 0 && Math.abs(q.length - n.length) <= allowed && editDistance(q, n) <= allowed
}

/** 0 when every query word is in the name (in any order), else how many are missing. */
export function missing(query: readonly string[], name: string): number {
  const nw = words(name)
  return query.filter((q, i) => !nw.some((n) => wordMatches(q, n, i === query.length - 1))).length
}

const inBox = (at: LatLon, b: { south: number; west: number; north: number; east: number }) => at.lat >= b.south && at.lat <= b.north && at.lon >= b.west && at.lon <= b.east

export type Group = 'spot' | 'beach' | 'town' | 'business' | 'other'

export interface Result {
  id: string
  name: string
  /** "Kill Devil Hills, NC" */
  where: string
  at: LatLon
  group: Group
  /** "faces ESE", "pier", or null. */
  note: string | null
  /** From the current spot, km; null with none. */
  km: number | null
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
const faces = (deg: number) => `faces ${COMPASS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16]}`

/** Our own spots that match: every word in the name or one alias, inside the region when one was said. */
export function ownSpots(q: Query, from: LatLon | null, spots: readonly SurfSpot[] = SURF_SPOTS): Result[] {
  if (q.words.length === 0) return []
  return spots
    .filter((s) => (q.region === null || inBox(s.at, q.region.box)) && [s.name, ...s.aliases].some((n) => missing(q.words, n) === 0))
    .map((s) => ({ id: s.id, name: s.name, where: `${s.town}, ${s.state}`, at: s.at, group: 'spot' as const, note: s.kind === 'pier' ? 'pier' : faces(s.facing), km: from === null ? null : distanceMeters(from, s.at) / 1000 }))
}

/** A geocoder's row, with OpenStreetMap's own class and type. */
export interface GeoRow {
  id: string
  name: string
  where: string
  at: LatLon
  osmKey: string
  osmValue: string
}

/** Which group an OpenStreetMap feature belongs in. */
export function groupOf(r: Pick<GeoRow, 'osmKey' | 'osmValue' | 'name'>): Group {
  const k = r.osmKey
  const v = r.osmValue
  const name = r.name.toLowerCase()
  if ((k === 'natural' && v === 'beach') || (k === 'leisure' && v === 'beach_resort') || (k === 'sport' && v === 'surfing') || (k === 'man_made' && v === 'pier') || /beach access|surf/.test(name)) return 'beach'
  if ((k === 'place' && /^(city|town|village|hamlet|suburb|neighbourhood|locality|island)$/.test(v)) || (k === 'boundary' && v === 'administrative')) return 'town'
  if (/^(amenity|shop|tourism|craft|office|healthcare|club)$/.test(k)) return 'business'
  return 'other'
}

/**
 * The whole answer: our spots, then the geocoders' rows that match every word
 * (inside the region when one was said), grouped, businesses only for a
 * business-like query, each group nearest first, duplicates of our own spots
 * (within 300 m) dropped.
 */
export function rankResults(q: Query, own: readonly Result[], rows: readonly GeoRow[], from: LatLon | null): Result[] {
  const fromRows: Result[] = []
  for (const r of rows) {
    if (q.region !== null && !inBox(r.at, q.region.box)) continue
    const group = groupOf(r)
    if (group === 'business' && !q.business) continue
    if (group === 'other') continue
    if (missing(q.words, `${r.name} ${group === 'beach' ? '' : r.where}`) > 0 && missing(q.words, r.name) > 0) continue
    /* One place once: a row within 300 m of one of ours, or with one of our names within 5 km (Sandbridge the spot and Sandbridge the village), is ours. */
    const sameName = (o: Result) => words(o.name).join(' ') === words(r.name).join(' ') && distanceMeters(o.at, r.at) < 5000
    if (own.some((o) => distanceMeters(o.at, r.at) < 300 || sameName(o)) || fromRows.some((o) => o.name === r.name && distanceMeters(o.at, r.at) < 300)) continue
    fromRows.push({ id: r.id, name: r.name, where: r.where, at: r.at, group, note: null, km: from === null ? null : distanceMeters(from, r.at) / 1000 })
  }
  const order: Group[] = ['spot', 'beach', 'town', 'business']
  const near = (a: Result, b: Result) => (a.km ?? 0) - (b.km ?? 0)
  return order.flatMap((g) => [...own, ...fromRows].filter((r) => r.group === g).sort(near))
}

export const GROUP_TITLE: Record<Exclude<Group, 'other'>, string> = { spot: 'Surf spots', beach: 'Beach accesses', town: 'Towns', business: 'Businesses' }
