/*
 * WCAG contrast, so a colour decision can be checked rather than eyeballed.
 *
 * The accent changes per screen and carries dark text on top of it. "It looks
 * fine" is not a test, and a gradient has two ends that both have to pass, so
 * the ratio is computed and asserted in contrast.test.ts alongside the tokens.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

/** #rrggbb or #rgb. Returns null rather than guessing at anything else. */
export function parseHex(hex: string): Rgb | null {
  const text = hex.trim().replace(/^#/, '')
  const full =
    text.length === 3
      ? text
          .split('')
          .map((c) => c + c)
          .join('')
      : text
  if (!/^[0-9a-f]{6}$/i.test(full)) return null
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

const channel = (value: number): number => {
  const scaled = value / 255
  return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4)
}

/** WCAG relative luminance, 0 for black and 1 for white. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const first = parseHex(a)
  const second = parseHex(b)
  if (first === null || second === null) return 0
  const light = Math.max(relativeLuminance(first), relativeLuminance(second))
  const dark = Math.min(relativeLuminance(first), relativeLuminance(second))
  return (light + 0.05) / (dark + 0.05)
}

/**
 * How far apart two colours are perceptually, as a rough distance in a
 * luminance weighted RGB space.
 *
 * NOT a replacement for a proper Lab delta E. It is here for one specific
 * question: could two status colours be confused for each other at a glance, in
 * sun, on a phone. Anything comfortably above the threshold below is safe for
 * that, and the exact figure is not load bearing.
 */
export function colourDistance(a: string, b: string): number {
  const first = parseHex(a)
  const second = parseHex(b)
  if (first === null || second === null) return 0
  const rMean = (first.r + second.r) / 2
  const dr = first.r - second.r
  const dg = first.g - second.g
  const db = first.b - second.b
  return Math.sqrt(
    (2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db,
  )
}
