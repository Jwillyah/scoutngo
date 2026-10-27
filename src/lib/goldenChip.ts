/*
 * THE GOLDEN CHIP: the next golden light, from the time on the bar, morning
 * or evening (src/core/goldenNext.ts). "in 25 m" before it, "now · 38 m left"
 * inside it. It used to count to the end of the shoot window, which at 6:58
 * AM at Virginia Beach on 27 Oct read "12 h", past the morning altogether.
 *
 * Soon is amber, the sun's colour, and never `urgent`: urgent paints the
 * hazard red, and running out of light is not a hazard (src/core/colorRole.ts).
 */
import { durationWords } from '../core/duration.ts'
import type { GoldenNext } from '../core/goldenNext.ts'
import type { Chip } from '../components/ChipRow.tsx'

/** Within this many minutes of starting, or while it lasts, the chip is lit amber. */
export const GOLDEN_SOON_MINUTES = 60

/*
 * SHORT ENOUGH FOR THE CHIP, which holds about seven characters: "in 25 m",
 * "in 7 h" (whole hours past 100 minutes, where the minutes stop mattering),
 * and inside it the label says NOW and the value "38 m left".
 */
const until = (minutes: number) => (minutes < 100 ? `in ${Math.round(minutes)} m` : `in ${Math.round(minutes / 60)} h`)

export function goldenChip(next: GoldenNext | null): Chip {
  const now = next?.kind === 'now'
  const value =
    next === null || next.kind === 'none'
      ? null
      : next.kind === 'now'
        ? `${durationWords(next.minutesLeft)} left`
        : until(next.minutesUntil)
  return {
    kind: 'golden',
    label: now ? 'GOLDEN NOW' : 'GOLDEN',
    value,
    soon: next !== null && (next.kind === 'now' || (next.kind === 'next' && next.minutesUntil <= GOLDEN_SOON_MINUTES)),
  }
}
