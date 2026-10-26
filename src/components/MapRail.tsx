import { useCallback, useRef, useState, type ReactNode } from 'react'

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
  /** Whether the 3D clay model is showing instead of the 2D map. */
  threeD: boolean
  onThreeD: () => void
  /** Why 3D cannot open here, said beside the button, or null. */
  threeDNote: string | null
  /** The map's rotation, so the compass needle points at real north. */
  bearing: number
  /** Whether the map is turning with the phone's heading. */
  heading: boolean
  onCompass: () => void
  /** Two-pin measure: on while the next taps drop pins. */
  measuring: boolean
  onMeasure: () => void
}

export function MapRail({
  threeD,
  onThreeD,
  threeDNote,
  bearing,
  heading,
  onCompass,
  measuring,
  onMeasure,
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
    glyph: ReactNode,
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
      {/*
        * LAYERS, TILT, LOCATE. Three, and layers is first because it is the
        * one people reach for.
        *
        * LAYERS IS IN THE RAIL NOW, AND IT WAS DELIBERATELY NOT BEFORE. The
        * old rule was "a control is in the rail only if it opens NO surface",
        * and layers has content, so it lived in the sheet. That rule was
        * right when the sheet was one scrolling page: putting layers in the
        * rail then meant a fifth section. The sheet shows ONE CARD now, so
        * opening layers is replacing the card rather than stacking a surface,
        * and the thing the old rule protected against cannot happen.
        */}
      {/*
        * STACKED PLANES, NOT A HAMBURGER.
        *
        * It was \u2630, the trigram -- three equal bars, which is the glyph
        * for "menu" in every app that has one. This button does not open a
        * menu; it opens the layer tiles. Every map application draws this
        * control as two sheets seen in perspective, one over the other,
        * because that is what a layer is, and a shooter looking for layers
        * scans for that shape rather than reading the rail.
        */}
      {/*
        * THE COMPASS. The needle points at real north whichever way the map is
        * turned. A tap turns the map with the phone's heading; another puts
        * north back at the top.
        */}
      {button(
        'compass',
        heading ? 'Turning with you. Tap for north up' : 'Turn the map with your heading',
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <g transform={`rotate(${-bearing} 10 10)`}>
            <path d="M10 2.5 12.6 10H7.4z" fill="currentColor" />
            <path d="M10 17.5 7.4 10h5.2z" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </g>
        </svg>,
        onCompass,
        { on: heading },
      )}

      {/* 2D OR 3D, said on the face. 3D is the clay model of the same place at the same time. */}
      {button(
        'tilt',
        threeD ? 'Back to the 2D map' : 'Open the 3D clay model',
        null,
        onThreeD,
        { on: threeD, face: threeD ? '2D' : '3D' },
      )}
      {threeDNote === null ? null : <p className="rail2__note">{threeDNote}</p>}

      {/* Layers moved to the tool dock: one Layers button on screen, not two. */}
      {button(
        'measure',
        measuring ? 'Stop measuring' : 'Measure between two points',
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <path
            d="M3 13.5 13.5 3l3.5 3.5L6.5 17z M6 10.5l1.5 1.5 M8.5 8l2 2 M11 5.5l1.5 1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>,
        onMeasure,
        { on: measuring },
      )}

    </nav>
  )
}
