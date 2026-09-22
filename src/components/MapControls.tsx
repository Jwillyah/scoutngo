const PITCH_STOPS = [0, 45, 60]

interface MapControlsProps {
  showSun: boolean
  onShowSun: (next: boolean) => void
  pitch: number
  onPitch: (next: number) => void
  onFitAll: () => void
  canFitAll: boolean
}

/**
 * Thumb sized map controls. Tilt steps through 0, 45 and 60 degrees.
 *
 * NO ZOOM BUTTONS. Pinch does it, on every device this runs on, and a stacked
 * plus and minus was two 48px targets spent restating a gesture the map already
 * had. What is left is the three things a gesture cannot do: turn the sun
 * overlay off, step the tilt, and frame everything at once.
 */
export function MapControls({
  showSun,
  onShowSun,
  pitch,
  onPitch,
  onFitAll,
  canFitAll,
}: MapControlsProps) {
  const activeStop = PITCH_STOPS.reduce((best, stop) =>
    Math.abs(stop - pitch) < Math.abs(best - pitch) ? stop : best,
  )

  const nextStop = () => {
    const index = PITCH_STOPS.indexOf(activeStop)
    return PITCH_STOPS[(index + 1) % PITCH_STOPS.length]
  }

  return (
    <div className="mapctl">
      {/* Sun overlay on by default, one tap to get it out of the way. */}
      <button
        type="button"
        className={`mapctl__btn${showSun ? ' mapctl__btn--on' : ''}`}
        aria-pressed={showSun}
        onClick={() => onShowSun(!showSun)}
        aria-label={showSun ? 'Hide the sun overlay' : 'Show the sun overlay'}
      >
        <span className="mapctl__sun" aria-hidden="true">
          ☀
        </span>
      </button>

      <button
        type="button"
        className={`mapctl__btn${activeStop === 0 ? '' : ' mapctl__btn--on'}`}
        onClick={() => onPitch(nextStop())}
        aria-label={`Tilt, currently ${activeStop} degrees. Tap for ${nextStop()} degrees.`}
      >
        <span className="mapctl__tilt num">{activeStop}°</span>
      </button>

      <button
        type="button"
        className="mapctl__btn"
        onClick={onFitAll}
        disabled={!canFitAll}
        aria-label="Fit all positions and the subject"
      >
        <span className="mapctl__fit" aria-hidden="true">
          ⤢
        </span>
      </button>
    </div>
  )
}
