/*
 * THE BAKED AIRSPACE, LOADED ONLY WHEN IT IS ASKED FOR.
 *
 * WHY THIS ONE IS DYNAMIC AND THE FACILITY MAP IS NOT. The facility grid is
 * 176KB over the wire and answers the question that shapes every drone shoot,
 * so it is worth having present. The airspace extract is 587KB, because 2,359
 * real polygons with real boundaries cannot be compressed into a grid the way
 * regular cells can. That is too much to spend on every cold start of a
 * ground-only shoot, and it is not needed until somebody asks about airspace.
 *
 * So it is a dynamic import. The chunk is fetched from this app's own origin,
 * carries no coordinate, and once fetched is cached by the browser and
 * available offline, which is the condition a site survey actually happens in.
 */
import {
  airspaceAt,
  authorizationState,
  decodeShape,
  type AirspaceShape,
  type AuthorizationState,
} from '../core/airspaceLookup.ts'
import type { LatLon } from '../core/geo.ts'

let shapes: AirspaceShape[] | null = null
let loading: Promise<AirspaceShape[]> | null = null

/**
 * Decode once per session.
 *
 * The in-flight promise is held as well as the result, so two panels opening
 * at the same moment share one fetch and one decode instead of racing.
 */
export async function airspaceShapes(): Promise<AirspaceShape[]> {
  if (shapes !== null) return shapes
  loading ??= import('../data/airspace.ts').then((mod) => {
    shapes = mod.AIRSPACE_SHAPES.map((s) => decodeShape(s, mod.AIRSPACE_COORD_PRECISION))
    return shapes
  })
  return loading
}

export interface AirspaceAnswer {
  state: AuthorizationState
  hits: AirspaceShape[]
  /** Boundary generalisation in metres, so the answer can state its own slop. */
  boundaryMetres: number
  bakedAt: string
}

/** What the extract says about this pin. */
export async function airspaceAnswer(at: LatLon): Promise<AirspaceAnswer> {
  const all = await airspaceShapes()
  const mod = await import('../data/airspace.ts')
  const hits = airspaceAt(all, at)
  return {
    state: authorizationState(hits),
    hits,
    /* Degrees of latitude to metres is near enough at any latitude for this. */
    boundaryMetres: Math.round(mod.AIRSPACE_SIMPLIFY_DEGREES * 111_320),
    bakedAt: mod.AIRSPACE_BAKED_AT,
  }
}
