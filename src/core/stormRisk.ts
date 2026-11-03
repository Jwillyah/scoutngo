/*
 * STORM INGREDIENTS, LATER TODAY AND TOMORROW (Batch K, Section 3). The
 * models' numbers turned into a plain line by arithmetic; the Storm
 * Prediction Center's outlook, watches and discussions said beside it,
 * quoted, and NEVER an input to the line (tests/stormRisk.test.ts).
 *
 * A MODEL HAS STORMS IN AN HOUR when all of these hold there:
 *   CAPE (energy for rising air)          CAPE_MIN J/kg or more
 *   CIN (the lid on it)                   CIN_MAX J/kg or less, when given
 *   lifted index                          0 or below, when given
 *   rain in that model, that hour         RAIN_MM or more
 * STORMS POSSIBLE in an hour when at least half the models that give CAPE
 * there have storms. "Could be strong" when, in those hours, CAPE reaches
 * STRONG_CAPE and the wind changes by SHEAR_MS or more between the ground
 * and 500 hPa (about 5.5 km: Open-Meteo has no 6 km wind, so this is the
 * nearest to 0-6 km shear it can give). "Heavy rain possible" with
 * precipitable water PW_HEAVY mm or more. Numbers behind "Why".
 */
export const CAPE_MIN = 500
export const CIN_MAX = 100
export const RAIN_MM = 0.1
export const STRONG_CAPE = 1500
export const SHEAR_MS = 15
export const PW_HEAVY = 45

export interface IngredientHour {
  at: Date
  /** Per model, null where a model does not give it. */
  models: { cape: number | null; cin: number | null; li: number | null; pw: number | null; rain: number | null; shear: number | null }[]
}

export interface StormDay {
  /** The day's local date. */
  date: string
  possible: boolean
  from: Date | null
  to: Date | null
  strong: boolean
  heavyRain: boolean
  /** The most each number reached in the possible hours (or the day, when none): for "Why". */
  maxCape: number | null
  minCin: number | null
  minLi: number | null
  maxShear: number | null
  maxPw: number | null
  /** Of the models giving CAPE, how many had storms in the best hour. */
  agree: number
  of: number
}

/** Wind change between two levels as vectors, m/s. */
export function shearMs(speed10: number | null, dir10: number | null, speed500: number | null, dir500: number | null): number | null {
  if (speed10 === null || dir10 === null || speed500 === null || dir500 === null) return null
  const v = (s: number, d: number) => [s * Math.sin((d * Math.PI) / 180), s * Math.cos((d * Math.PI) / 180)]
  const [a, b] = v(speed10, dir10)
  const [c, e] = v(speed500, dir500)
  return Math.hypot(c - a, e - b)
}

const stormy = (m: IngredientHour['models'][number]) =>
  m.cape !== null && m.cape >= CAPE_MIN && (m.cin === null || m.cin <= CIN_MAX) && (m.li === null || m.li <= 0) && m.rain !== null && m.rain >= RAIN_MM

export function hourVote(h: IngredientHour): { agree: number; of: number; possible: boolean } {
  const withCape = h.models.filter((m) => m.cape !== null)
  const agree = withCape.filter(stormy).length
  return { agree, of: withCape.length, possible: withCape.length > 0 && agree * 2 >= withCape.length }
}

const maxOf = (xs: (number | null)[]) => xs.reduce<number | null>((a, x) => (x === null ? a : a === null ? x : Math.max(a, x)), null)
const minOf = (xs: (number | null)[]) => xs.reduce<number | null>((a, x) => (x === null ? a : a === null ? x : Math.min(a, x)), null)

