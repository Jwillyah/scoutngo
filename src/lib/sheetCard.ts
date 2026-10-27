/*
 * ONE SUBJECT PER SURFACE.
 *
 * WHAT THIS REPLACES. The sheet held five sections in one scroll: Conditions,
 * Sky, Sun curve, Layers and Hazards, stacked, with the Conditions section
 * alone measuring 1937 px. Opening the sheet to read the wind meant scrolling
 * past the tide, the cloud, the airspace and the sun. A page about everything
 * is a page about nothing, and it grew that way one section at a time because
 * nothing in the structure said it could not.
 *
 * SO THE CONTENT IS A UNION, not a list. The sheet shows exactly one card,
 * because a value of this type IS exactly one card. There is no state in which
 * two subjects are on screen, and no way to add a sixth section by appending
 * to something.
 *
 * Same move as the Aim union, the MapPanel union and SheetDetent: make the
 * shape that went wrong unrepresentable rather than merely discouraged.
 *
 * THE HOME CARD IS 'shoot', and it is where dismissing any other card returns
 * to. It is not special-cased anywhere: it is a member of the union like the
 * rest, so "go back" is "show the shoot".
 */

export type SheetCard =
  /** The shoot itself: the window, and the positions as thumbnails. Home. */
  | { kind: 'shoot' }
  /** The four chips, each its own card. */
  | { kind: 'golden' }
  | { kind: 'wind' }
  | { kind: 'cloud' }
  | { kind: 'tide' }
  /** Opened from the rail. */
  | { kind: 'layers' }
  /** Opened from a layer tile. */
  | { kind: 'hazards' }
  | { kind: 'airspace' }
  /** The sky: events, cameras, the day's curve. */
  | { kind: 'sky' }
  | { kind: 'cams' }
  | { kind: 'suncurve' }
  /** From Sky › Moon: the moonrise shot list, worked out. */
  | { kind: 'moonrise' }
  /** From the menu: the clock and the units, stored on the phone. */
  | { kind: 'settings' }
  /** From the menu: backup, the API key, what leaves the phone. */
  | { kind: 'about' }
  /** From the menu: the call sheet, written on the shooter's own key. */
  | { kind: 'callsheet' }

export type CardKind = SheetCard['kind']

export const HOME: SheetCard = { kind: 'shoot' }

/** The title on the card's own header. Home has none: it is not a card you left. */
export const CARD_TITLE: Record<CardKind, string> = {
  shoot: 'The shoot',
  golden: 'Golden hour',
  wind: 'Wind',
  cloud: 'Cloud',
  tide: 'Tide',
  layers: 'Map & layers',
  hazards: 'Hazards',
  airspace: 'Airspace',
  sky: 'Sky',
  cams: 'Sky cameras',
  suncurve: 'The day',
  moonrise: 'Moonrise',
  settings: 'Settings',
  about: 'About',
  callsheet: 'Call sheet',
}

/**
 * WHICH CHIP A CARD BELONGS TO, so the chip can show itself as active.
 *
 * Derived from the card rather than held beside it: a second "which chip is
 * lit" value would be a second source for one fact, and they would disagree
 * the first time a card was opened from somewhere other than its chip.
 */
export const CHIP_FOR: Partial<Record<CardKind, CardKind>> = {
  golden: 'golden',
  wind: 'wind',
  cloud: 'cloud',
  tide: 'tide',
}

/** Whether this card is the home card. */
export function isHome(card: SheetCard): boolean {
  return card.kind === 'shoot'
}

/**
 * WHERE THE TIME STRIP BELONGS: ON A CARD WHOSE READING CHANGES WITH TIME.
 *
 * WHY THIS IS A TABLE AND NOT A CONDITION AT THE CALL SITE. The scrubber used
 * to sit in the peek, which meant it appeared above every card whether or not
 * the card had anything to do with time -- a 250px time panel above the layer
 * tiles, and above About, where it pushed the copy off the bottom. Asking
 * "should this card show it" at each of eleven call sites is how two of them
 * end up disagreeing.
 *
 * THE FOUR THAT DO NOT GET IT, AND WHY:
 *
 *   layers    a tile grid. Nothing on it moves with the clock.
 *   settings  the clock and the units. Same.
 *   about     prose and the backup. Same.
 *   hazards   a mark on the ground is there at 6am and at 6pm.
 *   airspace  the FAA ceiling over a venue is not a function of the hour.
 *
 * AND suncurve IS THE TIME CONTROL. The elevation curve carries its own
 * scrubber across the whole day; a strip above it would be a second control
 * for one value, which is shape A in docs/failure-modes.md in its most
 * literal form -- two things that set the same number, drifting apart the
 * first time one of them rounds differently.
 */
export const TIME_MATTERS: Record<CardKind, boolean> = {
  shoot: true,
  golden: true,
  wind: true,
  cloud: true,
  /* The Tide sheet's own curve moves the same moment as the bar (TideSheet.tsx), and the page needs the room. */
  tide: false,
  sky: true,
  /*
   * A CAMERA IMAGE IS NOT SCRUBBED. The feeds are whatever each operator is
   * publishing right now; dragging the strip would move every other reading
   * in the app and leave these untouched, which is a control that appears to
   * work and does not.
   */
  cams: false,
  suncurve: false,
  layers: false,
  /* A plan for a night, not a reading at the bar's moment. */
  moonrise: false,
  settings: false,
  about: false,
  hazards: false,
  airspace: false,
  /* Written for the whole window, not the moment on the bar. */
  callsheet: false,
}
