import { useMemo, useState } from 'react'
import { compassWord } from '../core/compassWords.ts'
import { bearingBetween, type LatLon } from '../core/geo.ts'
import { Receipt } from '../lib/numerals.tsx'
import { sunAimTimes } from '../core/sunInverse.ts'
import { formatClock } from '../core/timezone.ts'
import { Group } from './Panel.tsx'

interface SunSearchPanelProps {
  venue: LatLon | null
  /** The venue's zone, so every time shown is a venue wall clock. */
  timeZone: string | null
  timeZoneAbbr: string | null
  /**
   * A point tapped on the map to aim at, if there is one.
   *
   * The bearing is derived from it rather than typed, because "behind that
   * building" is the question people actually have and a bearing is the form
   * the arithmetic needs. Showing both is what makes the two the same thing.
   */
  target: LatLon | null
  onPickTarget: () => void
  picking: boolean
}

const DAY_MS = 86_400_000

/** How far ahead to look. Named spans, because a date picker is a form. */
const SPANS = [
  { label: '2 weeks', days: 14 },
  { label: '3 months', days: 90 },
  { label: '1 year', days: 365 },
] as const

/**
 * RUNNING THE SUN MATH BACKWARDS.
 *
 * The app could already say where the sun is at a given time. This asks the
 * inverse: what date and time does the sun sit on a given bearing from the
 * pin, or behind a thing pointed at.
 *
 * NO NEW DATA AND NO NETWORK. This is the suncalc already in the bundle,
 * sampled for sign changes and bisected. Everything is computed on the device
 * from the pin that is already there.
 */
