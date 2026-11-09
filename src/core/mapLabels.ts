/*
 * THE MAP'S OWN LABELS (Batch Map, Section 3; board StyleGuide: "Map
 * labels: Archivo, white, soft shadow"). 9 Nov: Esri's reference overlay
 * mixed fonts, put water names in blue italics and drew route shields.
 * These are OpenFreeMap's names (OpenStreetMap), chosen here and drawn by
 * src/components/MapLabels.tsx in the app's font:
 *
 *   towns     sized by importance: city, town, village, then hamlets and
 *             suburbs, and within a class by OpenMapTiles' rank
 *   water     named seas, sounds, bays and lakes, light and upright
 *   roads     none below zoom 13; only major roads (motorway, trunk,
 *             primary) until 15
 *   at most   MAX_LABELS on screen, the most important first, none touching
 *             another, none under the crosshair or the spot's pin
 */
export const MAX_LABELS = 12
export const KEEP_CLEAR_PX = 34

export type LabelKind = 'city' | 'town' | 'village' | 'small' | 'water' | 'road'

export interface LabelCandidate {
  name: string
  kind: LabelKind
  /** OpenMapTiles' rank: smaller is more important; null when not given. */
  rank: number | null
  lat: number
  lon: number
  /** A road's class (motorway, trunk, primary, secondary...). */
  roadClass?: string
}

export interface PlacedLabel extends LabelCandidate {
  x: number
  y: number
  size: number
}

const ORDER: Record<LabelKind, number> = { city: 0, town: 1, water: 2, village: 3, road: 4, small: 5 }
export const SIZE: Record<LabelKind, number> = { city: 19, town: 16, water: 14, village: 14, road: 12, small: 12 }

/** OpenMapTiles' place class as a label kind; null for what is not labelled (countries, states, continents). */
export function placeKind(cls: string): LabelKind | null {
  if (cls === 'city') return 'city'
  if (cls === 'town') return 'town'
  if (cls === 'village') return 'village'
  if (cls === 'hamlet' || cls === 'suburb' || cls === 'neighbourhood' || cls === 'quarter' || cls === 'locality' || cls === 'island' || cls === 'isolated_dwelling') return 'small'
  return null
}

const MAJOR = new Set(['motorway', 'trunk', 'primary'])

/** Whether a candidate is shown at all at this zoom. */
export function shownAt(c: LabelCandidate, zoom: number): boolean {
  if (c.kind === 'road') return zoom >= 15 || (zoom >= 13 && MAJOR.has(c.roadClass ?? ''))
  if (c.kind === 'small') return zoom >= 12
  if (c.kind === 'village') return zoom >= 10
  return true
}

/** Roughly the box a label takes: Archivo is about 0.56 em a letter. */
export const labelBox = (name: string, size: number) => ({ w: name.length * size * 0.56 + 6, h: size * 1.3 })

/**
 * The labels to draw: the most important first, at most MAX_LABELS, none
 * overlapping another or the keep-clear points (the crosshair, the pin),
 * all inside the screen. `project` turns a place into screen pixels.
 */
export function chooseLabels(cands: readonly LabelCandidate[], zoom: number, project: (lat: number, lon: number) => { x: number; y: number }, width: number, height: number, keepClear: readonly { x: number; y: number }[], max = MAX_LABELS): PlacedLabel[] {
  const seen = new Set<string>()
  const sorted = cands
    .filter((c) => c.name.trim() !== '' && shownAt(c, zoom))
    .sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || (a.rank ?? 99) - (b.rank ?? 99) || a.name.localeCompare(b.name))
  const out: PlacedLabel[] = []
  const boxes: { l: number; t: number; r: number; b: number }[] = keepClear.map((p) => ({ l: p.x - KEEP_CLEAR_PX, t: p.y - KEEP_CLEAR_PX, r: p.x + KEEP_CLEAR_PX, b: p.y + KEEP_CLEAR_PX }))
  for (const c of sorted) {
    if (out.length >= max) break
    if (seen.has(`${c.kind}|${c.name}`)) continue
    const at = project(c.lat, c.lon)
    const size = SIZE[c.kind]
    const { w, h } = labelBox(c.name, size)
    /* On its point; or, when the pin or the crosshair is there, just above or below it (the spot's own town still named). */
    const lift = KEEP_CLEAR_PX + h / 2 + 2
    const tries = [at, { x: at.x, y: at.y - lift }, { x: at.x, y: at.y + lift }]
    const fits = (p: { x: number; y: number }) => {
      const box = { l: p.x - w / 2, t: p.y - h / 2, r: p.x + w / 2, b: p.y + h / 2 }
      if (box.l < 4 || box.t < 4 || box.r > width - 4 || box.b > height - 4) return null
      return boxes.some((o) => box.l < o.r && o.l < box.r && box.t < o.b && o.t < box.b) ? null : box
    }
    const near = keepClear.some((k) => Math.abs(k.x - at.x) < KEEP_CLEAR_PX + w / 2 && Math.abs(k.y - at.y) < KEEP_CLEAR_PX + h / 2)
    const p = (near ? tries : [at]).find((t) => fits(t) !== null)
    if (p === undefined) continue
    boxes.push(fits(p) as { l: number; t: number; r: number; b: number })
    seen.add(`${c.kind}|${c.name}`)
    out.push({ ...c, x: p.x, y: p.y, size })
  }
  return out
}
