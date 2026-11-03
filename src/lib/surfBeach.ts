import { useState } from 'react'
import { distanceMeters, type LatLon } from '../core/geo.ts'
import { COAST_CAMS } from '../data/coastCams.ts'

/*
 * THE WATER CARD'S BEACH (Batch J, Section 7): the Water card is there
 * inland too, and names a surf beach: the nearest known one by default, or
 * the one you picked (Sandbridge, the Outer Banks…), kept on this phone
 * only. Its surf and its tide are that beach's.
 */
const KEY = 'scoutngo.surfBeach.v1'
/** A picked beach within this of the venue is the venue's own sea. */
export const SAME_BEACH_KM = 2

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

/** The beach for the Water card: the one picked, else the nearest to the venue. */
export function useSurfBeach(venue: LatLon | null): [Beach | null, (b: Beach) => void] {
  const [picked, setPicked] = useState<Beach | null>(() => readBeach())
  const beach = picked ?? (venue === null ? null : nearestBeach(venue))
  return [
    beach,
    (b) => {
      writeBeach(b)
      setPicked(b)
    },
  ]
}

export const sameBeach = (venue: LatLon | null, b: Beach | null): boolean => venue !== null && b !== null && distanceMeters(venue, b.at) <= SAME_BEACH_KM * 1000