export function SunSearchPanel({
  venue,
  timeZone,
  timeZoneAbbr,
  target,
  onPickTarget,
  picking,
}: SunSearchPanelProps) {
  const [bearingText, setBearingText] = useState('')
  const [tolerance, setTolerance] = useState(2)
  const [spanDays, setSpanDays] = useState<number>(90)
  const [altitudeText, setAltitudeText] = useState('')

  /*
   * A TAPPED POINT WINS OVER A TYPED BEARING, and the field shows the bearing
   * it implies. Two inputs for one number is a trap unless one of them is
   * visibly derived from the other.
   */
  const targetBearing = useMemo(
    () => (venue === null || target === null ? null : bearingBetween(venue, target)),
    [venue, target],
  )

  const typed = Number.parseFloat(bearingText)
  const bearing = targetBearing ?? (Number.isFinite(typed) ? typed : null)

  const altitudeWanted = Number.parseFloat(altitudeText)
  const altitude = Number.isFinite(altitudeWanted) ? altitudeWanted : null

  const hits = useMemo(() => {
    if (venue === null || (bearing === null && altitude === null)) return []
    const from = new Date()
    return sunAimTimes({
      at: venue,
      from,
      to: new Date(from.getTime() + spanDays * DAY_MS),
      bearing,
      bearingToleranceDeg: tolerance,
      altitudeDeg: altitude,
      altitudeToleranceDeg: 1,
      /* Fine enough to bracket every crossing; the bisection does the rest. */
      stepMinutes: 10,
      limit: 60,
    })
  }, [venue, bearing, altitude, tolerance, spanDays])

  const clock = (at: Date) =>
    timeZone === null ? at.toISOString().slice(11, 16) : formatClock(at, timeZone)
  const date = (at: Date) =>
    at.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: timeZone ?? 'UTC',
    })

  if (venue === null) {
    return (
      <Group title="When is the sun there">
        <p className="sunq__none">Set a venue first. The search is from its pin.</p>
      </Group>
    )
  }

  return (
    <div className="sunq">
      <Group title="Aim">
        <div className="sunq__aim">
          <button
            type="button"
            className={`act${picking ? ' act--armed' : ''}`}
            onClick={onPickTarget}
            aria-pressed={picking}
          >
            <span className="act__label">
              {picking ? 'Tap the map · cancel' : target === null ? 'Tap a thing to aim at' : 'Pick another point'}
            </span>
          </button>

          <label className="sunq__field">
            <span className="sunq__label">Or a bearing</span>
            <input
              className="sunq__input num"
              type="number"
              min={0}
              max={360}
              step={0.1}
              inputMode="decimal"
              value={targetBearing === null ? bearingText : targetBearing.toFixed(1)}
              disabled={targetBearing !== null}
              placeholder="254.1"
              onChange={(event) => setBearingText(event.target.value)}
            />
            <span className="sunq__unit">°</span>
          </label>
        </div>

        {targetBearing === null ? null : (
          <p className="sunq__derived">
            {/*
              * THE INPUT KEEPS ITS DEGREES EITHER WAY. You cannot type into a
              * field that is not there, and this panel is the one place in the
              * app where a bearing IS the question rather than the receipt.
              * What is hidden is this derived restatement of it.
              */}
            That point is {compassWord(targetBearing)} of the pin
            <Receipt kind="bearing">
              , on bearing <span className="num">{targetBearing.toFixed(1)}°</span>
            </Receipt>
            . The search is the same either way.
          </p>
        )}

        <div className="sunq__knobs">
          <label className="sunq__field">
            <span className="sunq__label">Within</span>
            <input
              className="sunq__input num"
              type="number"
              min={0.1}
              max={15}
              step={0.1}
              inputMode="decimal"
              value={tolerance}
              onChange={(event) => setTolerance(Number(event.target.value))}
            />
            <span className="sunq__unit">°</span>
          </label>

          <label className="sunq__field">
            <span className="sunq__label">Altitude</span>
            <input
              className="sunq__input num"
              type="number"
              min={-18}
              max={90}
              step={0.5}
              inputMode="decimal"
              value={altitudeText}
              placeholder="any"
              onChange={(event) => setAltitudeText(event.target.value)}
            />
            <span className="sunq__unit">°</span>
          </label>
        </div>

        <div className="sunq__spans">
          {SPANS.map((span) => (
            <button
              key={span.days}
              type="button"
              className={`chip${spanDays === span.days ? ' chip--on' : ''}`}
              aria-pressed={spanDays === span.days}
              onClick={() => setSpanDays(span.days)}
            >
              {span.label}
            </button>
          ))}
        </div>
      </Group>

      <Group title="When" meta={hits.length === 0 ? undefined : `${hits.length}`}>
        {bearing === null && altitude === null ? (
          <p className="sunq__none">Pick a point or type a bearing.</p>
        ) : hits.length === 0 ? (
          /*
           * AN EMPTY RESULT IS A REAL ANSWER, not a failure. At this latitude
           * the sun may simply never reach that bearing above the horizon, and
           * saying so is more use than an empty list.
           */
          <p className="sunq__none">
            The sun does not reach{' '}
            {bearing === null ? `${altitude}°` : `${bearing.toFixed(1)}°`} from this pin in the next{' '}
            {SPANS.find((s) => s.days === spanDays)?.label ?? `${spanDays} days`}
            {altitude === null ? ', with the sun above the horizon' : ''}. Widen the tolerance or
            the range.
          </p>
        ) : (
          <ul className="sunq__hits">
            {hits.map((hit) => (
              <li key={hit.at.toISOString()} className="sunq__hit">
                <span className="sunq__date">{date(hit.at)}</span>
                <span className="sunq__time num">{clock(hit.at)}</span>
                {/*
                  * The window, when it is wider than the minute shown. The
                  * exact moment is the answer; the window is how much slack
                  * there is around it, which is what decides whether it is
                  * worth driving to.
                  */}
                <span className="sunq__window num">
                  {clock(hit.from)}–{clock(hit.to)}
                </span>
                <Receipt kind="solar">
                  <span className="sunq__alt num">{hit.altitude.toFixed(1)}° up</span>
                </Receipt>
                {timeZoneAbbr === null ? null : (
                  <span className="sunq__zone">{timeZoneAbbr}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Group>
    </div>
  )
}
