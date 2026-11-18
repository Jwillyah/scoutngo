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
import { STARTER_SPOTS } from '../data/bestSkySpots.ts'
import { EXTRA_SPOTS, STARTER_ALIASES } from '../data/searchSpots.ts'
import type { SpotIn } from './bestSky.ts'
import { findLocal, type Candidate } from './spotFind.ts'

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

/* Batch SIMPLE-1, Section 2: 'address' (a house the geocoder found by its number) and 'place' (a named park, garden or refuge). */
export type Group = 'address' | 'spot' | 'beach' | 'town' | 'place' | 'business' | 'other'

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

/** A surf spot as the fuzzy match reads it (Batch 3D, Section 2). */
export function surfCandidate(s: SurfSpot): Candidate {
  return { id: s.id, name: s.name, aliases: s.aliases, where: [s.town, s.state].filter((x) => x !== '').join(', '), at: s.at, note: s.kind === 'pier' ? 'pier' : faces(s.facing), source: 'spot' }
}

/**
 * Everything the phone knows by name besides the surf spots: your saved
 * spots, the starter list with its aliases, the places in no list, and the
 * map's spots already cached here (Batch 3D, Section 2).
 */
export function localPool(saved: readonly { id: string; name: string; at: LatLon }[], osm: readonly SpotIn[]): Candidate[] {
  return [
    ...saved.map((s): Candidate => ({ id: `saved-${s.id}`, name: s.name, aliases: [], where: '', at: s.at, note: 'your spot', source: 'saved' })),
    ...STARTER_SPOTS.map((s): Candidate => ({ id: s.id, name: s.name, aliases: STARTER_ALIASES[s.id] ?? [], where: 'Virginia Beach, VA', at: s.at, note: faces(s.facing), source: 'starter' })),
    ...EXTRA_SPOTS.map((s): Candidate => ({ id: s.id, name: s.name, aliases: s.aliases, where: s.where, at: s.at, note: s.facing === null ? null : faces(s.facing), source: 'starter' })),
    ...osm.map((s): Candidate => ({ id: s.id, name: s.name, aliases: [], where: '', at: s.at, note: s.kind ?? 'on the map', source: 'osm' })),
  ]
}

/**
 * Our own spots that match, best match first (src/core/spotFind.ts: fuzzy,
 * aliases, plurals, two typos), inside the region when one was said. `extra`
 * is the rest of what the phone has: the starter list, your saved spots and
 * the map's cached spots.
 */
