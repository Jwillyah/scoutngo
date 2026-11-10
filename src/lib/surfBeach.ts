import { useEffect, useState } from 'react'
import { distanceMeters, type LatLon } from '../core/geo.ts'
import { COAST_CAMS } from '../data/coastCams.ts'
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

/** The nearest known beach to a place (the coast cams' beaches). */
export function nearestBeach(at: LatLon): Beach | null {
  let best: { b: Beach; d: number } | null = null
  for (const c of COAST_CAMS) {
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

/** The spot's surf beach: the one picked when it is near this spot, else the beach the spot is named for, else the nearest. Every screen asks this. */
export function beachFor(venue: LatLon | null, picked: Beach | null, name: string | null = null): Beach | null {
  if (venue === null) return null
  if (picked !== null && distanceMeters(venue, picked.at) <= PICK_HOLDS_KM * 1000) return picked
  return namedBeach(venue, name) ?? nearestBeach(venue)
}

const told = new Set<() => void>()

/** The spot's surf beach (beachFor), and the pick; a pick on one screen reaches every screen showing one. */
export function useSurfBeach(venue: LatLon | null, name: string | null = null): [Beach | null, (b: Beach) => void] {
  const [picked, setPicked] = useState<Beach | null>(() => readBeach())
  useEffect(() => {
    const f = () => setPicked(readBeach())
    told.add(f)
    return () => {
      told.delete(f)
    }
  }, [])
  return [
    beachFor(venue, picked, name),
    (b) => {
      writeBeach(b)
      setPicked(b)
      for (const f of told) f()
    },
  ]
}

export const sameBeach = (venue: LatLon | null, b: Beach | null): boolean => venue !== null && b !== null && distanceMeters(venue, b.at) <= SAME_BEACH_KM * 1000
