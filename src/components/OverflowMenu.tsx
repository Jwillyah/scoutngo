import { GOES_BAND_LABEL, goesBandFor } from '../core/goes.ts'

interface OverflowMenuProps {
  showArc: boolean
  onShowArc: (next: boolean) => void
  /** The GOES-19 cloud layer. */
  showSky: boolean
  onShowSky: (next: boolean) => void
  /** Sun altitude, so the button can say WHICH band it will show. */
  sunAltitude: number | null
}

/**
 * The map options that are preferences rather than actions.
 *
 * WHAT THIS USED TO BE. "Set venue by tap" and "Set subject by tap", which
 * existed because there were two pins and both could be moved. There is one pin
 * now: it is the thing being shot, and the only other thing on the map is a
 * position, which is moved by dragging it. Nothing here offers to move
 * anything, so the modes went with the second pin.
 */
export function OverflowMenu({
  showArc,
  onShowArc,
  showSky,
  onShowSky,
  sunAltitude,
}: OverflowMenuProps) {
  /*
   * THE BUTTON SAYS WHICH BAND IT WILL SHOW, because the answer changes
   * through a sunrise and the two pictures look nothing alike. Visible is
   * black before dawn and infrared is a greyscale temperature map, so
   * somebody who taps this at 05:40 and gets infrared should have been told
   * that is what they were getting.
   */
  const band = sunAltitude === null ? null : goesBandFor(sunAltitude)

  return (
    <>
      <button
        type="button"
        className={`mode${showArc ? ' mode--on' : ''}`}
        aria-pressed={showArc}
        onClick={() => onShowArc(!showArc)}
      >
        Sun arc
      </button>
      <button
        type="button"
        className={`mode${showSky ? ' mode--on' : ''}`}
        aria-pressed={showSky}
        onClick={() => onShowSky(!showSky)}
        title="GOES-19 cloud over the map"
      >
        Sky{band === null ? '' : ` · ${GOES_BAND_LABEL[band].toLowerCase()}`}
      </button>
    </>
  )
}
