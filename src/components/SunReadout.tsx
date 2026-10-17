import { Receipt } from '../lib/numerals.tsx'
import { compassPoint } from '../core/field.ts'
import { bandIntervals, peakIn } from '../core/shootWindow.ts'
import {
  bandsAcross,
  skyCarriesTheShot,
  SUN_BAND_LABEL,
  SUN_BAND_NOTE,
  sunBand,
  unlitGroundShare,
  type SunBand,
} from '../core/sunBand.ts'
import { getSunPosition, type SunPosition } from '../core/sun.ts'
import { formatClock } from '../core/timezone.ts'
import type { VenueWindow } from '../lib/venue.ts'
import { Panel } from './Panel.tsx'

interface SunReadoutProps {
  venueWindow: VenueWindow | null
}

const degrees = (n: number) => `${n.toFixed(1)}°`

interface Sample {
  key: string
  label: string
  at: Date
  sun: SunPosition
  band: SunBand
}

function sample(key: string, label: string, at: Date, lat: number, lon: number): Sample {
  const sun = getSunPosition(at, lat, lon)
  return { key, label, at, sun, band: sunBand(sun.altitude) }
}

export function SunReadout({ venueWindow }: SunReadoutProps) {
  if (venueWindow === null) {
    return (
      <Panel index="03" title="Sun through the window">
        <div className="readout">
          <p className="readout__empty">
            Enter a valid latitude, longitude, date, and time window above. The
            readout computes as soon as they are all good.
          </p>
        </div>
      </Panel>
    )
  }

  const { lat, lon } = venueWindow
  const samples = [
    sample('start', 'Start', venueWindow.start, lat, lon),
    sample('middle', 'Mid', venueWindow.middle, lat, lon),
    sample('end', 'End', venueWindow.end, lat, lon),
  ]

  /*
   * WHAT THE WINDOW ACTUALLY SPANS, as bands.
   *
   * It used to compute `belowHorizon` and print "Sun is below the horizon for
   * part of this window. There is nothing to light a position with." Measured
   * at Lesner Bridge for a 06:00 to 07:45 sunrise window, that line covered
   * every sample from -15.5 through -0.7 degrees: night, nautical and
   * afterglow, which is the whole of a backlit cloud shoot. For that shot the
   * statement is not merely unhelpful, it is false.
   */
  /*
   * ACROSS THE WHOLE WINDOW, not across the three samples shown.
   *
   * Naming the bands from the three visible samples misses the ones in
   * between: measured at Lesner Bridge for 18:10 to 19:30, the three samples
   * land on late golden, nautical and night, so a window that goes straight
   * through sunset and afterglow would have mentioned neither. That is the
   * same mistake in a new place, a true statement about a sample presented as
   * a statement about the shoot.
   */
  const altitudeAt = (at: Date) => getSunPosition(at, lat, lon).altitude
  const bands = bandsAcross(altitudeAt, venueWindow.start, venueWindow.end)

  /*
   * WHICH BAND TO BE IN THE AIR FOR.
   *
   * Naming the bands was not enough. Measured on rewind cameras at Virginia
   * Beach on 15 October 2026, the best light was at 06:49 with the sun 4.8
   * degrees under, twenty-two minutes BEFORE sunrise, and it was flat and
   * washed out by 07:09. The app named all of that correctly and never said
   * which minute mattered.
   *
   * The kind of shoot is inferred from the window itself rather than asked
   * for: a window that ends with the sun higher than it started is a sunrise.
   * That keeps this readout useful whether or not a chip was tapped.
   */
  const intervals = bandIntervals(altitudeAt, venueWindow.start, venueWindow.end)
  const rising = altitudeAt(venueWindow.end) > altitudeAt(venueWindow.start)
  const peak = peakIn(rising ? 'sunrise' : 'sunset', intervals)
  const skyBands = bands.filter(skyCarriesTheShot)
  /** A subject that needs light on its FACE. The only case the old line fit. */
  const unlitShare = unlitGroundShare(altitudeAt, venueWindow.start, venueWindow.end)

  return (
    <Panel index="03" title="Sun through the window">
      <p className="section__note">
        Computed by the solar core, not asserted by anything else. This is the
        layer every later claim about light gets checked against.
      </p>

      <div className="readout">
        <div className="readout__grid">
          <div className="readout__head">
            <div className="readout__cell">Window</div>
            {samples.map((s) => (
              <div className="readout__cell" key={s.key}>
                {s.label}
              </div>
            ))}
          </div>

          <div className="readout__cell">Time</div>
          {samples.map((s) => (
            <div className="readout__cell" key={s.key}>
              <span className="readout__value num">
                {formatClock(s.at, venueWindow.timeZone)}
              </span>
            </div>
          ))}

          <div className="readout__cell">Azimuth</div>
          {samples.map((s) => (
            <div className="readout__cell" key={s.key}>
              <Receipt kind="solar">
                <span className="readout__value num">{degrees(s.sun.azimuth)}</span>
              </Receipt>
              <span className="readout__sub">{compassPoint(s.sun.azimuth)}</span>
            </div>
          ))}

          <div className="readout__cell">Altitude</div>
          {samples.map((s) => (
            <div className="readout__cell" key={s.key}>
              <Receipt kind="solar">
                <span className="readout__value num">{degrees(s.sun.altitude)}</span>
              </Receipt>
              <span className="readout__sub">
                {s.sun.altitude > 0 ? 'above horizon' : 'below'}
              </span>
            </div>
          ))}

          <div className="readout__cell">Shadow</div>
          {samples.map((s) => (
            <div className="readout__cell" key={s.key}>
              <Receipt kind="bearing">
                <span className="readout__value num">{degrees(s.sun.shadowBearing)}</span>
              </Receipt>
              <span className="readout__sub">{compassPoint(s.sun.shadowBearing)}</span>
            </div>
          ))}

          <div className="readout__cell">Band</div>
          {samples.map((s) => (
            <div className="readout__cell" key={s.key}>
              {SUN_BAND_LABEL[s.band]}
            </div>
          ))}
        </div>

        <div className="readout__foot">
          {/*
            * WHAT EACH BAND IS. A state, never a verdict: "blue hour peak" is
            * not a warning, it is a fifteen minute window somebody set an
            * alarm for. One line per band the window actually crosses.
            */}
          {bands.map((band) => (
            <p key={band}>{SUN_BAND_NOTE[band]}</p>
          ))}

          {/*
            * THE PEAK, SAID PLAINLY AND WITHOUT A PROMISE.
            *
            * "Usually concentrates" rather than "will be": one morning with a
            * high thin deck and a clear slot at the horizon is one cloud
            * setup, not a law, and a solid overcast has no peak at all. This
            * module cannot tell which sky it is looking at; only the sky can.
            */}
          {peak === null ? null : (
            <p className="readout__peak">
              Light usually concentrates in{' '}
              <strong>{SUN_BAND_LABEL[peak.band]}</strong>,{' '}
              <span className="num">
                {formatClock(peak.from, venueWindow.timeZone)}–
                {formatClock(peak.to, venueWindow.timeZone)}
              </span>
              . Be set up by{' '}
              <span className="num">{formatClock(peak.beSetUpBy, venueWindow.timeZone)}</span>.
              Cloud decides whether it happens.
            </p>
          )}

          {/*
            * AND WHEN THE SKY IS THE SUBJECT, SAY SO. This is the sentence the
            * old warning should always have been: it names what IS there
            * instead of reporting the absence of something else.
            */}
          {skyBands.length === 0 ? null : (
            <p className="readout__sky">
              The sun is at or under the horizon for part of this window, which is when
              the sky carries the picture: backlit cloud, colour, and a lit skyline.
            </p>
          )}

          {/*
            * THE WARNING, KEPT ONLY WHERE IT IS TRUE.
            *
            * Scoped to a subject that needs light on its face, which is the
            * only thing the old blanket line was ever right about. It does not
            * say there is nothing to shoot, and it does not call the band a
            * problem.
            */}
          {unlitShare === 0 ? null : (
            <p className="readout__night">
              A subject on the ground has no direct light on its face for{' '}
              {unlitShare >= 0.999 ? 'any' : 'part'} of this window. That is a limit on a
              lit face, not on the shoot.
            </p>
          )}
          {/*
            * The timezone is stated rather than assumed. Times are resolved
            * through the venue's own zone, so this is a fact about the numbers
            * above, not a warning to check something by hand.
            */}
          <p>
            Times are venue local:{' '}
            <span className="num">{venueWindow.timeZoneLabel}</span> at{' '}
            <span className="num">{venueWindow.timeZone}</span>.
          </p>
          {venueWindow.travelling ? (
            <p>
              This device is set to{' '}
              <span className="num">{venueWindow.deviceTimeZone}</span>, so the clock
              on your screen is not the clock these times are in.
            </p>
          ) : null}
          {venueWindow.timeZoneFallback ? (
            <p>
              No timezone could be resolved for these coordinates, so this device's
              zone is standing in. Move the pin onto land to fix it.
            </p>
          ) : null}
        </div>
      </div>
    </Panel>
  )
}
