/*
 * DAY, CIVIL TWILIGHT AND NIGHT, AND WHAT EACH ONE REQUIRES ON THE AIRCRAFT.
 *
 * WHAT THIS FIXES. On a real shoot the app reported blue hour peak as 18:44 to
 * 18:53 and said nothing about lighting. By its own numbers that window sat
 * inside civil twilight: sunset was 18:27 and dusk 18:53 local, so every
 * minute of the window was after sunset and before dusk. Civil twilight
 * requires anti-collision lighting, and the app had the boundary in hand and
 * never drew it. The band existed in the arithmetic and not on the screen.
 *
 * THE BANDS, AND WHERE THE BOUNDARIES COME FROM.
 *
 *   Day             sunrise to sunset
 *   Civil twilight  dawn to sunrise, and sunset to dusk
 *   Night           before dawn, and after dusk
 *
 * 14 CFR 107.29 defines night as the period between the end of evening civil
 * twilight and the beginning of morning civil twilight, which is the Air
 * Almanac's six degrees of solar depression. suncalc solves for exactly that
 * and calls it dawn and dusk, so the boundaries are taken from its event times
 * rather than recomputed here.
 *
 * WHY THE BOUNDARY IS THE EVENT TIME AND NOT AN ALTITUDE THRESHOLD. This
 * suncalc build's getPosition reports altitude in DEGREES, and it disagrees
 * with its own getTimes by a constant 0.48396 degrees: at its dusk the
 * reported altitude is -5.516, not -6, and at its sunset it is -0.349, not
 * -0.833. The offset is a refraction correction and is constant to a
 * ten-thousandth of a degree across five sites and three dates, so it is not
 * noise. But it is about two minutes of clock at these latitudes, so
 * classifying by "altitude < -6" would draw bands whose edges sat two minutes
 * off the dawn and dusk times printed beside them. Taking the event times as
 * the boundary makes the band and the printed time the same fact by
 * construction. The calibrated altitudes below exist only for the polar case,
 * where there are no events to take.
 *
 * NOTHING HERE DECIDES WHETHER A FLIGHT MAY HAPPEN. It states the rule and the
 * computed boundary. It does not say a flight is legal, cleared, compliant or
 * permitted, and nightWindow.test.ts fails on those words.
 */

import { getPosition, getTimes } from 'suncalc'

/** Contiguous and exhaustive: every instant is exactly one of these. */
export type LightPhase = 'day' | 'civil-twilight' | 'night'

/**
 * Altitude this suncalc build reports AT ITS OWN sunrise and sunset.
 *
 * Not -0.833. See the note above. Pinned by a test, so a suncalc upgrade that
 * changed the convention fails loudly here instead of moving every band edge
 * by two minutes in silence.
 */
export const HORIZON_ALTITUDE_DEG = -0.349

/** Altitude this build reports at its own dawn and dusk. Not -6. */
export const CIVIL_TWILIGHT_ALTITUDE_DEG = -5.516

/** The four boundaries of one local day, or null where the event never occurs. */
export interface CivilTimes {
  dawn: Date | null
  sunrise: Date | null
  sunset: Date | null
  dusk: Date | null
}

/** A run of clock in one phase. */
export interface PhaseSpan {
  phase: LightPhase
  start: Date
  end: Date
}

const usable = (at: unknown): at is Date =>
  at instanceof Date && !Number.isNaN(at.getTime())

const clean = (at: Date | null | undefined): Date | null => (usable(at) ? at : null)

/** The four boundaries for the day containing `date`, at this location. */
export function civilTimes(date: Date, lat: number, lon: number): CivilTimes {
  const t = getTimes(date, lat, lon)
  return {
    dawn: clean(t.dawn),
    sunrise: clean(t.sunrise),
    sunset: clean(t.sunset),
    dusk: clean(t.dusk),
  }
}

/** Degrees above the horizon, in this build's own units. */
function altitudeDeg(at: Date, lat: number, lon: number): number {
  return getPosition(at, lat, lon).altitude
}

/**
 * The fallback, used only where the day has no events at all.
 *
 * Above the Arctic circle in midsummer there is no dawn and no dusk because
 * the sun never gets six degrees down, and suncalc returns null for all four.
 * There is still a correct answer and it is reachable from the altitude, using
 * the calibrated thresholds rather than the nominal ones.
 */
function phaseFromAltitude(at: Date, lat: number, lon: number): LightPhase {
  const altitude = altitudeDeg(at, lat, lon)
  if (altitude > HORIZON_ALTITUDE_DEG) return 'day'
  if (altitude > CIVIL_TWILIGHT_ALTITUDE_DEG) return 'civil-twilight'
  return 'night'
}

/** What phase BEGINS at each kind of boundary. */
const BEGINS: Record<keyof CivilTimes, LightPhase> = {
  dawn: 'civil-twilight',
  sunrise: 'day',
  sunset: 'civil-twilight',
  dusk: 'night',
}

const DAY_MS = 86_400_000

/**
 * Every boundary in a span of days, sorted, each tagged with the phase it
 * starts.
 *
 * THREE DAYS WIDE AROUND THE QUESTION, not one. A window at 00:30 local is
 * after the PREVIOUS day's dusk, and the previous day's events are not in this
 * day's getTimes. Classifying from one day's four events put every instant
 * before that day's dawn into whatever the code happened to default to, which
 * is the kind of bug that is invisible for eleven hours a day and wrong for
 * the other thirteen.
 */
