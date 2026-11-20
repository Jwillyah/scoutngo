/*
 * THE BAKED RESTRICTIONS, LOADED ONLY WHEN ASKED FOR.
 *
 * The same pattern as src/lib/airspace.ts: 1.6 MB of shapes for the whole
 * country (src/data/restrictions.ts) is a separate chunk, imported the first
 * time something needs it and decoded once per session. The in-flight promise
 * is shared so two callers do not decode twice.
 *
 * Batch SIMPLE-1, Section 3: the National Wildlife Refuges come with them, a
 * chunk of their own (src/data/refuges.ts, scripts/bake-refuges.mjs), loaded
 * alongside, so every caller that holds the parks holds the refuges too.
 */
import {
  decodeParkUnit,
  decodeRefuge,
  decodeSpecialUse,
  type ParkUnit,
  type RefugeUnit,
  type SpecialUseArea,
} from '../core/restrictions.ts'

export interface Restrictions {
  specialUse: SpecialUseArea[]
  parks: ParkUnit[]
  refuges: RefugeUnit[]
  bakedAt: string
  refugesBakedAt: string
}

let loading: Promise<Restrictions> | null = null

export function restrictions(): Promise<Restrictions> {
  loading ??= Promise.all([import('../data/restrictions.ts'), import('../data/refuges.ts')]).then(([mod, fws]) => ({
    specialUse: mod.SPECIAL_USE.map((s) => decodeSpecialUse(s, mod.RESTRICTIONS_COORD_PRECISION)).filter(
      (s): s is SpecialUseArea => s !== null,
    ),
    parks: mod.PARK_UNITS.map((p) => decodeParkUnit(p, mod.RESTRICTIONS_COORD_PRECISION)),
    refuges: fws.REFUGES.map((r) => decodeRefuge(r, fws.REFUGES_COORD_PRECISION)),
    bakedAt: mod.RESTRICTIONS_BAKED_AT,
    refugesBakedAt: fws.REFUGES_BAKED_AT,
  }))
  return loading
}
