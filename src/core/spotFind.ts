/*
 * FINDING OUR OWN SPOTS, FUZZILY (Batch 3D, Section 2). 17 Nov, on the phone:
 * "Chics beach" and "Backdeck" found nothing, though the starter list had
 * "Chick's Beach" and The Back Deck is the Best Sky truth spot. The old match
 * wanted whole words, one typo in a word of four, and it never looked at the
 * starter list, the saved spots or the map's cached spots at all.
 *
 *   normalise   case, apostrophes, spaces, punctuation and plurals dropped:
 *               "Chics" is "Chic's", "Backdeck" is "Back Deck"; "first" is
 *               "1st", "street" is "st", "ft" is "fort"
 *   match       a ladder, best rung wins: the whole name the same once spaces
 *               are gone (0), a prefix of it (1), within two typos of it (2),
 *               every word there or a typo away, in any order (3), the words
 *               inside the name (4)
 *   typos       Damerau-Levenshtein (a swapped pair is one), on the whole
 *               string and on each word: none under four letters, one to
 *               five, two from six
 *   order       rung, then the alias after the name, then where it came from
 *               (your own spots, our surf spots, the starter list, the map),
 *               then nearest, then name and id: the same answer every time
 *
 * Arithmetic and words only; nothing here asks the network.
 */
import { distanceMeters, type LatLon } from './geo.ts'

export type Source = 'saved' | 'spot' | 'starter' | 'osm'
/** Where a spot came from, best first: the tie-break between two equal matches. */
const SOURCE_RANK: Record<Source, number> = { saved: 0, spot: 1, starter: 2, osm: 3 }

export interface Candidate {
  id: string
  name: string
  aliases: readonly string[]
  /** "Kill Devil Hills, NC", or ''. */
  where: string
  at: LatLon
  /** "faces ESE", "pier", "your spot", or null. */
  note: string | null
  source: Source
}

export interface Found {
  candidate: Candidate
  /** Lower is better; the integer part is the rung. */
  score: number
  /** The name or alias that matched. */
  via: string
  km: number | null
}

const ORDINAL: Record<string, string> = { first: '1st', second: '2nd', third: '3rd', fourth: '4th', fifth: '5th', sixth: '6th', seventh: '7th', eighth: '8th', ninth: '9th', tenth: '10th' }
const SAME: Record<string, string> = { street: 'st', saint: 'st', ft: 'fort', mt: 'mount' }
const FILLER = new Set(['the', 'at', 'in', 'near', 'nc', 'va', 'sc', 'of'])

/** One word: no plural s (not under four letters, not "ss"), the spellings people use for the same thing joined. */
function stem(w: string): string {
  const x = ORDINAL[w] ?? SAME[w] ?? w
  return x.length > 3 && x.endsWith('s') && !x.endsWith('ss') ? x.slice(0, -1) : x
}

/** The words of a name or query as the match compares them. */
export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/['’`]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== '' && !FILLER.has(w))
    .map(stem)
}

/** Damerau-Levenshtein distance (optimal string alignment): a swapped pair is one edit. */
export function damerau(a: string, b: string): number {
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

/** Typos allowed in a string of this length. */
export const typosAllowed = (len: number): number => (len < 4 ? 0 : len < 6 ? 1 : 2)

/** How one query matches one name: a score (rung + a fraction), or null for no match. */
export function matchName(query: string, name: string): number | null {
  const qt = tokens(query)
  const nt = tokens(name)
  if (qt.length === 0 || nt.length === 0) return null
  const qc = qt.join('')
  const nc = nt.join('')
  if (qc === nc) return 0
  if (qc.length >= 3 && nc.startsWith(qc)) return 1 + (nc.length - qc.length) / 1000
  const d = damerau(qc, nc)
  if (d <= typosAllowed(Math.min(qc.length, nc.length))) return 2 + d / 10
  /* Every query word is a name word, or a typo (or, for the last word, a start) of one. */
  let sum = 0
  for (let i = 0; i < qt.length; i += 1) {
    let best = Infinity
    for (const n of nt) {
      const dw = qt[i] === n ? 0 : i === qt.length - 1 && qt[i].length >= 2 && n.startsWith(qt[i]) ? 0.5 : damerau(qt[i], n) <= typosAllowed(Math.min(qt[i].length, n.length)) ? damerau(qt[i], n) : Infinity
      if (dw < best) best = dw
    }
    if (best === Infinity) return qc.length >= 4 && nc.includes(qc) ? 4 : null
    sum += best
  }
  return 3 + sum / 10 + (nt.length - qt.length) / 1000
}

/** Our spots that match, best first, a place once (the same name within 3 km is one: the better source keeps it). */
export function findLocal(query: string, candidates: readonly Candidate[], from: LatLon | null): Found[] {
  if (tokens(query).length === 0) return []
  const found: Found[] = []
  for (const c of candidates) {
    let best: { score: number; via: string } | null = null
    for (const [i, n] of [c.name, ...c.aliases].entries()) {
      const m = matchName(query, n)
      /* A name beats an alias at the same rung, by a hair. */
      const score = m === null ? null : m + (i === 0 ? 0 : 0.0005)
      if (score !== null && (best === null || score < best.score)) best = { score, via: n }
    }
    if (best !== null) found.push({ candidate: c, score: best.score, via: best.via, km: from === null ? null : distanceMeters(from, c.at) / 1000 })
  }
  found.sort((a, b) => a.score - b.score || SOURCE_RANK[a.candidate.source] - SOURCE_RANK[b.candidate.source] || (a.km ?? Infinity) - (b.km ?? Infinity) || (a.candidate.name < b.candidate.name ? -1 : a.candidate.name > b.candidate.name ? 1 : 0) || (a.candidate.id < b.candidate.id ? -1 : 1))
  /* One place once: a name or alias in common, within 3 km (the starter list's "VB Pier" and the surf spot "Virginia Beach Pier"). */
  const keys = (c: Candidate) => new Set([c.name, ...c.aliases].map((n) => tokens(n).join('')))
  const out: Found[] = []
  for (const f of found) {
    const mine = keys(f.candidate)
    if (out.some((o) => distanceMeters(o.candidate.at, f.candidate.at) < 3000 && [...keys(o.candidate)].some((k) => mine.has(k)))) continue
    out.push(f)
  }
  return out
}
