import { useCallback, useEffect, useMemo, useState } from 'react'
import { getMoonIllumination, getMoonTimes } from 'suncalc'
import { deviceTimeZone, formatClock } from '../core/timezone.ts'
import type { LatLon } from '../core/geo.ts'
import type { KitProfile } from '../core/kit.ts'
import { SENSORS } from '../core/fov.ts'
import { npfForCamera, startingExposure, STARTING_EXPOSURE_LABEL } from '../core/exposure.ts'
import { skyEventIcs, skyEventIcsFilename } from '../core/ics.ts'
import { SKY_EVENT_DAYS, upcomingSkyEvents, type SkyEvent } from '../core/skyEvents.ts'
import {
  cloudForWindow,
  skyDarknessAt,
  skyWindow,
  windowMinutes,
  type CloudHour,
  type CloudOverWindow,
  type HorizonInput,
  type SkyWindowResult,
} from '../core/skyWindow.ts'
import { fetchNightCloud } from '../lib/forecast.ts'

/*
 * SKY: WHAT IS HAPPENING OVERHEAD AT THIS VENUE, AND WHEN IT IS SHOOTABLE.
 *
 * THIS SECTION ABSORBED "SUN WHEN" RATHER THAN SITTING BESIDE IT. They are
 * the same question at two scales: where is a thing in the sky from this
 * venue, and when. Sun When asked it about today and about the sun; this asks
 * it about the next ninety days and about everything else. Two sections would
 * have meant a shooter checking two places for one answer, and a sixth section
 * in a sheet that is already five deep.
 *
 * Sun When is the first row and still does exactly what it did.
 *
 * NO MODEL CALL ANYWHERE IN HERE, and no network beyond the cloud forecast
 * that the app already had. Every date, every radiant, every time and every
 * exposure on this panel is arithmetic out of src/core.
 *
 * WHAT IT NEVER SAYS. No row says a night will be clear, or good, or worth the
 * drive. Rows state what is happening; the window block states the constraints
 * that produced the times; cloud is shown only where the forecast reaches and
 * says so where it does not.
 */

interface SkyPanelProps {
  venue: LatLon | null
  /** The venue's zone, so every time here is a venue wall clock. */
  timeZone: string | null
  timeZoneAbbr: string | null
  /** The skyline from the DEM, or a flat horizon. Never a silent mix. */
  horizon: HorizonInput
  kit: KitProfile
  /** Sun When, unchanged, as the first row of this list. */
  /** Today, injected so the listing is testable and does not drift mid-render. */
  now: Date
}

const MINUTE_LABEL = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours === 0 ? `${rest}m` : `${hours}h ${String(rest).padStart(2, '0')}m`
}

