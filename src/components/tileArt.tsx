import { Icon, type GlyphId } from './Icon.tsx'

/*
 * THE LAYER TILES: ONE BOLD SYMBOL EACH, ON A BUBBLE.
 *
 * WHAT THIS REPLACED, TWICE. First a small painted scene per tile, which read
 * as shapes that looked alike at phone size. Then a flat white symbol on a
 * dark ground, which read but sat apart from the menu and the dock. Now every
 * tile is the same golden bubble the menu and the dock use (Icon.tsx), with
 * one heavy white symbol on it: you find the one you want by its silhouette
 * and its colour, and the sheet looks like the rest of the app.
 *
 * THE BUBBLE IS DECORATION, NOT THE STATE. Its colours come from
 * src/lib/iconPalette.ts and none of them is a role colour; on and off are
 * the tile's own border and ground (app.css .tile__art), as before.
 *
 * THE CONE TILE IS THE DOCK'S LENS GLYPH, the camera view cone, so the one
 * layer is drawn one way wherever it is switched.
 */

const TILE_BUBBLE = 44

const bubble = (glyph: GlyphId) => <Icon glyph={glyph} size={TILE_BUBBLE} className="tile__bubble" />

export const TILE_ART = {
  satellite: bubble('satellite'),
  terrain: bubble('terrain'),
  cones: bubble('lens'),
  sunArc: bubble('sunArc'),
  shadows: bubble('shadows'),
  cloud: bubble('cloud'),
  hazards: bubble('hazards'),
  buildings: bubble('buildings'),
  labels: bubble('labels'),
  airspace: bubble('airspace'),
  measure: bubble('measure'),
  preflight: bubble('preflight'),
  skyline: bubble('skyline'),
  lightmap: bubble('lightmap'),
}
