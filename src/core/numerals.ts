/*
 * WHICH NUMBERS ARE THE ANSWER AND WHICH ARE THE RECEIPT.
 *
 * The app says "SIDE-LIT, sun across the frame", which is the answer, and then
 * prints 254.9°, which is the receipt. Both are true and only one of them is
 * what anybody came for. This file is the rule that separates them, written
 * once so sixty call sites cannot each decide differently.
 *
 * ONE SWITCH, NOT A MODE. There is no "simple mode" and no "pro mode". Two
 * modes means two builds to test and a bug report neither of us can place,
 * because the first question becomes "which mode were you in". This is a
 * single disclosure applied everywhere and remembered on the device, and the
 * words on the screen are identical either way: the receipts appear beside
 * them or they do not.
 *
 * QUIET IS NOT THE SAME AS SIMPLE. Turning the receipts off removes no
 * warning, no caveat and no honesty line. Those are not numbers and they are
 * not decoration; they are the part of the screen that keeps it truthful, and
 * numerals.test.ts fails if any of them goes missing with the switch off.
 */

/**
 * What a number on screen IS, which is what decides whether it can be hidden.
 *
 * Classified by what the reader DOES with it rather than by its unit. Feet are
 * hidden when they are a solar altitude and shown when they are a drone's
 * height, because one is a receipt for a word already on the screen and the
 * other is a thing you set on an aircraft.
 */
export type NumeralKind =
  /** A compass bearing in degrees: 254.9°, the walk-to bearing, wind from. */
  | 'bearing'
  /** Solar azimuth and altitude in degrees. */
  | 'solar'
  /** Latitude and longitude. */
  | 'coordinate'
  /** A raw focal length where the shot type already names the framing. */
  | 'focal'
  /** A number with a unit the reader acts on: ft AGL, knots, tide ft, metres. */
  | 'actionable'
  /** A clock time. */
  | 'time'
  /** A count of things: positions, hazards, shots. */
  | 'count'

/**
 * WHETHER THIS KIND DISAPPEARS WHEN THE RECEIPTS ARE OFF.
 *
 * The three hidden kinds are the ones that restate something the words
 * already said. Everything else stays, and the default for anything new is to
 * STAY: a number has to be argued into this list, because the failure of
 * hiding too much is silent and the failure of showing too much is merely
 * untidy.
 */
export function isReceipt(kind: NumeralKind): boolean {
  switch (kind) {
    case 'bearing':
    case 'solar':
    case 'coordinate':
    case 'focal':
      return true
    case 'actionable':
    case 'time':
    case 'count':
      return false
  }
}

/** The stored preference. Off by default: the words are the product. */
export const NUMERALS_DEFAULT = false

/** What the one control says. */
export const NUMERALS_LABEL = 'Show the numbers'

export const NUMERALS_NOTE =
  'Bearings, solar azimuth and altitude, and coordinates, printed beside the words that ' +
  'already say what they mean. Off by default. Heights, wind, tide, distances, times and ' +
  'every warning stay either way.'
