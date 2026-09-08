import type { LatLon } from '../core/geo.ts'

/**
 * A camera position. Later these come back from the model, which proposes where
 * to stand and what to shoot. It never supplies a bearing, a field of view, or a
 * lighting call. Those are computed from this position by src/core/.
 */
export interface CameraPosition {
  id: string
  /** Badge number shown on the map. */
  number: number
  at: LatLon
  bodyId: string
  lensId: string
  focalLength: number
  /** What to capture from here. Model judgement, not geometry. */
  shot: string
  note: string
}

/**
 * =========================== STUB DATA, NOT REAL OUTPUT ======================
 *
 * Three hardcoded positions around Brew River so the figures, cones, and
 * lighting colors can be seen on real imagery before the model exists. Nothing
 * here was computed and nothing here is a recommendation. Delete this whole
 * export the moment generate is wired up.
 *
 * The lighting colors these produce ARE real: they are computed from these
 * coordinates by src/core/lighting.ts against the real sun position.
 * ============================================================================
 */
export const STUB_POSITIONS: CameraPosition[] = [
  {
    id: 'stub-north-deck',
    number: 1,
    at: { lat: 38.3651, lon: -75.6071 },
    bodyId: 'a7iv',
    lensId: 'sony-200-600',
    focalLength: 400,
    shot: 'Compressed boat approach from the deck rail, pilings stacked behind.',
    note: 'STUB. Where the crowd already is, which is why it is worth checking.',
  },
  {
    id: 'stub-south-bank',
    number: 2,
    at: { lat: 38.3627, lon: -75.6062 },
    bodyId: 'a7iv',
    lensId: 'sony-200-600',
    focalLength: 300,
    shot: 'Boats hitting the pilings with the bar and crowd as the backdrop.',
    note: 'STUB. Public access along Riverside Drive on the south bank.',
  },
  {
    id: 'stub-downstream',
    number: 3,
    at: { lat: 38.3644, lon: -75.6043 },
    bodyId: 'a7iii',
    lensId: 'sigma-28-75',
    focalLength: 50,
    shot: 'Wide of the course looking back upriver, boats entering frame.',
    note: 'STUB. Downstream, close in, so a short lens still fills the frame.',
  },
]

/** STUB. The thing being shot: the docking course pilings in front of the deck. */
export const STUB_SUBJECT: LatLon = { lat: 38.3643, lon: -75.6066 }
