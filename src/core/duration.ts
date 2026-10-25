/*
 * HOW LONG, AS HOURS AND MINUTES.
 *
 * "240 min" makes the reader do the division. "4 h" and "1 h 16 m" do not.
 * One function for every duration on screen, so the golden-hour chip and the
 * NOW screen cannot come to say the same span two different ways.
 */
export function durationWords(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes))
  const hours = Math.floor(whole / 60)
  const rest = whole % 60
  if (hours === 0) return `${rest} m`
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} m`
}
