const PITCH_STOPS = [0, 45, 60]

interface MapControlsProps {
  pitch: number
  onPitch: (next: number) => void
  onZoom: (delta: number) => void
  onFitAll: () => void
  canFitAll: boolean
}

/** Thumb sized map controls. Tilt steps through 0, 45 and 60 degrees. */
export function MapControls({ pitch, onPitch, onZoom, onFitAll, canFitAll }: MapControlsProps) {
  const activeStop = PITCH_STOPS.reduce((best, stop) =>
    Math.abs(stop - pitch) < Math.abs(best - pitch) ? stop : best,
  )

  const nextStop = () => {
    const index = PITCH_STOPS.indexOf(activeStop)
    return PITCH_STOPS[(index + 1) % PITCH_STOPS.length]
  }

  return (
    <div className="mapctl">
      <button
        type="button"
        className={`mapctl__btn${activeStop === 0 ? '' : ' mapctl__btn--on'}`}
        onClick={() => onPitch(nextStop())}
        aria-label={`Tilt, currently ${activeStop} degrees. Tap for ${nextStop()} degrees.`}
      >
        <span className="mapctl__tilt num">{activeStop}°</span>
      </button>

      <div className="mapctl__stack">
        <button
          type="button"
          className="mapctl__btn"
          onClick={() => onZoom(1)}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className="mapctl__btn"
          onClick={() => onZoom(-1)}
          aria-label="Zoom out"
        >
          −
        </button>
      </div>

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