export function SkyPanel({
  venue,
  timeZone,
  timeZoneAbbr,
  horizon,
  kit,
  now,
}: SkyPanelProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  /*
   * CLOUD IS FETCHED FOR THE OPEN ROW ONLY, and only once.
   *
   * A ninety day listing is tens of rows and the forecast reaches about two
   * weeks, so asking for all of them would be mostly requests for nights the
   * service cannot answer. Asking when a row is opened is asking when somebody
   * wants to know.
   */
  const [cloudByEvent, setCloudByEvent] = useState<Record<string, readonly CloudHour[]>>({})
  const [cloudFailed, setCloudFailed] = useState<Record<string, string>>({})

  const clock = useCallback(
    (at: Date): string => formatClock(at, timeZone ?? deviceTimeZone()),
    [timeZone],
  )

  const dayLabel = useCallback(
    (at: Date): string =>
      at.toLocaleDateString('en-US', {
        ...(timeZone === null ? {} : { timeZone }),
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
    [timeZone],
  )

  /*
   * THE WINDOW FOR A ROW, COMPUTED ON DEMAND.
   *
   * Not for every row up front: ninety days is tens of rows and each one
   * samples a whole night a minute at a time. The list only needs the date and
   * the name; the window is computed when a row is opened, which is when the
   * shooter has asked for it.
   */
  const windowFor = useCallback(
    (event: SkyEvent): SkyWindowResult | null => {
      if (event.target === null) return null
      return skyWindow({
        target: event.target,
        at: venue === null ? null : { lat: venue.lat, lon: venue.lon },
        eveningOf: event.eveningOf,
        horizon,
      })
    },
    [venue, horizon],
  )

  const events = useMemo(() => {
    if (venue === null) return []
    return upcomingSkyEvents({
      from: now,
      days: SKY_EVENT_DAYS,
      illumination: (at) => getMoonIllumination(at).fraction,
      moonrise: (at) => {
        const times = getMoonTimes(at, venue.lat, venue.lon)
        return times.rise instanceof Date && !Number.isNaN(times.rise.getTime())
          ? times.rise
          : null
      },
      milkyWayShootable: (eveningOf) =>
        skyWindow({
          target: { kind: 'milkyway' },
          at: { lat: venue.lat, lon: venue.lon },
          eveningOf,
          horizon,
        }).kind === 'window',
    })
  }, [venue, horizon, now])

  /*
   * THE KIT LINE. Only the lenses that are actually in the profile, each named,
   * each with its own NPF time because NPF depends on the focal length and on
   * the body's pixel pitch. A lens with no recorded aperture gets the reason,
   * not a number, and the reason names the lens.
   */
  const kitLines = useMemo(() => {
    const body = kit.bodies.find((b) => b.role === 'photo') ?? kit.bodies[0]
    if (body === undefined) return []
    return kit.lenses.map((lens) => {
      const answer = npfForCamera({
        bodyName: body.name,
        sensorWidthMm: SENSORS[body.sensor].w,
        horizontalPixels: body.horizontalPixels,
        lensName: lens.name,
        aperture: lens.maxAperture,
        focalLength: lens.minFocalLength,
      })
      return { lens: lens.name, focalLength: lens.minFocalLength, answer, body: body.name }
    })
  }, [kit])

  /*
   * FETCH THE OPEN ROW'S CLOUD. The window has to exist before there is a
   * night to ask about, so this runs off the open row rather than off the
   * listing, and records a failure as a REASON rather than as no cloud.
   */
  useEffect(() => {
    if (openId === null || venue === null || timeZone === null) return
    if (cloudByEvent[openId] !== undefined || cloudFailed[openId] !== undefined) return
    const event = events.find((e) => e.id === openId)
    if (event === undefined || event.target === null) return
    const result = skyWindow({
      target: event.target,
      at: { lat: venue.lat, lon: venue.lon },
      eveningOf: event.eveningOf,
      horizon,
    })
    if (result.kind !== 'window') return

    let live = true
    void fetchNightCloud(venue, result.window.start, result.window.end, timeZone).then(
      (answer) => {
        if (!live) return
        if (answer.status === 'ok') {
          setCloudByEvent((current) => ({ ...current, [openId]: answer.hours }))
        } else {
          setCloudFailed((current) => ({ ...current, [openId]: answer.reason }))
        }
      },
    )
    return () => {
      live = false
    }
  }, [openId, venue, timeZone, horizon, events, cloudByEvent, cloudFailed])

  const onIcs = useCallback(
    (event: SkyEvent, result: SkyWindowResult, lines: readonly string[]) => {
      if (result.kind !== 'window') return
      const text = skyEventIcs({
        from: result.window.start,
        to: result.window.end,
        title: `${event.name} — ${event.kind === 'shower' ? 'meteor window' : 'sky window'}`,
        constraintLines: lines,
        horizonSource: result.horizonSource,
        kitLines: kitLines.map((row) =>
          row.answer.kind === 'seconds'
            ? `${row.lens} at ${row.focalLength}mm: NPF ${row.answer.seconds.toFixed(1)}s on the ${row.body}.`
            : `${row.lens}: ${row.answer.reason}.`,
        ),
        stamp: new Date(),
        uid: `${event.id}@scoutngo.local`,
      })
      /*
       * STRAIGHT TO THE FILE SYSTEM, nowhere else. A Blob and an object URL
       * handed to the OS once and revoked. No account, no upload, and the
       * venue coordinate never leaves the device: it is not in the file.
       */
      const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = skyEventIcsFilename(event.name, result.window.start)
      link.click()
      URL.revokeObjectURL(url)
    },
    [kitLines],
  )

  if (venue === null) {
    return <p className="skyev__none">Set the venue and this fills in. Nothing here is guessed.</p>
  }

  return (
    <div className="skyev">
      {/*
        * SUN TODAY HAS MOVED TO THE LIGHT CARD.
        *
        * It was the first row here: a disclosure headed "Where the sun is
        * from here, and when", holding the bearing search. It is a question
        * about the sun's position today, and this card is a list of what the
        * sky does over the next thirty nights plus the cameras pointed at it
        * right now. Three subjects on one surface, and this card was the
        * tallest in the app at 94% of the two-viewport limit because of it.
        *
        * The light card is about the sun. That is where the question goes.
        */}
      <p className="skyev__lead">
        The next {SKY_EVENT_DAYS} days at this venue, computed from published tables. Peak dates
        shift up to a day from year to year, so every shower is offered as two nights.
      </p>

      {events.length === 0 ? (
        <p className="skyev__none">Nothing in the tables falls in the next {SKY_EVENT_DAYS} days.</p>
      ) : null}

      {events.map((event) => {
        const open = openId === event.id
        const result = open ? windowFor(event) : null
        return (
          <div className={`skyev__row skyev__row--${event.kind}`} key={event.id}>
            <button
              type="button"
              className="skyev__head"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : event.id)}
            >
              <span className="skyev__name">{event.name}</span>
              <span className="skyev__when num">{dayLabel(event.eveningOf)}</span>
              <span className="skyev__why">{event.note}</span>
            </button>

            {!open ? null : (
              <div className="skyev__body">
                {result === null ? (
                  <p className="skyev__reason">
                    This is a note about the season, not a shoot, so there is no window to compute.
                  </p>
                ) : result.kind === 'unknown' || result.kind === 'none' ? (
                  <p className="skyev__reason">{result.reason}</p>
                ) : (
                  <WindowBlock
                    result={result}
                    clock={clock}
                    zone={timeZoneAbbr}
                    cloudHours={cloudByEvent[event.id] ?? []}
                    cloudReason={cloudFailed[event.id] ?? null}
                    kitLines={kitLines}
                    venue={venue}
                    onIcs={(lines) => onIcs(event, result, lines)}
                  />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface KitLine {
  lens: string
  focalLength: number
  body: string
  answer: ReturnType<typeof npfForCamera>
}

function WindowBlock({
  result,
  clock,
  zone,
  cloudHours,
  cloudReason,
  kitLines,
  venue,
  onIcs,
}: {
  result: Extract<SkyWindowResult, { kind: 'window' }>
  clock: (at: Date) => string
  zone: string | null
  cloudHours: readonly CloudHour[]
  /** Why there is no cloud, when the fetch itself failed. Never silence. */
  cloudReason: string | null
  kitLines: readonly KitLine[]
  venue: LatLon
  onIcs: (lines: readonly string[]) => void
}) {
  const { constraints } = result

  const because = (which: 'target' | 'dark' | 'moon'): string =>
    which === 'dark'
      ? 'the sky'
      : which === 'moon'
        ? 'the moon'
        : 'the target'

  /*
   * EVERY CONSTRAINT, PRINTED SEPARATELY. The window alone is a number with no
   * provenance; the three lines above it are what a shooter actually plans
   * against, and the binding one is said in words rather than left to be
   * inferred from which times happen to match.
   */
  const lines = [
    constraints.targetUp === null
      ? 'Target up: not during the dark'
      : `Target clears the horizon ${clock(constraints.targetUp.start)}`,
    constraints.moonDown === null
      ? 'Moon: not a constraint for this target'
      : `Moon down ${clock(constraints.moonDown.start)} to ${clock(constraints.moonDown.end)}`,
    constraints.astronomicalDark === null
      ? 'Astronomical dark: none tonight'
      : `Astronomical dark ${clock(constraints.astronomicalDark.start)} to ${clock(constraints.astronomicalDark.end)}`,
  ]

  const cloud: CloudOverWindow =
    cloudReason === null
      ? cloudForWindow(cloudHours, result.window)
      : { kind: 'out-of-range', reason: cloudReason }

  const darkness = skyDarknessAt(
    new Date((result.window.start.getTime() + result.window.end.getTime()) / 2),
    venue.lat,
    venue.lon,
  )

  return (
    <>
      <ul className="skyev__constraints">
        {lines.map((line) => (
          <li key={line} className="skyev__constraint num">
            {line}
          </li>
        ))}
      </ul>

      <p className="skyev__window">
        <span className="skyev__window-label">Window</span>
        <span className="skyev__window-times num">
          {clock(result.window.start)} – {clock(result.window.end)}
          {zone === null ? '' : ` ${zone}`}
        </span>
        <span className="skyev__window-length num">
          {MINUTE_LABEL(windowMinutes(result.window))}
        </span>
      </p>

      <p className="skyev__binding">
        Opens when {because(result.startsBecause)} lets it, closes when{' '}
        {because(result.endsBecause)} takes it back. Target{' '}
        <span className="num">{Math.round(result.altitudeAtMidWindow)}°</span> up at the middle.
      </p>

      {/*
        * WHICH HORIZON, ALWAYS. A time computed over a real ridge and a time
        * computed over an imagined flat one are different claims and the app
        * does not let them look alike.
        */}
      {/*
        * WHY IT IS FLAT, NOT JUST THAT IT IS.
        *
        * The elevation data only loads while the Terrain layer is on, because
        * MapLibre answers queryTerrainElevation from the tiles it is drawing
        * with. So a shooter who has never opened Layers gets a flat horizon
        * and, without this sentence, no idea that a better answer is one tap
        * away. Saying "no elevation data was available" alone was true and
        * useless.
        *
        * It is NOT switched on automatically. Terrain costs frames on a phone
        * and the shooter turned it off for a reason; this says what the trade
        * is and leaves the choice where it was.
        */}
      <p className="skyev__horizon">
        {result.horizonSource === 'terrain'
          ? 'Times use the terrain horizon from the elevation data.'
          : 'Times use a flat horizon. Turn Terrain on in Layers and these recompute against the real skyline.'}
      </p>

      {cloud.kind === 'out-of-range' ? (
        <p className="skyev__cloud skyev__cloud--none">{cloud.reason}.</p>
      ) : (
        <p className="skyev__cloud num">
          Cloud over the window:{' '}
          {cloud.hours
            .map((hour) =>
              hour.totalPercent === null
                ? `${clock(hour.at)} —`
                : `${clock(hour.at)} ${Math.round(hour.totalPercent)}%`,
            )
            .join(' · ')}
        </p>
      )}

      <div className="skyev__kit">
        <p className="skyev__kit-head">
          Starting exposure, {STARTING_EXPOSURE_LABEL}
          {(() => {
            const start = startingExposure(
              result.constraints.moonDown === null ? 'moon' : 'meteors',
              darkness,
            )
            return start === null ? null : (
              <span className="num">
                {' '}
                ISO {start.iso}, f/{start.aperture}, {start.seconds < 1 ? `1/${Math.round(1 / start.seconds)}` : `${start.seconds}`}s
              </span>
            )
          })()}
        </p>
        <ul className="skyev__lenses">
          {kitLines.map((row) => (
            <li key={row.lens} className="skyev__lens">
              <span className="skyev__lens-name">{row.lens}</span>
              {row.answer.kind === 'seconds' ? (
                <span className="skyev__lens-npf num">
                  NPF {row.answer.seconds.toFixed(1)}s at {row.focalLength}mm
                </span>
              ) : (
                <span className="skyev__lens-reason">{row.answer.reason}</span>
              )}
            </li>
          ))}
        </ul>
        <p className="skyev__npf-note">
          NPF is for pinpoint stars at 100 percent. Meteor work tolerates roughly double.
        </p>
      </div>

      <button type="button" className="skyev__ics" onClick={() => onIcs(lines)}>
        Add this window to a calendar
      </button>
      <p className="skyev__ics-note">
        A reminder to look, not a prediction. Downloads to this device; nothing is uploaded and the
        venue coordinate is not in the file.
      </p>
    </>
  )
}
