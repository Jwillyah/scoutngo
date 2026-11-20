/*
 * THE INSTANT OF A FULL OR NEW MOON (Meeus, Astronomical Algorithms, 2nd ed.,
 * chapter 49, "Phases of the Moon"), to well under a minute.
 *
 * WHY NOT suncalc. The app's other moon facts (rise, set, bearing, share lit)
 * come from suncalc and agree with USNO to the minute and a tenth of a degree
 * (src/core/moonNights.ts, tests/moonFixture.test.ts). Its phase instant does
 * not. Measured at Chic's Beach for the full moon of 24 Nov 2026 (USNO
 * 9:53 AM EST) and the new moon of 8 Dec 2026 (USNO 7:52 PM EST),
 * measurements/2026-11-19-moon-fixture.md:
 *
 *   skyEvents.ts moonTurningPoints (6-hour grid)   1:00 PM, 7:00 PM
 *   suncalc's share lit at its extreme, minute     10:00 AM, 8:16 PM
 *   suncalc's phase crossing 0.5 / 1→0, minute     11:36 AM, 8:51 PM
 *   this file                                      9:53 AM, 7:51 PM
 *
 * (The grid's answer moves with where its six-hour steps start.)
 *
 * The grid is coarse by design (it only has to name a night), but even
 * refined, suncalc's moon is a three-term model: it can be most of a degree
 * out in longitude, and the moon takes about two hours to move a degree
 * against the sun. A phase TIME printed to the minute needs a model built for
 * it, so this file is the one source for the Night tab's "Next full" and
 * "Next new" times. Which NIGHT is dark or full still follows from the
 * time this gives.
 *
 * Meeus 49 gives the instant in Dynamical Time (TT). Universal Time is TT less
 * ΔT, about 69 s in 2026 and drifting under a second a year, so a constant is
 * well inside the minute this is printed to.
 */
const DEG = Math.PI / 180
const sin = (d: number) => Math.sin(d * DEG)
const DELTA_T_S = 69
const SYNODIC_DAYS = 29.530588861
const DAY_MS = 86_400_000

export type PhaseKind = 'new' | 'full'

export interface MoonPhaseInstant {
  kind: PhaseKind
  at: Date
}

/* [coefficient, power of E, M multiple, M' multiple, F multiple, Ω multiple], Meeus 49 */
type Term = readonly [number, number, number, number, number, number]
const NEW: readonly Term[] = [
  [-0.4072, 0, 0, 1, 0, 0], [0.17241, 1, 1, 0, 0, 0], [0.01608, 0, 0, 2, 0, 0], [0.01039, 0, 0, 0, 2, 0],
  [0.00739, 1, -1, 1, 0, 0], [-0.00514, 1, 1, 1, 0, 0], [0.00208, 2, 2, 0, 0, 0], [-0.00111, 0, 0, 1, -2, 0],
  [-0.00057, 0, 0, 1, 2, 0], [0.00056, 1, 1, 2, 0, 0], [-0.00042, 0, 0, 3, 0, 0], [0.00042, 1, 1, 0, 2, 0],
  [0.00038, 1, 1, 0, -2, 0], [-0.00024, 1, -1, 2, 0, 0], [-0.00017, 0, 0, 0, 0, 1],
]
const FULL: readonly Term[] = [
  [-0.40614, 0, 0, 1, 0, 0], [0.17302, 1, 1, 0, 0, 0], [0.01614, 0, 0, 2, 0, 0], [0.01043, 0, 0, 0, 2, 0],
  [0.00734, 1, -1, 1, 0, 0], [-0.00515, 1, 1, 1, 0, 0], [0.00209, 2, 2, 0, 0, 0], [-0.00111, 0, 0, 1, -2, 0],
  [-0.00057, 0, 0, 1, 2, 0], [0.00056, 1, 1, 2, 0, 0], [-0.00042, 0, 0, 3, 0, 0], [0.00042, 1, 1, 0, 2, 0],
  [0.00038, 1, 1, 0, -2, 0], [-0.00024, 1, -1, 2, 0, 0], [-0.00017, 0, 0, 0, 0, 1],
]
/* The small terms shared by new and full. */
const BOTH: readonly Term[] = [
  [-0.00007, 0, 2, 1, 0, 0], [0.00004, 0, 0, 2, -2, 0], [0.00004, 0, 3, 0, 0, 0], [0.00003, 0, 1, 1, -2, 0],
  [0.00003, 0, 0, 2, 2, 0], [-0.00003, 0, 1, 1, 2, 0], [0.00003, 0, -1, 1, 2, 0], [-0.00002, 0, -1, 1, -2, 0],
  [-0.00002, 0, 1, 3, 0, 0], [0.00002, 0, 0, 4, 0, 0],
]
/* The planetary arguments A1..A14: [constant, per k, coefficient]; A1 also has -0.009173 T². */
const PLANETARY: readonly (readonly [number, number, number])[] = [
  [299.77, 0.107408, 0.000325], [251.88, 0.016321, 0.000165], [251.83, 26.651886, 0.000164], [349.42, 36.412478, 0.000126],
  [84.66, 18.206239, 0.00011], [141.74, 53.303771, 0.000062], [207.14, 2.453732, 0.00006], [154.84, 7.30686, 0.000056],
  [34.52, 27.261239, 0.000047], [207.19, 0.121824, 0.000042], [291.34, 1.844379, 0.00004], [161.72, 24.198154, 0.000037],
  [239.56, 25.513099, 0.000035], [331.55, 3.592518, 0.000023],
]

