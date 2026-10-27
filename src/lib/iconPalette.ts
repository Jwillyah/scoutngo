/*
 * THE GOLDEN BUBBLE TILES: one gradient per icon, in sunset order. The side
 * menu runs gold to night blue, the dock carries on into blue hour.
 *
 * ONE SOURCE. The stops are the design's (design/icons-golden-bubble.html),
 * copied once, here. The middle stop the app paints is DERIVED from them by
 * shippedTile(): a white glyph must reach 3:1 against the middle of its tile,
 * and a tile that does not is walked toward its own dark stop until it does.
 * The table of what changed is measurements/2026-10-26-icon-contrast.md,
 * written by scripts/measure-icon-contrast.mjs from this file.
 *
 * Colour lives in icons, the time bar and the home page. None of these is a
 * data colour: a tile is decoration on a control, and nothing on the map is
 * painted with it.
 */
import { contrastRatio, deepenFor } from '../core/contrast.ts'

export type IconId =
  | 'plan'
  | 'sky'
  | 'exposure'
  | 'kit'
  | 'saved'
  | 'viewfinder'
  | 'callsheet'
  | 'settings'
  | 'about'
  | 'sunmoon'
  | 'calendar'
  | 'lens'
  | 'layers'
  | 'now'
  | 'app'
  | 'offline'
  /* The layer tiles (src/components/tileArt.tsx). Cones borrow 'lens'. */
  | 'satellite'
  | 'terrain'
  | 'sunArc'
  | 'shadows'
  | 'cloud'
  | 'hazards'
  | 'buildings'
  | 'labels'
  | 'airspace'
  /* Tools in Layers: the two-pin measure. */
  | 'measure'

export interface TileStops {
  /** Top left, the light end. */
  light: string
  middle: string
  /** Bottom right, also the colour of the glyph's cut-outs. */
  dark: string
}

/** As designed. Never painted directly: see shippedTile. */
export const DESIGN_TILES: Readonly<Record<IconId, TileStops>> = {
  plan: { light: '#ffe58a', middle: '#f5b021', dark: '#a86a05' },
  sky: { light: '#ffcb8a', middle: '#f68b2e', dark: '#a9460c' },
  /* Golden, between Plan's gold and Sky's orange: its own item since 27 Oct. */
  exposure: { light: '#ffd98a', middle: '#f0a020', dark: '#9a5806' },
  kit: { light: '#ffb496', middle: '#ee6b43', dark: '#9a3518' },
  saved: { light: '#ffb0cc', middle: '#e5559a', dark: '#8d1f5a' },
  viewfinder: { light: '#efb2f5', middle: '#b952d2', dark: '#5e1e79' },
  callsheet: { light: '#c9b5ff', middle: '#8063ee', dark: '#3b2399' },
  settings: { light: '#a9bbff', middle: '#5270df', dark: '#1f2f86' },
  about: { light: '#9ad0ff', middle: '#2f86d6', dark: '#0f3f7a' },
  sunmoon: { light: '#8fe6f4', middle: '#22aacb', dark: '#0a4c66' },
  calendar: { light: '#8cf0da', middle: '#17b59c', dark: '#06574a' },
  lens: { light: '#86dbf0', middle: '#198cba', dark: '#073e5c' },
  layers: { light: '#9bc0ff', middle: '#4473db', dark: '#152e76' },
  now: { light: '#b6aeff', middle: '#5e51dc', dark: '#231a7d' },
  /* The app icon: gold to orange to plum (design/home-golden.html). */
  app: { light: '#ffe58a', middle: '#f68b2e', dark: '#8d1f5a' },
  /* Works offline, on the home page: the Settings blue in the design. */
  offline: { light: '#a9bbff', middle: '#5270df', dark: '#1f2f86' },
  /*
   * THE LAYER TILES, in the same family. Most borrow a stop set already in
   * the design so the sheet reads as part of the menu and the dock; the
   * cone tile is the dock's lens, so the one layer has one colour. None is
   * the hazard red: the hazards tile is the Sky orange, a warning sign and
   * not a reading.
   */
  satellite: { light: '#9ad0ff', middle: '#2f86d6', dark: '#0f3f7a' },
  terrain: { light: '#8cf0da', middle: '#17b59c', dark: '#06574a' },
  sunArc: { light: '#ffe58a', middle: '#f5b021', dark: '#a86a05' },
  shadows: { light: '#a9bbff', middle: '#5270df', dark: '#1f2f86' },
  cloud: { light: '#c6d4e6', middle: '#6f86a6', dark: '#2c3c55' },
  hazards: { light: '#ffcb8a', middle: '#f68b2e', dark: '#a9460c' },
  buildings: { light: '#c9b5ff', middle: '#8063ee', dark: '#3b2399' },
  labels: { light: '#ffb0cc', middle: '#e5559a', dark: '#8d1f5a' },
  airspace: { light: '#efb2f5', middle: '#b952d2', dark: '#5e1e79' },
  measure: { light: '#8fe6f4', middle: '#22aacb', dark: '#0a4c66' },
}

export const GLYPH_INK = '#ffffff'
export const GLYPH_MIN_CONTRAST = 3

/** The stops the app paints: the design's, with the middle deepened only where white needs it. */
export function shippedTile(id: IconId): TileStops {
  const t = DESIGN_TILES[id]
  return { ...t, middle: deepenFor(GLYPH_INK, t.middle, t.dark, GLYPH_MIN_CONTRAST) }
}

export interface TileContrast {
  id: IconId
  designMiddle: string
  designRatio: number
  shippedMiddle: string
  shippedRatio: number
  deepened: boolean
}

export function tileContrast(id: IconId): TileContrast {
  const design = DESIGN_TILES[id].middle
  const shipped = shippedTile(id).middle
  return {
    id,
    designMiddle: design,
    designRatio: contrastRatio(GLYPH_INK, design),
    shippedMiddle: shipped,
    shippedRatio: contrastRatio(GLYPH_INK, shipped),
    deepened: shipped !== design,
  }
}

export const ICON_IDS = Object.keys(DESIGN_TILES) as IconId[]
