/*
 * THE SKY PICTURE (Batch SIMPLE-2, Section 4; mockup Sky_Tonight): the
 * Tonight and Sunrise tabs' drawing, from the computed state only. No photo,
 * no generated image: a horizon, the compass points along it, the sun where
 * it sets or rises, the deck at its height, and the gap under it toward the
 * sun when the call found one. This file is the arithmetic (state to
 * geometry, 0..1 across and down); src/components/SkyPicture.tsx draws it.
 *
 * THE STATE, all of it already computed elsewhere:
 *
 *   sun     the sun's azimuth and height at the event (suncalc)
 *   deck    the deck the call speaks for: the station's fresh report when it
 *           has one under 20,000 ft, else the models' lead layer when it is
 *           cloud to light (src/core/fireOutlook.ts leadLayer); its base in
 *           feet and whether the models light it
 *   gap     the lead layer's gap toward the sun (open / partial / closed),
 *           or null when the models did not read one
 *
 * Nothing is drawn that the state does not say: no deck with no deck, no gap
 * box with no gap read, no picture at all with no sun azimuth.
 */
import { compassPoint } from './field.ts'
import { normalizeBearing } from './sun.ts'
import { SIDE_TOP_M } from './skyPage.ts'

/** The picture spans this far either side of the sun's azimuth (S to NW for a WSW sunset). */
export const PICTURE_HALF_SPAN_DEG = 67.5
/** Where the horizon sits, a share of the height from the top. */
export const PICTURE_HORIZON_Y = 0.82
/** The highest a deck is drawn (SIDE_TOP_M and above). */
export const PICTURE_TOP_Y = 0.1
/** The gap box's width, a share of the picture, for an open and a partly open gap. */
export const GAP_WIDTH = { open: 0.22, partial: 0.12 } as const

export interface SkyPictureIn {
  sunAzDeg: number | null
  sunAltDeg: number | null
  deck: { baseFt: number; lit: boolean; by: string | null } | null
  gap: 'open' | 'partial' | 'closed' | null
}

export interface SkyPictureOut {
  /** Azimuths at the left and right edges. */
  fromDeg: number
  toDeg: number
  horizonY: number
  ticks: { x: number; label: string }[]
  sun: { x: number; y: number; label: string }
  deck: { y: number; lit: boolean; label: string } | null
  gap: { x: number; w: number; top: number; label: string } | null
}

const FT_PER_M = 3.28084

/** A deck's base in feet as a height on the picture: a square root, as the side view (src/core/skyPage.ts sideView), so a low deck is not squashed on the sea. */
export function deckY(baseFt: number): number {
  const m = Math.max(0, Math.min(SIDE_TOP_M, baseFt / FT_PER_M))
  return PICTURE_HORIZON_Y - (PICTURE_HORIZON_Y - PICTURE_TOP_Y) * Math.sqrt(m / SIDE_TOP_M)
}

/** Where an azimuth falls across the picture centred on `centreDeg`, 0..1 (outside the span: outside 0..1). */
export function azToX(az: number, centreDeg: number): number {
  const off = ((normalizeBearing(az - centreDeg) + 180) % 360) - 180
  return 0.5 + off / (2 * PICTURE_HALF_SPAN_DEG)
}

const POINTS8 = [0, 45, 90, 135, 180, 225, 270, 315]

export function skyPicture(s: SkyPictureIn): SkyPictureOut | null {
  if (s.sunAzDeg === null || !Number.isFinite(s.sunAzDeg)) return null
  const centre = normalizeBearing(s.sunAzDeg)
  const fromDeg = normalizeBearing(centre - PICTURE_HALF_SPAN_DEG)
  const toDeg = normalizeBearing(centre + PICTURE_HALF_SPAN_DEG)
  /* The eight points inside the span, and the sun's own point under it. */
  const ticks = POINTS8.map((deg) => ({ x: azToX(deg, centre), label: compassPoint(deg) }))
    .filter((t) => t.x >= 0 && t.x <= 1)
    .concat([{ x: 0.5, label: compassPoint(centre) }])
    .filter((t, i, all) => all.findIndex((u) => u.label === t.label) === i && (t.x === 0.5 || Math.abs(t.x - 0.5) > 0.12))
    .sort((a, b) => a.x - b.x)
  /* The sun on the horizon at the event (it is at about -0.8° then), a little above it when higher. */
  const alt = s.sunAltDeg !== null && Number.isFinite(s.sunAltDeg) ? s.sunAltDeg : 0
  const sun = { x: 0.5, y: Math.max(0.5, Math.min(PICTURE_HORIZON_Y, PICTURE_HORIZON_Y - Math.max(0, alt) * 0.02)), label: compassPoint(centre) }
  const deck = s.deck === null ? null : { y: deckY(s.deck.baseFt), lit: s.deck.lit, label: `${s.deck.by === null ? '' : `${s.deck.by} `}deck ${(Math.round(s.deck.baseFt / 100) * 100).toLocaleString('en-US')} ft${s.deck.lit ? ' · lit from below' : ' · not lit'}` }
  /* The gap: a window under the deck toward the sun, as wide as it is open. Closed or not read: no window. */
  const gap =
    deck === null || s.gap === null || s.gap === 'closed'
      ? null
      : { x: 0.5 - GAP_WIDTH[s.gap] / 2, w: GAP_WIDTH[s.gap], top: Math.min(deck.y + 0.05, PICTURE_HORIZON_Y - 0.06), label: `${s.gap === 'open' ? 'gap' : 'part gap'} ${sun.label}` }
  return { fromDeg, toDeg, horizonY: PICTURE_HORIZON_Y, ticks, sun, deck, gap }
}
