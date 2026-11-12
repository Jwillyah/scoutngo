/*
 * THE COLOUR'S CLOCK AS A BAR (Batch BEST SKY, Section 5; board
 * BestSky_Spot): set up, the colour, the deepest moment, dark, each a share
 * of the bar by its minutes. Sunset runs set up, colour, dusk, dark; sunrise
 * runs dark (dawn) first.
 */
export type ClockPart = 'setup' | 'color' | 'fade' | 'dark'

export interface ClockMarks {
  kind: 'sunrise' | 'sunset'
  setUp: Date
  colorFrom: Date
  colorTo: Date
  dark: Date | null
}

/** The bar's parts, left to right, each with its share (0-1); the shares add to 1. */
export function clockParts(m: ClockMarks): { part: ClockPart; from: Date; to: Date; share: number }[] {
  const t = (d: Date) => d.getTime()
  const raw: { part: ClockPart; from: number; to: number }[] =
    m.kind === 'sunset'
      ? [
          { part: 'setup', from: t(m.setUp), to: t(m.colorFrom) },
          { part: 'color', from: t(m.colorFrom), to: t(m.colorTo) },
          ...(m.dark === null || t(m.dark) <= t(m.colorTo) ? [] : [{ part: 'fade' as const, from: t(m.colorTo), to: t(m.dark) }, { part: 'dark' as const, from: t(m.dark), to: t(m.dark) + 10 * 60_000 }]),
        ]
      : [
          ...(m.dark === null || t(m.dark) >= t(m.setUp) ? [] : [{ part: 'dark' as const, from: t(m.dark) - 10 * 60_000, to: t(m.dark) }, { part: 'fade' as const, from: t(m.dark), to: t(m.setUp) }]),
          { part: 'setup', from: t(m.setUp), to: t(m.colorFrom) },
          { part: 'color', from: t(m.colorFrom), to: t(m.colorTo) },
        ]
  const all = raw.filter((r) => r.to > r.from)
  const span = all.reduce((a, r) => a + (r.to - r.from), 0)
  return all.map((r) => ({ part: r.part, from: new Date(r.from), to: new Date(r.to), share: span <= 0 ? 0 : (r.to - r.from) / span }))
}
