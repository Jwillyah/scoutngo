import {
  formatReach,
  positionForMeters,
  REACH_STOPS,
  SLIDER_MAX,
  snappedMetersAt,
  stopPositions,
} from '../core/reachScale.ts'

interface ReachSliderProps {
  meters: number
  onChange: (meters: number) => void
}

/**
 * How far the shooter can actually get from the venue.
 *
 * WHAT THIS REPLACED. A small circle sitting on the east edge of the ring, which
 * you were expected to notice, recognise as a control, and drag. It had no
 * label, no number, and no way of telling you it was a control at all. Three
 * unexplained things on one map is two too many.
 *
 * The ring on the map now only DISPLAYS this value. There is one way to change
 * it, it says what it is, and it reads out the answer in both units.
 */
export function ReachSlider({ meters, onChange }: ReachSliderProps) {
  const { metric, imperial } = formatReach(meters)
  const position = Math.round(positionForMeters(meters) * SLIDER_MAX)

  return (
    <div className="reach">
      <div className="reach__head">
        <label className="reach__label" htmlFor="reach-slider">
          How far can you get?
        </label>
        <output className="reach__out" htmlFor="reach-slider">
          <span className="reach__metric num">{metric}</span>
          <span className="reach__imperial num">{imperial}</span>
        </output>
      </div>

      <div className="reach__track">
        {/*
          * Tick marks at the stops. Unlabelled on purpose: the readout above
          * already carries the number, and five labels at 390px would either
          * overlap or shrink to the point of being decoration.
          */}
        <div className="reach__ticks" aria-hidden="true">
          {stopPositions().map((at, i) => (
            <span
              key={REACH_STOPS[i]}
              className="reach__tick"
              style={{ left: `${at * 100}%` }}
            />
          ))}
        </div>
        <input
          id="reach-slider"
          className="reach__slider"
          type="range"
          min={0}
          max={SLIDER_MAX}
          step={1}
          value={position}
          aria-valuetext={`${metric}, ${imperial}`}
          onChange={(event) => onChange(snappedMetersAt(Number(event.target.value) / SLIDER_MAX))}
        />
      </div>
    </div>
  )
}
