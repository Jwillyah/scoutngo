/*
 * HOW CLOSE THE HOME SCREEN'S NUMBERS CAME (Batch M, Section 5).
 *
 * The arithmetic of scripts/measure-accuracy.mjs, kept here so it is tested
 * (tests/accuracy.test.ts) and so the script only fetches and writes. Every
 * error is FORECAST MINUS OBSERVED: a positive bias is a forecast too high,
 * and for a tide time, a turn predicted later than it came.
 *
 *   score              n, mean absolute error, bias and hit rate of a list
 *                      of errors against one tolerance
 *   parseNdbcWaves     NDBC realtime2 standard met file, the wave columns
 *                      (sharedSkill.parseNdbcMet keeps the weather and drops
 *                      the wave-only rows, which are the ones wanted here)
 *   extremesFromLevels the highs and lows of an observed 6-minute water
 *                      level series, for days NOAA has not yet verified
 *   matchExtremes      each predicted turn against the observed turn of the
 *                      same kind nearest it
 *   worstRows          the rows with the lowest hit rate
 */
import type { TideExtreme } from './tide.ts'

/**
 * A HIT, PER ITEM: the forecast within this of what was observed. Degrees C
 * for the air (2 °C is 3.6 °F), knots for the wind as the home screen shows
 * it, feet for the sea, seconds for its period, minutes and feet for a tide.
 */
export const HIT = { tempC: 2, windKt: 5, gustKt: 5, waveFt: 1, periodS: 2, faceFt: 1, tideMin: 15, tideFt: 0.5 } as const

export interface Score {
  /** Pairs scored. */
  n: number
  mae: number | null
  bias: number | null
  /** Share of pairs within the tolerance, 0..1. */
  hit: number | null
}

/** Errors that are not finite numbers are not pairs: they are left out, not counted as zero. */
export function score(errors: readonly number[], tolerance: number): Score {
  const xs = errors.filter((x) => Number.isFinite(x))
  const n = xs.length
  if (n === 0) return { n: 0, mae: null, bias: null, hit: null }
  return {
    n,
    mae: xs.reduce((a, x) => a + Math.abs(x), 0) / n,
    bias: xs.reduce((a, x) => a + x, 0) / n,
    hit: xs.filter((x) => Math.abs(x) <= tolerance).length / n,
  }
}

/** Share of pairs that agree: a word against a word. */
export function agreement(pairs: readonly (readonly [string, string])[]): Score {
  const n = pairs.length
  return n === 0 ? { n: 0, mae: null, bias: null, hit: null } : { n, mae: null, bias: null, hit: pairs.filter(([a, b]) => a === b).length / n }
}

/* ------------------------------------------------------------- buoys */

export interface WaveObs {
  at: Date
  /** Significant wave height, metres. */
  waveM: number
  /** Dominant period, seconds. */
  periodS: number | null
  /** The direction the dominant waves come from, degrees. */
  fromDeg: number | null
}

