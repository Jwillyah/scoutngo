/*
 * THE LIT FRACTION AS A PHASE (Batch SIMPLE-2, Section 1): what the one moon
 * drawing (src/components/MoonDrawing.tsx) feeds moonLitPath (src/lib/moonGlyph.ts).
 */
/** Suncalc's phase (0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter) from the lit fraction 0..1 and waxing or waning. */
export function phaseFromLit(lit: number, waxing: boolean): number {
  const f = Math.min(1, Math.max(0, lit))
  const half = Math.acos(1 - 2 * f) / (2 * Math.PI)
  return waxing ? half : 1 - half
}
