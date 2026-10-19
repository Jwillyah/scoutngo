import { positionInWindow } from '../core/tide.ts'
import { formatClock } from '../core/timezone.ts'
import type { PhaseSpan } from '../core/nightWindow.ts'

/*
 * THE TIME CONTROL, AS ONE ROW.
 *
 * WHAT THIS REPLACED. A 250px black panel at the top of every sheet holding a
 * clock, two receipts in degrees, a row of tide-turn tags, a twilight band, a
 * range input with its own track, and a Part 107 requirements block. On the
 * wind card it was larger than the wind. On About it pushed the copy off the
 * bottom of the screen.
 *
 * IT SHRINKS, IT DOES NOT DISAPPEAR. Everything downstream -- the sun rays,
 * every cone's lighting colour, the wind profile, the tide level -- is
 * computed at the scrubbed moment, so the control that sets that moment has
 * to be on screen wherever those readings are. It is 34px now.
 *
 * ONE RAIL DOES BOTH JOBS. There were two bars: a twilight gradient showing
 * where day, civil twilight and night fall across the window, and below it a
 * range input drawing its own grey track. Two bars for one axis, and the
 * thumb was on the one carrying no information. The gradient IS the track
 * now, and the thumb rides on it, so the shooter can see at a glance that
 * 18:40 is inside civil twilight rather than inferring it from two bars that
 * happen to be the same width.
 *
 * WHAT CAME OFF IT, AND WHERE EACH PIECE WENT:
 *
 *   AZ AND ALT, the two receipts in degrees. Deleted, not moved: the light
 *   card already prints both, from the same core call, with a compass point
 *   and an above/below-horizon word beside them. Two places rendering one
 *   fact is shape A in docs/failure-modes.md, and this was it -- one of them
 *   to one decimal, the other to none.
 *
 *   THE PART 107 REQUIREMENTS, which say anti-collision lighting is needed
 *   from sunset and 107.65 night training from dusk. Moved to the light card
 *   whole. They are a statement about the phase, the light card is the card
 *   about the phase, and a regulatory requirement is the last thing in this
 *   app that may be quietly dropped to save pixels.
 *
 *   THE TIDE TURN TAGS, HW and LW on the track. Off. At 3px a tag has no
 *   room to sit and an untagged tick on a rail is a mystery; the tide card
 *   names the next turn with its height and its clock time.
 */

interface TimeStripProps {
  start: Date
  end: Date
  /** 0 at the start of the window, 1 at the end. */
  value: number
  onChange: (next: number) => void
  at: Date
  /** The venue's IANA zone. Every time on this strip is a venue wall clock. */
  timeZone: string
  /** Short form of that zone, "EDT", so the hour is never a guess. */
  timeZoneAbbr: string
  /**
   * DAY, CIVIL TWILIGHT AND NIGHT ACROSS THE WINDOW. The rail is painted from
   * these; with none of them it is a plain track and still scrubs.
   */
  phases: PhaseSpan[]
}

export function TimeStrip({
  start,
  end,
  value,
  onChange,
  at,
  timeZone,
  timeZoneAbbr,
  phases,
}: TimeStripProps) {
  /*
   * Bands as a share of the rail, clipped to it. positionInWindow already
   * answers "where on this bar" for an instant, and a band is the same
   * question asked of two instants instead of one.
   */
  const span = end.getTime() - start.getTime()
  const bands =
    span <= 0
      ? []
      : phases
          .map((p) => ({
            phase: p.phase,
            left: Math.max(0, (p.start.getTime() - start.getTime()) / span),
            right: Math.min(1, (p.end.getTime() - start.getTime()) / span),
          }))
          .filter((b) => b.right > b.left)

  /*
   * THE THUMB SITS WHERE THE CLOCK IS, not where the slider's value is.
   *
   * They are the same number today and they are reached differently: `value`
   * is what the input holds, and this is where `at` falls in the window. If
   * a future scrub ever sets the time by any route other than this input --
   * a tap on the curve, a jump to golden hour -- the thumb follows the clock,
   * which is the fact, rather than the control, which is one way of setting
   * it.
   */
  const thumbShare = positionInWindow(at, start, end) ?? value

  return (
    <div className="tstrip">
      <span className="tstrip__time num">{formatClock(at, timeZone)}</span>
      <span className="tstrip__zone">{timeZoneAbbr}</span>

      <span className="tstrip__rail">
        {bands.map((band) => (
          <span
            key={`${band.phase}-${band.left}`}
            className={`tstrip__band tstrip__band--${band.phase}`}
            style={{ left: `${band.left * 100}%`, width: `${(band.right - band.left) * 100}%` }}
            aria-hidden="true"
          />
        ))}

        <span
          className="tstrip__thumb"
          style={{ left: `${thumbShare * 100}%` }}
          aria-hidden="true"
        />

        {/*
          * THE REAL CONTROL IS A RANGE INPUT, LAID OVER THE RAIL AND INVISIBLE.
          *
          * Drawing a thumb and handling pointer events by hand would give up
          * the keyboard, the screen reader and the platform's own hit slop
          * for a 13px target, all to avoid one line of CSS. The input carries
          * the semantics and the gesture; the span above carries the look.
          *
          * IT COVERS THE RAIL AND NOT THE STRIP. A full-width input across
          * the top of the sheet would swallow the sheet's own drag -- see the
          * gesture-deadlock note in BottomSheet.tsx, where exactly this cost
          * the elevation curve every way out of HALF. The clock and the zone
          * to its left stay draggable.
          */}
        <input
          className="tstrip__range"
          type="range"
          min={0}
          max={1000}
          value={Math.round(value * 1000)}
          aria-label="Time through the window"
          aria-valuetext={`${formatClock(at, timeZone)} ${timeZoneAbbr}`}
          onChange={(event) => onChange(Number(event.target.value) / 1000)}
        />
      </span>
    </div>
  )
}
