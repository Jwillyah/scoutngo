/*
 * THE HOME PAGE'S SUNSET, in one place: the page paints it from here and
 * homeSky.test.ts checks every label against the colour behind it from here.
 *
 * Stops are the design's (design/home-golden.html), night indigo at the top
 * to gold at the horizon. The horizon sits at 60% of the frame's height, and
 * the sky is gone below it so the venue reads clearly; the sun sits on it.
 */
import { mixHex } from '../core/contrast.ts'

export const FRAME = { width: 390, height: 844 } as const

/** Where the sky meets the ground, as a share of the frame's height. */
export const HORIZON = 0.6

/** Offsets are shares of the distance from the top to the horizon. */
export const SKY_STOPS: readonly { at: number; colour: string }[] = [
  { at: 0, colour: '#161a4a' },
  { at: 0.22, colour: '#3a2a78' },
  { at: 0.4, colour: '#7a3b93' },
  { at: 0.56, colour: '#c2508a' },
  { at: 0.72, colour: '#ee7a5a' },
  { at: 0.86, colour: '#f7a94a' },
  { at: 1, colour: '#ffd27a' },
]

/** The sky's colour at a height in px of the frame, or null below the horizon. */
export function skyAt(y: number): string | null {
  const t = y / (FRAME.height * HORIZON)
  if (t < 0 || t > 1) return null
  for (let i = 1; i < SKY_STOPS.length; i += 1) {
    const a = SKY_STOPS[i - 1]
    const b = SKY_STOPS[i]
    if (t <= b.at) return mixHex(a.colour, b.colour, (t - a.at) / (b.at - a.at))
  }
  return SKY_STOPS[SKY_STOPS.length - 1].colour
}

/** Type colours on the home page, so the test and the page agree. */
export const HOME_INK = {
  /** On the night end of the sky: the name and the line. */
  light: '#ffffff',
  /** On the warm end: the four feature labels, dark plum as designed. */
  dark: '#3a1430',
  /** Footer, on the bottom scrim. */
  footer: '#d5dae3',
} as const

/**
 * The scrim under the button and footer: from `top` (share of the frame) it
 * ramps to `opacity` near-black by `solidFrom` (share of the scrim) and holds
 * there, so the footer line (at 0.89 of the frame) is on the solid part.
 */
export const FOOT_SCRIM = { colour: '#05070a', opacity: 0.9, top: 0.74, solidFrom: 0.4 } as const

/** Where the solid part of the foot scrim starts, as a share of the frame. */
export const FOOT_SOLID_AT = FOOT_SCRIM.top + (1 - FOOT_SCRIM.top) * FOOT_SCRIM.solidFrom

/*
 * THE BANDS the home page's type sits in at 390 x 844, in frame px. The test
 * holds the colours to them (tests/homePage.test.tsx); the measurement
 * (scripts/measure-home-contrast.mjs) fails when a label on the real page
 * leaves its band, so the two cannot drift apart.
 */
export const TYPE_BANDS = {
  light: { from: 130, to: 268 },
  dark: { from: 330, to: 400 },
  /** The footer line's top, as a share of the frame: on the solid scrim. */
  footerFrom: 0.86,
} as const
