import { useCallback, useRef, useState } from 'react'

/*
 * THE RAIL: the only thing left floating over the map besides the sheet.
 *
 * THE RULE, AND IT HAS NO EXCEPTIONS. A control is in the rail only if it acts
 * on the map IMMEDIATELY and opens NO surface. Four qualify:
 *
 *   sun overlay   a toggle, draws or stops drawing, nothing to read
 *   pitch reset   one tap back to flat, with the current angle on the face
 *   locate        asks for a fix and moves the camera
 *   fit all       frames the plan
 *
 * LAYERS IS NOT HERE, and it is the test of the rule rather than an oversight.
 * It is a small control by any visual measure and it has CONTENT: a list of
 * toggles with states and explanations. Content lives in the sheet. The moment
 * this rail takes something with content it becomes the two-rows-of-pills it
 * replaced, one control at a time.
 *
 * WORD PILLS BECAME ICONS, so the rail is 40px wide instead of a third of the
 * screen. The cost of an icon is that it has to be learned, which is paid for
 * two ways: every button carries an aria-label that says what it does, and a
 * long press shows that same text on screen for anyone who is not using a
 * screen reader and does not recognise the glyph.
 */

const LONG_PRESS_MS = 400

interface MapRailProps {
  showSun: boolean
  onShowSun: (next: boolean) => void
  /** Current pitch, shown on the face so the reset says what it will undo. */
  pitch: number
  onResetPitch: () => void
  onLocate: () => void
  locating: boolean
  onFitAll: () => void
  canFitAll: boolean
}

export function MapRail({
  showSun,
  onShowSun,
  pitch,
  onResetPitch,
  onLocate,
  locating,
  onFitAll,
  canFitAll,
}: MapRailProps) {
  /** Which button is showing its text label, from a long press. */
  const [named, setNamed] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  const hold = useCallback((id: string) => {
    timer.current = window.setTimeout(() => setNamed(id), LONG_PRESS_MS)
  }, [])

  const release = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    setNamed(null)
  }, [])

  const button = (
    id: string,
    label: string,
    glyph: string,
    onClick: () => void,
    opts: { on?: boolean; disabled?: boolean; face?: string } = {},
  ) => (
    <div className="rail2__slot">
      <button
        type="button"
        className={`rail2__btn${opts.on === true ? ' rail2__btn--on' : ''}`}
        aria-label={label}
        aria-pressed={opts.on}
        disabled={opts.disabled === true}
        onClick={onClick}
        onPointerDown={() => hold(id)}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
      >
        <span className="rail2__glyph" aria-hidden="true">
          {opts.face ?? glyph}
        </span>
      </button>
      {/*
        * THE LABEL A LONG PRESS REVEALS. aria-hidden because the button
        * already carries the same words as its accessible name, and a screen
        * reader hearing them twice is worse than not hearing them here.
        */}
      {named === id ? (
        <span className="rail2__name" aria-hidden="true">
          {label}
        </span>
      ) : null}
    </div>
  )

  return (
    <nav className="rail2" aria-label="Map controls">
      {button(
        'sun',
        showSun ? 'Hide the sun overlay' : 'Show the sun overlay',
        '☀',
        () => onShowSun(!showSun),
        { on: showSun },
      )}

      {/*
        * THE FACE IS THE CURRENT ANGLE, so the button says what it is about to
        * undo. At 0 it is already flat, so there is nothing to reset and it
        * reads as the state rather than an action.
        */}
      {button(
        'pitch',
        pitch < 1 ? 'Tilt is flat' : `Reset tilt from ${Math.round(pitch)} degrees to flat`,
        '△',
        onResetPitch,
        { on: pitch >= 1, disabled: pitch < 1, face: `${Math.round(pitch)}°` },
      )}

      {button(
        'locate',
        locating ? 'Finding your location' : 'Centre the map on your location',
        '◉',
        onLocate,
        { on: locating },
      )}

      {button('fit', 'Fit all positions and the subject', '⤢', onFitAll, {
        disabled: !canFitAll,
      })}
    </nav>
  )
}
