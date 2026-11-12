import { useEffect, useState } from 'react'
import { distanceMeters, type LatLon } from '../core/geo.ts'
import { useCoastCams } from './coastCamsLazy.ts'
import { SURF_SPOTS } from '../data/surfSpots.ts'
import { spotBaseName } from '../core/knownSpots.ts'

/*
 * THE WATER CARD'S BEACH (Batch J, Section 7): the Water card is there
 * inland too, and names a surf beach: the nearest known one by default, or
 * the one you picked (Sandbridge, the Outer Banks…), kept on this phone
 * only. Its surf and its tide are that beach's.
 */
const KEY = 'scoutngo.surfBeach.v1'
/** A picked beach within this of the venue is the venue's own sea. */
export const SAME_BEACH_KM = 2
/*
 * Batch Map A1 (9 Nov: spot Kill Devil Hills, the menu's Water card said
 * "Virginia Beach"): a pick was kept for good, whatever the spot. A picked
 * beach now holds only while the spot is within this of it; past that the
 * spot's own nearest beach is the Water card's, the home's and the Surf
 * page's, the same one on every screen.
 */
export const PICK_HOLDS_KM = 30

export interface Beach {
  name: string
  at: LatLon
}

/** "Virginia Beach, North End" is said "Virginia Beach". */
export const beachName = (name: string): string => name.split(/[,(]/)[0].trim()

/** The nearest known beach to a place (the coast cams' beaches; the list is loaded when first asked, src/lib/coastCamsLazy.ts). */
export function nearestBeach(at: LatLon, cams: readonly { name: string; at: LatLon }[]): Beach | null {
  let best: { b: Beach; d: number } | null = null
  for (const c of cams) {
    const d = distanceMeters(at, c.at)
    if (best === null || d < best.d) best = { b: { name: beachName(c.name), at: c.at }, d }
  }
  return best?.b ?? null
}

export function readBeach(): Beach | null {
  try {
    const raw = localStorage.getItem(KEY)
    const b = raw === null ? null : (JSON.parse(raw) as Beach)
    return b !== null && typeof b.name === 'string' && typeof b.at?.lat === 'number' && typeof b.at?.lon === 'number' ? b : null
  } catch {
    return null
  }
}

export function writeBeach(b: Beach): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(b))
  } catch {
    /* storage off: the pick lasts this visit */
  }
}

/** A spot named for a known surf beach snaps to it within this (its pin can land in the town, inland). */
export const NAMED_BEACH_KM = 15

/*
 * A NAMED BEACH IS ITS OWN BEACH (Batch Flow, Section 3; field 9 Nov: the
 * spot "Sandbridge" said "Nearest surf: Virginia Beach"). A spot whose name
 * is a known surf spot's (or one of its aliases), within NAMED_BEACH_KM, is
 * on that spot's own beach, wherever its pin landed.
 */
export function namedBeach(venue: LatLon, name: string | null): Beach | null {
  if (name === null || name.trim() === '') return null
  const base = spotBaseName(name)
  for (const s of SURF_SPOTS) {
    const names = [s.name, ...s.aliases].map(spotBaseName)
    if (names.some((n) => n !== '' && (base === n || base.startsWith(`${n} `))) && distanceMeters(venue, s.at) <= NAMED_BEACH_KM * 1000) return { name: s.name, at: s.at }
  }
  return null
}

/**
 * The spot's surf beach. Every screen asks this.
 *
 *   1. the beach the spot is named for (namedBeach)
 *   2. the beach the spot is on: the nearest within SAME_BEACH_KM (Batch QA,
 *      Section 0B, field 10 Nov: the spot Virginia Beach Fishing Pier, on the
 *      pier's own beach, said "Nearest surf: Virginia Beach · 3 mi", a pick
 *      of North End made elsewhere holding over it)
 *   3. the one picked, when it is within PICK_HOLDS_KM
 *   4. the nearest
 */
export function beachFor(venue: LatLon | null, picked: Beach | null, name: string | null, cams: readonly { name: string; at: LatLon }[] | null): Beach | null {
  if (venue === null) return null
  const named = namedBeach(venue, name)
  if (named !== null) return named
  /* Until the cams' list has loaded, nothing is said rather than a guess (a moment after the first paint). */
  if (cams === null) return null
  const near = nearestBeach(venue, cams)
  if (near !== null && sameBeach(venue, near)) return near
  if (picked !== null && distanceMeters(venue, picked.at) <= PICK_HOLDS_KM * 1000) return picked
  return near
}

const told = new Set<() => void>()

/** The spot's surf beach (beachFor), and the pick; a pick on one screen reaches every screen showing one. */
export function useSurfBeach(venue: LatLon | null, name: string | null = null): [Beach | null, (b: Beach) => void] {
  const [picked, setPicked] = useState<Beach | null>(() => readBeach())
  const cams = useCoastCams()
  useEffect(() => {
    const f = () => setPicked(readBeach())
    told.add(f)
    return () => {
      told.delete(f)
    }
  }, [])
  return [
    beachFor(venue, picked, name, cams),
    (b) => {
      writeBeach(b)
      setPicked(b)
      for (const f of told) f()
    },
  ]
}

export const sameBeach = (venue: LatLon | null, b: Beach | null): boolean => venue !== null && b !== null && distanceMeters(venue, b.at) <= SAME_BEACH_KM * 1000

/**
 * Whether the spot's surf beach is somewhere else, for "Nearest surf: …".
 * A spot named for the beach is on it, however far its pin is from the
 * beach's own point (Batch QA, Section 0B, field 10 Nov: the spot "Virginia
 * Beach Fishing Pier" said "Nearest surf: Virginia Beach · 3 mi").
 */
export function awayFrom(venue: LatLon | null, beach: Beach | null, spotName: string | null): boolean {
  if (venue === null || beach === null || sameBeach(venue, beach)) return false
  return namedBeach(venue, spotName)?.name !== beach.name
}
