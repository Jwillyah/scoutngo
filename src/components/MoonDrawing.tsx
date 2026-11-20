import { phaseFromLit } from '../lib/moonLit.ts'
import { MoonGlyph } from './MoonGlyph.tsx'

/*
 * THE ONE MOON DRAWING (Batch SIMPLE-2, Section 1). The real phase, from how
 * much is lit and whether it is waxing or waning: waxing is lit on the RIGHT,
 * waning on the LEFT (the northern-hemisphere view). The geometry is
 * moonLitPath in src/lib/moonGlyph.ts, the path every small moon in the app
 * already draws (calendar, map pills, time bar); this only turns "72% lit,
 * waxing" into the phase that path takes, so a big moon and a small one can
 * never show different phases. Nothing is drawn as lit for a moon with no
 * fraction given.
 */

export function MoonDrawing({ lit, waxing, size = 100, strong = false }: { lit: number; waxing: boolean; size?: number; strong?: boolean }) {
  return <MoonGlyph phase={phaseFromLit(lit, waxing)} size={size} strong={strong} />
}