function boundaries(
  from: Date,
  to: Date,
  lat: number,
  lon: number,
): { at: Date; phase: LightPhase }[] {
  const out: { at: Date; phase: LightPhase }[] = []
  const first = from.getTime() - DAY_MS
  const last = to.getTime() + DAY_MS
  for (let t = first; t <= last; t += DAY_MS) {
    const times = civilTimes(new Date(t), lat, lon)
    for (const key of ['dawn', 'sunrise', 'sunset', 'dusk'] as const) {
      const at = times[key]
      if (at !== null) out.push({ at, phase: BEGINS[key] })
    }
  }
  out.sort((x, y) => x.at.getTime() - y.at.getTime())

  /* The same event appears in neighbouring days' tables; keep one of each. */
  return out.filter((e, i) => i === 0 || e.at.getTime() !== out[i - 1].at.getTime())
}

/**
 * The phase at one instant.
 *
 * Boundaries are INCLUSIVE OF THE PHASE THEY START: an instant exactly at
 * sunset is civil twilight, not day. The regulation's boundary is a moment,
 * and a lighting requirement that began a millisecond later would be a
 * distinction with no physical meaning and no way to act on it.
 */
export function phaseAt(at: Date, lat: number, lon: number): LightPhase {
  if (!usable(at)) return 'night'
  const events = boundaries(at, at, lat, lon)
  if (events.length === 0) return phaseFromAltitude(at, lat, lon)

  let phase: LightPhase | null = null
  for (const event of events) {
    if (event.at.getTime() <= at.getTime()) phase = event.phase
    else break
  }
  /* Before every boundary in a three-day window: fall back to the geometry. */
  return phase ?? phaseFromAltitude(at, lat, lon)
}

/**
 * The phases a window crosses, in order, with the boundary times.
 *
 * Returned as SPANS RATHER THAN A SET, because the question the shooter has is
 * not "does this window touch twilight" but "from when". A window that starts
 * in day and ends in night needs the two instants where the requirements
 * change, and those instants are the whole answer.
 */
export function phaseSpans(from: Date, to: Date, lat: number, lon: number): PhaseSpan[] {
  if (!usable(from) || !usable(to) || to.getTime() < from.getTime()) return []

  const events = boundaries(from, to, lat, lon)
  const cuts = events
    .map((e) => e.at.getTime())
    .filter((t) => t > from.getTime() && t < to.getTime())

  const edges = [from.getTime(), ...cuts, to.getTime()]
  const spans: PhaseSpan[] = []
  for (let i = 0; i < edges.length - 1; i += 1) {
    const start = new Date(edges[i])
    const end = new Date(edges[i + 1])
    const phase = phaseAt(start, lat, lon)
    const previous = spans[spans.length - 1]
    /* Merge: a window can cross a boundary that does not change the phase. */
    if (previous !== undefined && previous.phase === phase) {
      previous.end = end
    } else {
      spans.push({ phase, start, end })
    }
  }
  return spans
}

/**
 * ANTI-COLLISION LIGHTING, 14 CFR 107.29(b).
 *
 * Required in civil twilight AND at night, which is the part that is easy to
 * get half right: the lighting requirement is not a night requirement, it
 * starts at sunset. The regulation also says the lighting must be visible for
 * three statute miles and must not be switched off in flight, which is why the
 * sentence below says "never off in flight" rather than "fitted".
 */
export function anticollisionRequired(phase: LightPhase): boolean {
  return phase === 'civil-twilight' || phase === 'night'
}

/**
 * THE NIGHT TRAINING, 14 CFR 107.65(a).
 *
 * Night only. Civil twilight does not carry it, which is the other half of the
 * same easy mistake: one requirement starts at sunset and the other at dusk,
 * and collapsing them into "night rules" misstates both boundaries.
 */
export function nightTrainingRequired(phase: LightPhase): boolean {
  return phase === 'night'
}

export const PHASE_LABEL: Record<LightPhase, string> = {
  day: 'Day',
  'civil-twilight': 'Civil twilight',
  night: 'Night',
}

/** What the boundary IS, so the band can name its own edges. */
export const PHASE_BOUNDS: Record<LightPhase, string> = {
  day: 'sunrise to sunset',
  'civil-twilight': 'dawn to sunrise, and sunset to dusk',
  night: 'before dawn, and after dusk',
}

/**
 * THE REQUIREMENTS THAT APPLY IN A PHASE, each stated as the rule it comes
 * from.
 *
 * Every string names the section and says what the section requires. None of
 * them says anything about this flight, this pilot or this aircraft, because
 * this file knows none of those things.
 */
export function phaseRequirements(phase: LightPhase): readonly string[] {
  const out: string[] = []
  if (anticollisionRequired(phase)) {
    out.push(
      '107.29 requires anti-collision lighting visible for 3 statute miles, ' +
        'and it may never be switched off in flight.',
    )
  }
  if (nightTrainingRequired(phase)) {
    out.push('107.65 requires the night operations training before flying at night.')
  }
  return out
}
