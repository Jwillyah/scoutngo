/*
 * THE MOON AT ITS PHASE, AS A PATH. One drawing for every small moon in the
 * app: the calendar's days, the moon pills on the map, the moon on the time
 * bar. The lit part as the sun lights it, seen from the northern hemisphere:
 * waxing lit on the right, waning on the left.
 *
 * `phase` is suncalc's: 0 new, 0.25 first quarter, 0.5 full, 0.75 last
 * quarter. Null for a moon too thin to draw a lit part (within 0.02 of new).
 */
export function moonLitPath(phase: number, size: number): string | null {
  if (phase < 0.02 || phase > 0.98) return null
  const r = size / 2 - 1
  const c = size / 2
  /* The terminator is an ellipse whose half-width runs r, 0, r as the phase runs new, quarter, full. */
  const k = Math.cos(2 * Math.PI * phase)
  const litRight = phase < 0.5
  const rx = Math.abs(k) * r
  const outer = `M ${c} ${c - r} A ${r} ${r} 0 0 ${litRight ? 1 : 0} ${c} ${c + r}`
  /* Before a quarter the terminator bulges toward the lit side, after it toward the dark. */
  const sweep = (k > 0) === litRight ? 0 : 1
  return `${outer} A ${rx} ${r} 0 0 ${sweep} ${c} ${c - r} Z`
}

/** The same, as an SVG string, for a pill drawn without React (MapView's time pills). */
export function moonGlyphSvg(phase: number, size: number): string {
  const c = size / 2
  const lit = moonLitPath(phase, size)
  return `<svg class="calm" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${c}" cy="${c}" r="${c - 1}" class="calm__dark"/>${lit === null ? '' : `<path d="${lit}" class="calm__lit"/>`}</svg>`
}

/**
 * The moon in one line, for under the time bar: "Waning gibbous · 96% lit ·
 * rises 7:52 PM". Up, it says when it sets; down, when it rises; a time not
 * on this local day is left out rather than guessed.
 */
export function moonLine(arc: { phase: number; lit: number; altitude: number; rise: { at: Date } | null; set: { at: Date } | null }, at: Date, clock: (t: Date) => string): string {
  const parts = [moonPhaseName(arc.phase), `${Math.round(arc.lit * 100)}% lit`]
  const next = (e: { at: Date } | null) => (e !== null && e.at.getTime() > at.getTime() ? e.at : null)
  const set = next(arc.set)
  const rise = next(arc.rise)
  if (arc.altitude > 0 && set !== null) parts.push(`sets ${clock(set)}`)
  else if (arc.altitude <= 0 && rise !== null) parts.push(`rises ${clock(rise)}`)
  return parts.join(' · ')
}

/** The phase in words. */
export function moonPhaseName(phase: number): string {
  if (phase < 0.03 || phase > 0.97) return 'New moon'
  if (phase < 0.22) return 'Waxing crescent'
  if (phase < 0.28) return 'First quarter'
  if (phase < 0.47) return 'Waxing gibbous'
  if (phase < 0.53) return 'Full moon'
  if (phase < 0.72) return 'Waning gibbous'
  if (phase < 0.78) return 'Last quarter'
  return 'Waning crescent'
}