/** Every row of an NDBC realtime2 .txt file that carries a wave height, newest first as the file has them. */
export function parseNdbcWaves(txt: string): WaveObs[] {
  const lines = txt.split('\n')
  const head = (lines[0] ?? '').replace(/^#/, '').trim().split(/\s+/)
  const col = (k: string) => head.indexOf(k)
  if (col('WVHT') < 0) return []
  const out: WaveObs[] = []
  for (const line of lines) {
    if (line.startsWith('#') || line.trim() === '') continue
    const c = line.trim().split(/\s+/)
    const v = (k: string) => {
      const i = col(k)
      const x = i < 0 ? 'MM' : c[i]
      const f = x === undefined || x === 'MM' ? NaN : Number(x)
      return Number.isFinite(f) ? f : null
    }
    const waveM = v('WVHT')
    if (waveM === null) continue
    const at = new Date(Date.UTC(Number(c[0]), Number(c[1]) - 1, Number(c[2]), Number(c[3]), Number(c[4])))
    if (Number.isNaN(at.getTime())) continue
    out.push({ at, waveM, periodS: v('DPD'), fromDeg: v('MWD') })
  }
  return out
}

/** The report nearest an instant, within `withinMin` minutes, or null. */
export function nearestInTime<T extends { at: Date }>(list: readonly T[], at: Date, withinMin = 30): T | null {
  let best: T | null = null
  let gap = Infinity
  for (const o of list) {
    const g = Math.abs(o.at.getTime() - at.getTime())
    if (g <= withinMin * 60_000 && g < gap) {
      best = o
      gap = g
    }
  }
  return best
}

/* ------------------------------------------------------------- tides */

export interface LevelSample {
  at: Date
  feet: number
}

/** Smoothing either side of each sample, minutes: takes out the chop and the gauge's 6-minute noise. */
export const SMOOTH_MIN = 30
/** A turn is the highest (or lowest) smoothed level within this either side of it, minutes. */
export const TURN_HALF_WINDOW_MIN = 150

/**
 * THE OBSERVED HIGHS AND LOWS OF A WATER LEVEL SERIES.
 *
 * NOAA's verified highs and lows (product high_low) come weeks after the
 * fact, so a week just gone has only the preliminary 6-minute levels. A
 * turn here is a sample whose smoothed level is the most extreme within
 * TURN_HALF_WINDOW_MIN either side; a turn whose window runs off either end
 * of the series, or over a gap in it, is not called, because the true
 * extreme may be in the part not seen. Consecutive turns of one kind keep
 * the more extreme.
 */
export function extremesFromLevels(samples: readonly LevelSample[], smoothMin = SMOOTH_MIN, halfWindowMin = TURN_HALF_WINDOW_MIN): TideExtreme[] {
  const s = [...samples].filter((x) => Number.isFinite(x.feet)).sort((a, b) => a.at.getTime() - b.at.getTime())
  if (s.length < 3) return []
  const t = s.map((x) => x.at.getTime())
  const smoothMs = smoothMin * 60_000
  const halfMs = halfWindowMin * 60_000
  /* A gap longer than this inside a window means the window was not seen. */
  const GAP_MS = 20 * 60_000
  const smooth = s.map((_, i) => {
    let sum = 0
    let n = 0
    for (let j = i; j >= 0 && t[i] - t[j] <= smoothMs; j -= 1) {
      sum += s[j].feet
      n += 1
    }
    for (let j = i + 1; j < s.length && t[j] - t[i] <= smoothMs; j += 1) {
      sum += s[j].feet
      n += 1
    }
    return sum / n
  })
  const turns: TideExtreme[] = []
  for (let i = 0; i < s.length; i += 1) {
    if (t[i] - t[0] < halfMs || t[s.length - 1] - t[i] < halfMs) continue
    let isMax = true
    let isMin = true
    let lo = i
    let hi = i
    while (lo > 0 && t[i] - t[lo - 1] <= halfMs) lo -= 1
    while (hi < s.length - 1 && t[hi + 1] - t[i] <= halfMs) hi += 1
    let gapped = false
    for (let j = lo; j <= hi; j += 1) {
      if (j > lo && t[j] - t[j - 1] > GAP_MS) gapped = true
      if (j === i) continue
      /* Ties go to the earliest sample, so a flat top is one turn, not several. */
      if (smooth[j] > smooth[i] || (smooth[j] === smooth[i] && j < i)) isMax = false
      if (smooth[j] < smooth[i] || (smooth[j] === smooth[i] && j < i)) isMin = false
    }
    if (gapped || (!isMax && !isMin)) continue
    turns.push({ at: s[i].at, feet: smooth[i], kind: isMax ? 'high' : 'low' })
  }
  const out: TideExtreme[] = []
  for (const e of turns) {
    const last = out[out.length - 1]
    if (last !== undefined && last.kind === e.kind) {
      const better = e.kind === 'high' ? e.feet > last.feet : e.feet < last.feet
      if (better) out[out.length - 1] = e
      continue
    }
    out.push(e)
  }
  return out
}

export interface TurnPair {
  kind: 'high' | 'low'
  predicted: TideExtreme
  observed: TideExtreme
  /** Predicted minus observed, minutes: positive, the turn came earlier than said. */
  minutes: number
  /** Predicted minus observed, feet. */
  feet: number
}

/** Each predicted turn against the nearest observed turn of the same kind within `withinMin`; the rest are not paired. */
export function matchExtremes(predicted: readonly TideExtreme[], observed: readonly TideExtreme[], withinMin = 180): { pairs: TurnPair[]; unmatched: TideExtreme[] } {
  const pairs: TurnPair[] = []
  const unmatched: TideExtreme[] = []
  for (const p of predicted) {
    let best: TideExtreme | null = null
    let gap = Infinity
    for (const o of observed) {
      if (o.kind !== p.kind) continue
      const g = Math.abs(o.at.getTime() - p.at.getTime())
      if (g <= withinMin * 60_000 && g < gap) {
        best = o
        gap = g
      }
    }
    if (best === null) unmatched.push(p)
    else pairs.push({ kind: p.kind, predicted: p, observed: best, minutes: (p.at.getTime() - best.at.getTime()) / 60_000, feet: p.feet - best.feet })
  }
  return { pairs, unmatched }
}

/* ------------------------------------------------------------- worst */

export interface Row {
  label: string
  score: Score
}

/** The `count` rows with the lowest hit rate, rows with nothing scored left out; ties go to the larger error. */
export function worstRows<T extends Row>(rows: readonly T[], count: number): T[] {
  return rows
    .filter((r) => r.score.n > 0 && r.score.hit !== null)
    .sort((a, b) => (a.score.hit ?? 0) - (b.score.hit ?? 0) || (b.score.mae ?? 0) - (a.score.mae ?? 0))
    .slice(0, count)
}

/*
 * THE CALL AGAINST WHAT WAS SEEN (Batch TRUTH, Section 2.5): a field truth
 * file (fixtures/truth/<date>-<place>.json) holds what the cams and the eye
 * said; the app's call for that day is held against it. The range hits when
 * it overlaps what was seen; the word when it is the same word.
 */
export interface TruthSurf {
  date: string
  place: string
  /** What was seen, feet of face, low and high. */
  seenFt: readonly [number, number]
  sizeWord: string
}

export interface TruthRow {
  date: string
  place: string
  ours: string
  seen: string
  oursWord: string
  seenWord: string
  rangeHit: boolean
  wordHit: boolean
}

export function truthRow(t: TruthSurf, call: { lowFt: number; highFt: number; size: string } | null): TruthRow {
  const seen = `${t.seenFt[0]}–${t.seenFt[1]} ft`
  if (call === null) return { date: t.date, place: t.place, ours: '—', seen, oursWord: '—', seenWord: t.sizeWord, rangeHit: false, wordHit: false }
  return {
    date: t.date,
    place: t.place,
    ours: `${call.lowFt}–${call.highFt} ft`,
    seen,
    oursWord: call.size,
    seenWord: t.sizeWord,
    rangeHit: call.lowFt <= t.seenFt[1] && call.highFt >= t.seenFt[0],
    wordHit: call.size === t.sizeWord,
  }
}

/** A field truth file's surf, as truthRow takes it; null when it says no surf. */
export function truthSurfOf(file: { place?: { name?: string }; surf?: { observed?: { surflineJettyCamFt?: number[]; sizeWord?: string } } }, date: string): TruthSurf | null {
  const ft = file.surf?.observed?.surflineJettyCamFt
  const word = file.surf?.observed?.sizeWord
  if (!Array.isArray(ft) || ft.length !== 2 || typeof word !== 'string') return null
  return { date, place: file.place?.name ?? '', seenFt: [ft[0], ft[1]], sizeWord: word }
}
