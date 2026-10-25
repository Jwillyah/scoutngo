/*
 * WHICH ND FILTER, WHEN. A TABLE, NOT A MODEL.
 *
 * WHY THIS IS CODE. The run of show tells a pilot when to swap filters. A
 * model asked for an ND value will produce one, confidently, and it may be
 * wrong by two stops. The shooter's own rule of thumb is short and exact, so
 * it lives here as a table and the model only ever reads its answer.
 *
 * THE TABLE, AS GIVEN:
 *
 *   full sun, midday ............ ND64
 *   4K30, full sun .............. ND128
 *   hazy ........................ ND32
 *   1 to 2 h before sunset ...... ND32, then ND16
 *   last 30 min ................. ND8
 *   after sunset ................ none
 *   over water .................. one stop denser
 *
 * READ AS BANDS OF MINUTES BEFORE SUNSET, because the table has to answer
 * every moment and "1 to 2 h before sunset: ND32 then ND16" names two filters
 * for one hour. The reading used, written down so it can be argued with:
 *
 *   more than 120 min ........... the midday row (sky and mode decide)
 *   120 to 60 min ............... ND32
 *   60 to 30 min ................ ND16
 *   30 to 0 min ................. ND8
 *   after sunset ................ none
 *
 * NOTHING INVENTED. Hazy and 4K30 are rows for the midday band only, because
 * that is where the table gives them; the evening bands are the same whatever
 * the sky, as given.
 *
 * ONE STOP DENSER OVER WATER is the next filter up: an ND number is the light
 * divided by that factor, so one stop is twice the number. ND8 becomes ND16,
 * ND64 becomes ND128. ND128 is the densest in the table; over water it stays
 * ND128 and the reason says ND256 would be the one stop denser.
 */

export type NdFilter = 'ND8' | 'ND16' | 'ND32' | 'ND64' | 'ND128'
export type Sky = 'full-sun' | 'hazy'
export type CaptureMode = 'default' | '4k30'

export interface NdQuery {
  /** Minutes until sunset. Negative after sunset. */
  minutesBeforeSunset: number
  sky: Sky
  mode: CaptureMode
  overWater: boolean
}

export interface NdAnswer {
  nd: NdFilter | null
  /** In plain words, the row that decided it. */
  reason: string
}

const LADDER: readonly NdFilter[] = ['ND8', 'ND16', 'ND32', 'ND64', 'ND128']

/** The band edges, in minutes before sunset. */
export const BAND_EDGES = { evening: 120, late: 60, last: 30 } as const

function denser(nd: NdFilter): { nd: NdFilter; note: string } {
  const at = LADDER.indexOf(nd)
  if (at === LADDER.length - 1) {
    return { nd, note: 'over water one stop denser would be ND256, which is not in the table, so ND128' }
  }
  return { nd: LADDER[at + 1], note: `one stop denser over water, ${nd} to ${LADDER[at + 1]}` }
}

export function ndFor(query: NdQuery): NdAnswer {
  const m = query.minutesBeforeSunset
  if (!Number.isFinite(m)) return { nd: null, reason: 'No sunset time, so no filter can be picked.' }
  if (m <= 0) return { nd: null, reason: 'After sunset: no ND.' }

  let base: NdFilter
  let row: string
  if (m <= BAND_EDGES.last) {
    base = 'ND8'
    row = 'last 30 minutes before sunset'
  } else if (m <= BAND_EDGES.late) {
    base = 'ND16'
    row = '30 to 60 minutes before sunset'
  } else if (m <= BAND_EDGES.evening) {
    base = 'ND32'
    row = '1 to 2 hours before sunset'
  } else if (query.sky === 'hazy') {
    base = 'ND32'
    row = 'hazy'
  } else if (query.mode === '4k30') {
    base = 'ND128'
    row = '4K30 in full sun'
  } else {
    base = 'ND64'
    row = 'full sun'
  }

  if (!query.overWater) return { nd: base, reason: `${base}: ${row}.` }
  const water = denser(base)
  return { nd: water.nd, reason: `${water.nd}: ${row}, ${water.note}.` }
}

export interface NdSwap {
  at: Date
  nd: NdFilter | null
  reason: string
}

/**
 * WHEN TO SWAP, for a run of show: the moments the table's answer changes,
 * from the first band edge to sunset. The first entry is what to start on.
 */
export function ndSwapTimes(
  sunset: Date,
  sky: Sky,
  mode: CaptureMode,
  overWater: boolean,
  from: Date = new Date(sunset.getTime() - 3 * 3_600_000),
): NdSwap[] {
  const minutesAt = (at: Date) => (sunset.getTime() - at.getTime()) / 60_000
  const marks = [from, ...[BAND_EDGES.evening, BAND_EDGES.late, BAND_EDGES.last, 0].map(
    (m) => new Date(sunset.getTime() - m * 60_000),
  )].filter((at) => at.getTime() >= from.getTime())
  marks.sort((a, b) => a.getTime() - b.getTime())

  const out: NdSwap[] = []
  for (const at of marks) {
    /* Just after the edge, so the band that is starting is the one answered. */
    const answer = ndFor({ minutesBeforeSunset: minutesAt(at) - 0.001, sky, mode, overWater })
    if (out.length > 0 && out[out.length - 1].nd === answer.nd) continue
    out.push({ at, ...answer })
  }
  return out
}
