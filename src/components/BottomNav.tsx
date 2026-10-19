import type { ReactNode } from 'react'
import { MODES, modeIndex, type Mode } from '../lib/mode.ts'

/*
 * THE BOTTOM NAV: MAP · PLAN · FIELD. NAVIGATION, NOT A PROGRESS BAR.
 *
 * WHAT CHANGED, AND IT IS THE WHOLE POINT. This was a stepper: steps read
 * left to right, a step you had not "earned" was disabled with a title
 * explaining why, and forward was a separate primary button because forward
 * was supposed to feel like finishing something.
 *
 * It is navigation now. ANY STAGE FROM ANY STAGE, AT ANY TIME. Somebody
 * standing in a car park wanting to look at the map does not want to be told
 * they have not finished Setup; the app's job there is to show them the map.
 * A screen that is empty because the work has not been done yet says so in
 * its own content, which is a better place for it than a disabled tab.
 *
 * EXACTLY THREE, AND SETTINGS DOES NOT GET A FOURTH. A settings tab would
 * spend a permanent quarter of the primary navigation on something opened
 * twice a year. It lives behind the round button on the venue bar, which is
 * where the account control sits in every map app.
 *
 * ICON OVER A SHORT LABEL. The label is not decoration: three unlabelled
 * glyphs is a quiz, and this is read in sunlight by somebody in a hurry.
 */

/** Drawn, not emoji: a glyph has to be legible at 20px on a dark ground. */
const ICONS: Record<Mode, ReactNode> = {
  setup: (
    <path
      d="M2.5 5.5 7.5 3.2l5 2.3 5-2.3v11.3l-5 2.3-5-2.3-5 2.3z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  ),
  plan: (
    <>
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 10 14 6.5M10 10l-3 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
    </>
  ),
  field: (
    <path
      d="M10 2.5v15M3.5 7.5 10 2.5l6.5 5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  ),
}

/** The nav's own words. "Setup" is the map you set the pin on, so: MAP. */
const NAV_LABEL: Record<Mode, string> = {
  setup: 'MAP',
  plan: 'PLAN',
  field: 'FIELD',
}

interface BottomNavProps {
  mode: Mode
  onMode: (next: Mode) => void
}

export function BottomNav({ mode, onMode }: BottomNavProps) {
  const current = modeIndex(mode)

  return (
    <nav className="bnav" aria-label="Stage">
      {MODES.map((item, index) => (
        <button
          type="button"
          key={item.id}
          className={`bnav__btn${index === current ? ' bnav__btn--on' : ''}`}
          aria-current={index === current ? 'page' : undefined}
          onClick={() => onMode(item.id)}
        >
          <svg className="bnav__icon" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            {ICONS[item.id]}
          </svg>
          <span className="bnav__label">{NAV_LABEL[item.id]}</span>
        </button>
      ))}
    </nav>
  )
}
