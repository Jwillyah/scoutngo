/*
 * BRIDGES AND PIERS AS DECKS ON PILINGS, FOR THE 3D VIEW (Batch I, Section 6).
 *
 * The 3D ground is the elevation draped with the photo: a bridge or a pier
 * was a picture on the water, and the sea surface ran through it. OSM knows
 * them (OpenMapTiles transportation: brunnel=bridge, class=pier), so each
 * becomes a deck at its height on pilings. Arithmetic only; the meshes are
 * src/three/world/decks.ts.
 *
 *   width     by the way's class (DECK_WIDTH_M); a pier mapped as a line
 *             PIER_LINE_M; a pier mapped as an area, its own outline
 *   height    a pier's deck PIER_DECK_M above the sea. A bridge's deck a
 *             little over the ground at its two ends (ABUT_M), and
 *             LAYER_M higher for each OSM layer (layer=1 is one level up):
 *             the abutments are where the road meets the land
 *   pilings   every PILE_EVERY_M along the deck, wherever it stands more
 *             than PILE_MIN_M over the ground under it (over water: always)
 *
 * Heights are a picture of where the deck is, not a survey: the map gives
 * a layer, not a clearance. The Lesner Bridge's real deck is higher than
 * one layer reads.
 */
export const DECK_WIDTH_M: Record<string, number> = {
  motorway: 22,
  trunk: 22,
  primary: 16,
  secondary: 12,
  tertiary: 12,
  minor: 8,
  service: 6,
  track: 4,
  path: 4,
  rail: 6,
  transit: 6,
}
export const PIER_LINE_M = 6
export const PIER_DECK_M = 5
export const ABUT_M = 1.5
export const LAYER_M = 4.5
export const DECK_THICK_M = 1
export const PILE_EVERY_M = 20
export const PILE_MIN_M = 2

export interface DeckLine {
  kind: 'bridge' | 'pier'
  cls: string
  layer: number
  /** Scene metres: x east, z south. */
  points: { x: number; z: number }[]
}

export interface DeckSegment {
  a: { x: number; z: number }
  b: { x: number; z: number }
  width: number
  /** Top of the deck at each end, metres. */
  topA: number
  topB: number
}

/** A bridge's deck from the ground at its two ends; a pier's from the sea. */
export function deckTops(line: DeckLine, groundA: number, groundB: number): [number, number] {
  if (line.kind === 'pier') return [PIER_DECK_M, PIER_DECK_M]
  const lift = ABUT_M + LAYER_M * Math.max(1, line.layer)
  const base = Math.max(groundA, groundB, 0)
  return [base + lift, base + lift]
}

export function segmentsOf(line: DeckLine, groundA: number, groundB: number): DeckSegment[] {
  const width = line.kind === 'pier' ? PIER_LINE_M : (DECK_WIDTH_M[line.cls] ?? 8)
  const [topA, topB] = deckTops(line, groundA, groundB)
  const out: DeckSegment[] = []
  const total = line.points.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - line.points[i].x, p.z - line.points[i].z), 0)
  let run = 0
  for (let i = 1; i < line.points.length; i += 1) {
    const a = line.points[i - 1]
    const b = line.points[i]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    if (len < 0.5) continue
    const t0 = total === 0 ? 0 : run / total
    run += len
    const t1 = total === 0 ? 1 : run / total
    out.push({ a, b, width, topA: topA + (topB - topA) * t0, topB: topA + (topB - topA) * t1 })
  }
  return out
}

/** Where the pilings stand along a deck: every PILE_EVERY_M where it is PILE_MIN_M or more over the ground. */
export function pilings(segs: readonly DeckSegment[], groundAt: (x: number, z: number) => number): { x: number; z: number; top: number; bottom: number }[] {
  const out: { x: number; z: number; top: number; bottom: number }[] = []
  let carry = PILE_EVERY_M / 2
  for (const s of segs) {
    const len = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z)
    for (let d = carry; d < len; d += PILE_EVERY_M) {
      const t = d / len
      const x = s.a.x + (s.b.x - s.a.x) * t
      const z = s.a.z + (s.b.z - s.a.z) * t
      const top = s.topA + (s.topB - s.topA) * t - DECK_THICK_M
      const g = groundAt(x, z)
      if (top - g >= PILE_MIN_M) out.push({ x, z, top, bottom: g - 1 })
    }
    carry = (carry - len) % PILE_EVERY_M
    if (carry < 0) carry += PILE_EVERY_M
  }
  return out
}

/** The ways that are decks in one tile's transportation layer, by their tags. */
export function isDeck(props: Record<string, unknown>): { kind: 'bridge' | 'pier'; cls: string; layer: number } | null {
  const cls = typeof props.class === 'string' ? props.class : ''
  if (cls === 'pier') return { kind: 'pier', cls, layer: 0 }
  if (props.brunnel === 'bridge') return { kind: 'bridge', cls, layer: typeof props.layer === 'number' ? props.layer : 1 }
  return null
}
