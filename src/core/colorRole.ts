/*
 * THE ONE COLOUR RULE, AND IT IS THE REASON THE MAP LOOKS LIKE AN INSTRUMENT.
 *
 *   TEAL IS CHROME.   Controls, rings, pins, active states, the one button.
 *   EVERY OTHER HUE IS DATA.   Sun, shadow, coverage, hazard, armed.
 *
 *   A data colour never styles a control.
 *   Teal never styles a reading.
 *
 * WHY IT MATTERS MORE THAN IT SOUNDS. An instrument is legible because colour
 * MEANS something on it: amber is always the sun, red is always a hazard, and
 * nothing else is ever allowed to be red. The moment a button is amber because
 * amber looked warm, every amber on the screen stops being a fact and starts
 * being decoration, and the shooter has to read the label to know which is
 * which. That is the difference between a dashboard and a web page.
 *
 * WHERE THE RULE GOT BROKEN BEFORE. The landing page's primary action was a
 * teal-to-blue gradient with a glow. The teal was never the problem -- teal is
 * chrome and a button is chrome, so teal was correct. The gradient and the
 * glow were the problem, because no reading on the map has a gradient or a
 * glow and a control that does is a control from a different product.
 *
 * COVERAGE IS NOT ONE COLOUR, which is the one subtlety worth stating. A cone
 * is painted by its LIGHTING classification -- front-lit, side-lit, backlit --
 * because a cone that is merely present says "we draw cones" and a cone in the
 * colour of its own light says "this is computed". All three are data hues and
 * none of them is the chrome teal; see --light-front, --light-side and
 * --light-back in tokens.css.
 *
 * This file is the written-down version of that rule and colorRole.test.ts is
 * the enforcement: every token below is checked against the real values in
 * src/styles/tokens.css, so a token that drifts into the wrong role fails.
 */

/*
 * WHERE COLOUR LIVES, since the golden bubble pass: in the icons (the
 * sunset tiles, src/lib/iconPalette.ts), in the time bar, and on the home
 * page. Everything sitting on the map -- the top bar, the sheets, the cards,
 * the chips -- stays dark glass. The main action is the gold pill
 * (--action-* in tokens.css); teal is small chrome only. None of that changes
 * the data colours below: amber is still the golden hour, periwinkle the moon,
 * and red is still only a hazard.
 */

/** What a colour is allowed to be used for. */
export type ColorRole =
  /** Controls and furniture. The shooter touches these. */
  | 'chrome'
  /** Readings. The app computed these and the colour says which reading. */
  | 'data'

export interface RoleAssignment {
  /** The CSS custom property, without the leading dashes. */
  token: string
  role: ColorRole
  /** The hex value in tokens.css, lowercased. Pinned by the test. */
  value: string
  /** What it means, in the shooter's terms. */
  means: string
}

/**
 * Every colour that carries meaning, and which side of the rule it is on.
 *
 * NOT EVERY TOKEN IN tokens.css. Greys, grounds, rules and text are neither
 * chrome nor data: they are the paper. This lists the ones that MEAN
 * something, because those are the ones the rule governs.
 */
export const COLOR_ROLES: readonly RoleAssignment[] = [
  {
    token: 'ocean',
    role: 'chrome',
    value: '#2dd4bf',
    means: 'The one accent. Setup, rings, pins, active state, the primary button.',
  },
  {
    token: 'accent',
    role: 'chrome',
    value: '#ffffff',
    means: 'Signal white. Primary action and active state, and nothing else.',
  },
  {
    token: 'sun',
    role: 'data',
    value: '#ffd54a',
    means: 'Where the light comes from. The current sun bearing.',
  },
  {
    token: 'tide',
    role: 'data',
    value: '#6cc4ff',
    means: 'The water. The tide curve and the glass mornings on the Tide sheet.',
  },
  {
    token: 'hazard',
    role: 'data',
    value: '#ff3b30',
    means: 'A hazard. Nothing else in the app is ever red.',
  },
  {
    token: 'moon',
    role: 'data',
    value: '#c4b5fd',
    means: 'The moon and the night. Its lines on the map and the time bar, its phase, the calendar night marks.',
  },
  {
    token: 'light-front',
    role: 'data',
    value: '#5fb98a',
    means: 'A coverage cone whose subject is front-lit.',
  },
  {
    token: 'light-side',
    role: 'data',
    value: '#5e9cc4',
    means: 'A coverage cone whose subject is side-lit.',
  },
  {
    token: 'light-back',
    role: 'data',
    value: '#d08a5a',
    means: 'A coverage cone shooting into the sun.',
  },
] as const

/** The role of a token, or null when it is paper rather than meaning. */
export function roleOf(token: string): ColorRole | null {
  return COLOR_ROLES.find((entry) => entry.token === token)?.role ?? null
}

/** The chrome teal, by name, for anything that needs to say it out loud. */
export const CHROME_TEAL = '#2dd4bf'

/**
 * THE RULE AS ONE SENTENCE, for the page that has to say it to a reader.
 *
 * Exported rather than retyped in the component, so the page and this file
 * cannot drift into two different rules.
 */
export const COLOR_RULE =
  'Teal is chrome: controls, pins and active states. Every other hue is data: ' +
  'amber is the sun, periwinkle the shadow, red a hazard, and a coverage cone ' +
  'takes the colour of its own light. A data colour never styles a control, ' +
  'and teal never styles a reading.'