/** One local day's hours (already cut to the day, from now on for today). */
export function stormDay(date: string, hours: readonly IngredientHour[]): StormDay {
  const votes = hours.map(hourVote)
  const on = hours.filter((_, i) => votes[i].possible)
  const pick = on.length > 0 ? on : hours
  const all = pick.flatMap((h) => h.models)
  const best = votes.reduce((a, v) => (v.agree > a.agree ? v : a), { agree: 0, of: votes[0]?.of ?? 0, possible: false })
  const maxCape = maxOf(all.map((m) => m.cape))
  const maxShear = maxOf(all.map((m) => m.shear))
  const maxPw = maxOf(all.map((m) => m.pw))
  return {
    date,
    possible: on.length > 0,
    from: on[0]?.at ?? null,
    to: on.length === 0 ? null : new Date(on[on.length - 1].at.getTime() + 3_600_000),
    strong: on.length > 0 && (maxCape ?? 0) >= STRONG_CAPE && (maxShear ?? 0) >= SHEAR_MS,
    heavyRain: on.length > 0 && (maxPw ?? 0) >= PW_HEAVY,
    maxCape,
    minCin: minOf(all.map((m) => m.cin)),
    minLi: minOf(all.map((m) => m.li)),
    maxShear,
    maxPw,
    agree: best.agree,
    of: best.of,
  }
}

/** "Storms possible after 3 PM · could be strong · heavy rain possible"; null when the models have none. */
export function stormLine(d: StormDay, clock: (at: Date) => string, dayWord: string): string | null {
  if (!d.possible || d.from === null) return null
  const parts = [`Storms possible ${dayWord === 'today' ? '' : `${dayWord} `}after ${clock(d.from)}`]
  if (d.strong) parts.push('could be strong')
  if (d.heavyRain) parts.push('heavy rain possible')
  return parts.join(' · ')
}

/* ------------------------------------------------------- the ensemble */

/** Each run's rain per hour for one day's hours: runs[r][h], mm. */
export function rainOdds(runs: readonly (readonly (number | null)[])[], hours: readonly Date[]): { chance: number | null; from: Date | null; to: Date | null; of: number } {
  const said = runs.filter((r) => r.some((x) => x !== null))
  if (said.length === 0 || hours.length === 0) return { chance: null, from: null, to: null, of: 0 }
  const wetRun = said.filter((r) => r.some((x) => x !== null && x >= RAIN_MM * 2)).length
  const perHour = hours.map((_, h) => said.filter((r) => (r[h] ?? 0) >= RAIN_MM * 2).length / said.length)
  /* The likeliest stretch: the best three hours in a row. */
  let best = -1
  let at = 0
  for (let h = 0; h + 3 <= perHour.length; h += 1) {
    const s = perHour[h] + perHour[h + 1] + perHour[h + 2]
    if (s > best) {
      best = s
      at = h
    }
  }
  const chance = wetRun / said.length
  const spread = best <= 0 ? null : { from: hours[at], to: new Date(hours[Math.min(hours.length - 1, at + 2)].getTime() + 3_600_000) }
  return { chance, from: spread?.from ?? null, to: spread?.to ?? null, of: said.length }
}

/* ----------------------------------------------------------- the SPC */

export const SPC_LEVEL: Record<string, { n: number; word: string }> = {
  TSTM: { n: 0, word: 'general thunderstorms' },
  MRGL: { n: 1, word: 'Marginal risk (1 of 5)' },
  SLGT: { n: 2, word: 'Slight risk (2 of 5)' },
  ENH: { n: 3, word: 'Enhanced risk (3 of 5)' },
  MDT: { n: 4, word: 'Moderate risk (4 of 5)' },
  HIGH: { n: 5, word: 'High risk (5 of 5)' },
}

/** The highest category among the outlook polygons that hold the venue. */
export function outlookAt(labels: readonly string[]): { label: string; word: string } | null {
  const known = labels.filter((l) => l in SPC_LEVEL).sort((a, b) => SPC_LEVEL[b].n - SPC_LEVEL[a].n)
  return known.length === 0 ? null : { label: known[0], word: SPC_LEVEL[known[0]].word }
}
