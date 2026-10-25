/*
 * THE BAKED RESTRICTIONS, LOADED ONLY WHEN ASKED FOR.
 *
 * The same pattern as src/lib/airspace.ts: 1.6 MB of shapes for the whole
 * country (src/data/restrictions.ts) is a separate chunk, imported the first
 * time something needs it and decoded once per session. The in-flight promise
 * is shared so two callers do not decode twice.
 */
import {
  decodeParkUnit,
  decodeSpecialUse,
  type ParkUnit,
  type SpecialUseArea,
} from '../core/restrictions.ts'

export interface Restrictions {
  specialUse: SpecialUseArea[]
  parks: ParkUnit[]
  bakedAt: string
}

let loading: Promise<Restrictions> | null = null

export function restrictions(): Promise<Restrictions> {
  loading ??= import('../data/restrictions.ts').then((mod) => ({
    specialUse: mod.SPECIAL_USE.map((s) => decodeSpecialUse(s, mod.RESTRICTIONS_COORD_PRECISION)).filter(
      (s): s is SpecialUseArea => s !== null,
    ),
    parks: mod.PARK_UNITS.map((p) => decodeParkUnit(p, mod.RESTRICTIONS_COORD_PRECISION)),
    bakedAt: mod.RESTRICTIONS_BAKED_AT,
  }))
  return loading
}
