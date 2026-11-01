import { useEffect, useState } from 'react'
import { SPECIAL_NAME, type SpecialKind } from '../core/specialLight.ts'
import { SURF_COAST_M } from './surfSetting.ts'

/*
 * COAST OR INLAND, AND WHAT EACH ONE SHOWS (field test, 30 Oct).
 *
 * The place decides: a venue within SURF_COAST_M (about 2 km) of the sea or a
 * big lake is the coast, and the menu's water item is Water (Surf · Tides ·
 * Wind). Anywhere else it is Land (Wind · Terrain light), and nothing about
 * surf or tide shows. Settings can override each group: Auto (the place
 * decides), Always, or Off. Kept on this phone.
 *
 * Special light follows the same rule: glassy water only at the coast,
 * valley fog only inland (src/components/SpecialLight.tsx).
 */
export type GroupSetting = 'auto' | 'always' | 'off'
export interface PlaceGroups {
  water: GroupSetting
  land: GroupSetting
}
export const GROUP_OPTIONS: readonly { id: GroupSetting; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'always', label: 'Always' },
  { id: 'off', label: 'Off' },
]
const KEY = 'scoutngo.placeGroups.v1'
const EVENT = 'scoutngo:placeGroups'
const DEFAULT: PlaceGroups = { water: 'auto', land: 'auto' }

const one = (v: unknown): GroupSetting => (v === 'always' || v === 'off' ? v : 'auto')

export function readPlaceGroups(): PlaceGroups {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<PlaceGroups>
    return { water: one(v.water), land: one(v.land) }
  } catch {
    return DEFAULT
  }
}

export function writePlaceGroups(next: PlaceGroups): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* Not kept; this session still follows it. */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }))
}

export function usePlaceGroups(): [PlaceGroups, (next: PlaceGroups) => void] {
  const [value, setValue] = useState<PlaceGroups>(readPlaceGroups)
  useEffect(() => {
    const on = (e: Event) => setValue((e as CustomEvent<PlaceGroups>).detail)
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  return [value, writePlaceGroups]
}

/**
 * Coast, inland, or not known yet. `metresToSea` is null when no sea is
 * within reach (or the tiles that would say could not be had), and
 * `undefined` while it has not been asked.
 */
export type Place = 'coast' | 'inland' | 'unknown'
export const placeOf = (metresToSea: number | null | undefined): Place =>
  metresToSea === undefined ? 'unknown' : metresToSea !== null && metresToSea <= SURF_COAST_M ? 'coast' : 'inland'

/** Which of Water and Land to offer. Not known yet: neither, rather than the wrong one. */
export function shownGroups(groups: PlaceGroups, place: Place): { water: boolean; land: boolean } {
  return {
    water: groups.water === 'always' || (groups.water === 'auto' && place === 'coast'),
    land: groups.land === 'always' || (groups.land === 'auto' && place === 'inland'),
  }
}

/** The name a special-light window goes by here: inland, fog is valley fog. */
export const specialName = (kind: SpecialKind, place: Place | undefined): string => (kind === 'fog' && place === 'inland' ? 'Valley fog' : SPECIAL_NAME[kind])
