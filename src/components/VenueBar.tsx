/*
 * THE VENUE BAR: WHERE YOU ARE, WHEN, AND THE ONE WAY INTO SETTINGS.
 *
 * Shaped like a search field because that is what it is the shape of in every
 * map app anybody has used: a rounded bar at the top of the map carrying the
 * place, with the account control at the right end.
 *
 * THE ROUND BUTTON IS THE ONLY DOOR TO SETTINGS, deliberately. The bottom nav
 * is three stages and gets no fourth slot: a settings tab would be a
 * permanent quarter of the primary navigation spent on something opened twice
 * a year. Maps puts the avatar here and so does this.
 */

interface VenueBarProps {
  /** Already resolved. Never a stale name: see src/core/venueName.ts. */
  venueName: string
  /** The shoot date, short. */
  dateLabel: string
  onAbout: () => void
  /** The initial on the button, or null for a generic glyph. */
  initial: string | null
}

export function VenueBar({ venueName, dateLabel, onAbout, initial }: VenueBarProps) {
  return (
    <div className="vbar">
      <svg className="vbar__pin" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M8 1.5c2.5 0 4.5 2 4.5 4.5 0 3.2-4.5 8.5-4.5 8.5S3.5 9.2 3.5 6c0-2.5 2-4.5 4.5-4.5z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <circle cx="8" cy="6" r="1.6" fill="currentColor" />
      </svg>

      {/*
        * THE NAME ONLY. "Brew River Dock Bar, Salisbury MD" plus a date plus
        * an avatar does not fit 390px, and what it did instead of not
        * fitting was ellipsise inside the town: "…, Salisbury M…". The town
        * is on the shoot card, where there is room for it. See
        * src/lib/venueParts.ts.
        */}
      <span className="vbar__name">{venueName}</span>
      <span className="vbar__date num">{dateLabel}</span>

      {/*
        * A FILLED DISC, NOT AN OUTLINE.
        *
        * It was a 34px ring in the line colour holding a middot, which on a
        * dark bar over satellite imagery was very nearly invisible -- the
        * one control on this bar, and the only door to settings, reading as
        * a smudge. Filled in the chrome accent with a dark initial, which is
        * the account button in every map app and the one place in this
        * screen where a solid accent disc is right: it is chrome you press,
        * not data you read.
        */}
      <button type="button" className="vbar__about" onClick={onAbout} aria-label="About and settings">
        {initial ?? '·'}
      </button>
    </div>
  )
}
