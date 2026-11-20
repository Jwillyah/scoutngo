/*
 * WHAT YOU DO OUTSIDE, ONE ANSWER (Batch SIMPLE-2, Section 2). The first
 * run asks "What do you do outside?" and one tap picks: Surf, Shoot, Fish,
 * Drone or Just weather. It orders the home's tiles and decides which moment
 * gets the top card (src/core/homeTiles.ts). Kept on this phone only
 * (localStorage), never sent; changed in Settings.
 *
 * THE ONE SOURCE. Batch M's picker kept a list of activities
 * (scoutngo.activities.v1). That list is read once, here, as a migration: a
 * phone that picked before keeps its first pick as its persona (the home
 * already led with it), and the list is not written again. src/lib/activities.ts
 * answers from this store, so every screen that asked "what was picked?"
 * reads the persona.
 *
 * Not yet answered (null): the Surf order (board Home_P_Surf), and the
 * question is asked again the next time a spot is picked.
 */
import { useCallback, useSyncExternalStore } from 'react'
import { ACTIVITIES, type Activity } from '../core/homeDay.ts'

export type Persona = Activity
export const PERSONAS: readonly Persona[] = ['surf', 'shoot', 'fish', 'drone', 'weather']

export const PERSONA_KEY = 'scoutngo.persona.v1'
/** Batch M's list, read for the migration only. */
export const LEGACY_ACTIVITIES_KEY = 'scoutngo.activities.v1'

const listeners = new Set<() => void>()
let memory: Persona | null | undefined

/** A stored persona, or null for anything else. */
export function revivePersona(raw: string | null): Persona | null {
  if (raw === null) return null
  const v = raw.trim().replace(/^"|"$/g, '')
  return (PERSONAS as readonly string[]).includes(v) ? (v as Persona) : null
}

/** Batch M's list, its first pick: the activity the old home led with. */
export function personaFromLegacy(raw: string | null): Persona | null {
  if (raw === null) return null
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return null
    const first = v.find((x): x is Activity => ACTIVITIES.includes(x as Activity))
    return first ?? null
  } catch {
    return null
  }
}

/** The persona on this phone: the stored one, else Batch M's first pick, else null (never asked). */
export function readPersona(): Persona | null {
  if (memory !== undefined) return memory
  try {
    const own = revivePersona(localStorage.getItem(PERSONA_KEY))
    if (own !== null) return own
    return personaFromLegacy(localStorage.getItem(LEGACY_ACTIVITIES_KEY))
  } catch {
    return null
  }
}

export function writePersona(p: Persona): void {
  try {
    localStorage.setItem(PERSONA_KEY, p)
    memory = undefined
  } catch {
    /* Private browsing: this session still has it. */
    memory = p
  }
  for (const f of [...listeners]) f()
}

export function subscribePersona(f: () => void): () => void {
  listeners.add(f)
  return () => listeners.delete(f)
}

export function usePersona(): [Persona | null, (next: Persona) => void] {
  const value = useSyncExternalStore(subscribePersona, readPersona, () => null)
  return [value, useCallback((next: Persona) => writePersona(next), [])]
}

/** The picker's words: the persona's name (board Home_P_*). */
export const PERSONA_WORDS: Record<Persona, string> = {
  surf: 'Surf',
  shoot: 'Shoot',
  fish: 'Fish',
  drone: 'Drone',
  weather: 'Just weather',
}

/** The line under each choice. */
export const PERSONA_LINES: Record<Persona, string> = {
  surf: 'waves, wind, tide, cams',
  shoot: 'sunset color, light, viewfinder',
  fish: 'tide turns, calm water, the moon',
  drone: 'wind at 400 ft, airspace',
  weather: 'today, the hours, radar',
}

/** The home's pill ("Surf first"; drawn in capitals by the stylesheet). */
export const PERSONA_PILL: Record<Persona, string> = {
  surf: 'Surf first',
  shoot: 'Shoot first',
  fish: 'Fish first',
  drone: 'Drone first',
  weather: 'Weather first',
}
