/*
 * THE GOLDEN CHIP: minutes of golden hour left, and whether it is starting
 * soon. Soon is amber, the sun's colour, and never `urgent`: urgent paints
 * the hazard red, and running out of light is not a hazard
 * (src/core/colorRole.ts).
 */
import { durationWords } from '../core/duration.ts'
import type { Chip } from '../components/ChipRow.tsx'

/** Under this many minutes left, the chip is lit amber. */
export const GOLDEN_SOON_MINUTES = 60

export function goldenChip(minutesLeft: number | null): Chip {
  return {
    kind: 'golden',
    label: 'GOLDEN',
    value: minutesLeft === null ? null : minutesLeft <= 0 ? 'past' : durationWords(minutesLeft),
    soon: minutesLeft !== null && minutesLeft > 0 && minutesLeft <= GOLDEN_SOON_MINUTES,
  }
}