export function ownSpots(q: Query, from: LatLon | null, spots: readonly SurfSpot[] = SURF_SPOTS, extra: readonly Candidate[] = []): Result[] {
  if (q.words.length === 0) return []
  const pool = [...extra, ...spots.map(surfCandidate)].filter((c) => q.region === null || inBox(c.at, q.region.box))
  return findLocal(q.geocoderText, pool, from).map((f) => ({ id: f.candidate.id, name: f.candidate.name, where: f.candidate.where, at: f.candidate.at, group: 'spot' as const, note: f.candidate.note, km: f.km }))
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
 * The whole answer: the addresses the geocoder matched by house number (Batch
 * SIMPLE-1, Section 2), our spots, then the geocoders' rows that match every
 * word (inside the region when one was said), grouped, businesses only for a
 * business-like query, each group nearest first, duplicates of our own spots
 * (within 300 m) dropped.
 */
export function rankResults(q: Query, own: readonly Result[], rows: readonly GeoRow[], from: LatLon | null, addresses: readonly GeoRow[] = []): Result[] {
  const km = (at: LatLon) => (from === null ? null : distanceMeters(from, at) / 1000)
  /* The geocoder's own order, the house it matched first: the whole address was typed, so no word or region filter. */
  const fromAddresses: Result[] = addresses.map((r) => ({ id: r.id, name: r.name, where: r.where, at: r.at, group: 'address' as const, note: null, km: km(r.at) }))
  const fromRows: Result[] = []
  for (const r of rows) {
    if (q.region !== null && !inBox(r.at, q.region.box)) continue
    let group = groupOf(r)
    /* Batch SIMPLE-1, Section 2: "Norfolk Botanical Garden" is a garden, no beach, town or business, and was dropped; a named place whose name holds every word is the place asked for. Not a road. */
    if (group === 'other' && r.osmKey !== 'highway' && missing(q.words, r.name) === 0) group = 'place'
    /* Batch 3D, Section 2: a name search is searching for the business: shown when the words are in its name, not only when they look like one. */
    if (group === 'business' && !q.business && missing(q.words, r.name) > 0) continue
    if (group === 'other') continue
    if (missing(q.words, `${r.name} ${group === 'beach' ? '' : r.where}`) > 0 && missing(q.words, r.name) > 0) continue
    /* One place once: a row within 300 m of one of ours, or with one of our names within 5 km (Sandbridge the spot and Sandbridge the village), is ours. */
    const sameName = (o: Result) => words(o.name).join(' ') === words(r.name).join(' ') && distanceMeters(o.at, r.at) < 5000
    if (own.some((o) => distanceMeters(o.at, r.at) < 300 || sameName(o)) || fromRows.some((o) => o.name === r.name && distanceMeters(o.at, r.at) < 300)) continue
    /* The address's own building, said again by the other gazetteer: once. */
    if (fromAddresses.some((o) => distanceMeters(o.at, r.at) < 50)) continue
    fromRows.push({ id: r.id, name: r.name, where: r.where, at: r.at, group, note: null, km: km(r.at) })
  }
  const order: Group[] = ['spot', 'beach', 'town', 'place', 'business']
  const near = (a: Result, b: Result) => (a.km ?? 0) - (b.km ?? 0)
  /* Our own spots keep the match's order (best first); the map's rows go nearest first after them. */
  return [...fromAddresses, ...order.flatMap((g) => [...own.filter((r) => r.group === g), ...fromRows.filter((r) => r.group === g).sort(near)])]
}

export const GROUP_TITLE: Record<Exclude<Group, 'other'>, string> = { address: 'Addresses', spot: 'Spots', beach: 'Beach accesses', town: 'Towns', place: 'Places', business: 'Businesses' }

/*
 * AN ADDRESS, TYPED (Batch SIMPLE-1, Section 2). 18 Nov: "Pub, 425 E Pinner
 * St, Suffolk, VA 23434" and "425 E Pinner St, Suffolk" said "Nothing found
 * by that name". Both gazetteers were asked and both answered with the house;
 * the phone threw it away. Photon's unnamed building had no name to show,
 * Nominatim's was a building (no group), and the restaurant at the address did
 * not hold "425 e pinner st" in its name. Every test address failed the same
 * way, and so did "Norfolk Botanical Garden", a garden being in no group
 * (measurements/2026-11-18-search-address-before.md; after the change,
 * measurements/2026-11-18-search-address.md).
 *
 * An address is a part, between commas, that starts with a house number and
 * goes on with a street: "425 E Pinner St". Whatever comes before it is a name
 * typed in front ("Pub"), tried without when the whole string finds nothing.
 */
export interface Address {
  /** What was typed, spaces tidied: sent first. */
  full: string
  /** From the house number on, the name before it dropped; null when nothing came before it. */
  bare: string | null
  /** "425" */
  number: string
  /** The street's own words, its direction and kind left out: ["pinner"]. */
  street: string[]
}

const STREET_KIND = new Set(['st', 'ave', 'rd', 'dr', 'blvd', 'boulevard', 'ln', 'lane', 'ct', 'court', 'pl', 'place', 'way', 'hwy', 'highway', 'pkwy', 'parkway', 'cir', 'circle', 'ter', 'terrace', 'trl', 'trail', 'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'])
const HOUSE = /^(\d+[a-z]?)\s+(.*[a-z].*)$/i

/** The street words two spellings share: "E Pinner St" and "East Pinner Street" are both ["pinner"]. */
export const streetWords = (s: string): string[] => words(s).filter((w) => !STREET_KIND.has(w))

export function addressParts(raw: string): Address | null {
  const parts = raw.split(',').map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p !== '')
  const i = parts.findIndex((p) => HOUSE.test(p))
  const m = i < 0 ? null : HOUSE.exec(parts[i])
  if (m === null) return null
  const street = streetWords(m[2])
  /* A number, then a street with a word of its own and its kind ("425 E Pinner St"), or a town after a comma: "7 Eleven" and "17th Street Park" are not addresses. */
  const kind = words(m[2]).some((w) => STREET_KIND.has(w) && w.length > 1)
  if (street.length === 0 || (!kind && i === parts.length - 1)) return null
  return { full: parts.join(', '), bare: i === 0 ? null : parts.slice(i).join(', '), number: m[1].toLowerCase(), street }
}

/** Is a geocoder's house this address: the same number, and a street word in common. */
export function sameHouse(a: Address, number: string, street: string): boolean {
  if (number.trim().toLowerCase() !== a.number) return false
  const got = streetWords(street)
  return a.street.some((w) => got.includes(w))
}

/**
 * What the spot picker asks the geocoders, or null for nothing: an address
 * when the words are one and nothing on the phone matched them, the words
 * otherwise (the region left out, as before). Only the typed words, never a
 * position.
 */
export type GeoAsk = { kind: 'address'; address: Address; text: string } | { kind: 'words'; text: string }

export function geoAsk(raw: string, localMatched: boolean): GeoAsk | null {
  /* `text`, the words search (region left out), is also the address's fallback when no house matches. */
  const text = parseQuery(raw).geocoderText
  const address = localMatched ? null : addressParts(raw)
  if (address !== null) return { kind: 'address', address, text }
  return text === '' ? null : { kind: 'words', text }
}

/** One key per question: an answer to another question is not shown (E7). */
export const askKey = (a: GeoAsk): string => (a.kind === 'address' ? `address:${a.address.full}` : a.text)