/** Julian Ephemeris Day of lunation k: an integer is a new moon, an integer + 0.5 a full one. Meeus 49.1 and the corrections. */
export function phaseJde(k: number): number {
  const T = k / 1236.85
  const T2 = T * T
  const T3 = T2 * T
  const T4 = T3 * T
  const mean = 2451550.09766 + SYNODIC_DAYS * k + 0.00015437 * T2 - 0.00000015 * T3 + 0.00000000073 * T4
  const E = 1 - 0.002516 * T - 0.0000074 * T2
  const M = 2.5534 + 29.1053567 * k - 0.0000014 * T2 - 0.00000011 * T3
  const Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4
  const F = 160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4
  const Om = 124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3
  const isFull = Math.abs(k - Math.floor(k) - 0.5) < 1e-9
  const term = (t: Term) => t[0] * E ** t[1] * sin(t[2] * M + t[3] * Mp + t[4] * F + t[5] * Om)
  const periodic = [...(isFull ? FULL : NEW), ...BOTH].reduce((s, t) => s + term(t), 0)
  const planetary = PLANETARY.reduce((s, [c, perK, coef], i) => s + coef * sin(c + perK * k - (i === 0 ? 0.009173 * T2 : 0)), 0)
  return mean + periodic + planetary
}

/** The instant (UT) of lunation k. */
export function phaseInstant(k: number): Date {
  return new Date((phaseJde(k) - 2440587.5) * DAY_MS - DELTA_T_S * 1000)
}

/** Every new and full moon between two instants, in order. */
export function moonPhasesBetween(from: Date, to: Date): MoonPhaseInstant[] {
  /* k from the mean lunation, Meeus 49.2, started one lunation early so none is missed. */
  const year = 2000 + (from.getTime() - Date.UTC(2000, 0, 1)) / (365.25 * DAY_MS)
  let k = Math.floor((year - 2000) * 12.3685) - 1
  const out: MoonPhaseInstant[] = []
  for (let i = 0; i < 2000; i += 1, k += 0.5) {
    const at = phaseInstant(k)
    if (at.getTime() > to.getTime()) break
    if (at.getTime() >= from.getTime()) out.push({ kind: Number.isInteger(k) ? 'new' : 'full', at })
  }
  return out
}

/** The first full (or new) moon at or after an instant. */
export function nextPhase(from: Date, kind: PhaseKind): Date {
  const found = moonPhasesBetween(from, new Date(from.getTime() + 31 * DAY_MS)).find((p) => p.kind === kind)
  /* A synodic month is under 30 days: there is always one within 31. */
  return found!.at
}
