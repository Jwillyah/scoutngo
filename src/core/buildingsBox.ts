/*
 * WHICH BUILDINGS CAST THE SHADOWS ON SCREEN (Batch TRUTH, Section 5: "lighter
 * rectangles with hard edges" at 6:59 AM at the pier). The footprints were
 * fetched for a fixed box 0.01° round the venue, about 1.1 km, so a long
 * low-sun shadow stopped dead at the box's edge, and past it nothing cast
 * one: a lighter rectangle, hard-edged. Now the box is the view and the
 * venue's own, grown by the longest shadow the map draws, so a building off
 * the screen still casts onto it; asked again only when the view leaves it.
 */
import { FADE_HEIGHTS } from './shadowFade.ts'

export interface Box {
  west: number
  south: number
  east: number
  north: number
}

/** The tallest building a shadow is drawn for, metres, times the fade: the longest shadow on the map. */
export const SHADOW_MARGIN_M = 100 * FADE_HEIGHTS
/** Grown this much more each time, so a short pan does not ask again. */
export const BOX_SLACK = 0.5
const M_PER_DEG = 111_320
/** A view wider than this, or further than this from the venue's box, is not followed (degrees, about 4 km). */
export const MAX_VIEW_DEG = 0.04

const contains = (a: Box, b: Box) => a.west <= b.west && a.east >= b.east && a.south <= b.south && a.north >= b.north

/** The box to fetch buildings for: `current` when it still covers the view and its margin, else a new one. */
export function buildingsBox(view: Box | null, venue: { lat: number; lon: number }, current: Box | null, venueSpanDeg = 0.01): Box {
  const lat = venue.lat
  const mLon = SHADOW_MARGIN_M / (M_PER_DEG * Math.cos((lat * Math.PI) / 180))
  const mLat = SHADOW_MARGIN_M / M_PER_DEG
  const own: Box = { west: venue.lon - venueSpanDeg, east: venue.lon + venueSpanDeg, south: venue.lat - venueSpanDeg, north: venue.lat + venueSpanDeg }
  /*
   * The view joins the venue's box only when it is by it; a view far off (or
   * wider than a town) is not the venue's shadows: the venue's box alone.
   * Joined across 300 km, the box asked thousands of map tiles at once
   * (the gate's locate audit hung on it).
   */
  const near = view !== null && view.east - view.west <= MAX_VIEW_DEG && view.north - view.south <= MAX_VIEW_DEG && view.west <= own.east + MAX_VIEW_DEG && view.east >= own.west - MAX_VIEW_DEG && view.south <= own.north + MAX_VIEW_DEG && view.north >= own.south - MAX_VIEW_DEG
  const base = !near || view === null ? own : { west: Math.min(own.west, view.west), east: Math.max(own.east, view.east), south: Math.min(own.south, view.south), north: Math.max(own.north, view.north) }
  const need: Box = { west: base.west - mLon, east: base.east + mLon, south: base.south - mLat, north: base.north + mLat }
  if (current !== null && contains(current, need)) return current
  const dx = (need.east - need.west) * (BOX_SLACK / 2)
  const dy = (need.north - need.south) * (BOX_SLACK / 2)
  return { west: need.west - dx, east: need.east + dx, south: need.south - dy, north: need.north + dy }
}
