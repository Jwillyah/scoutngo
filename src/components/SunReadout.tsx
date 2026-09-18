import { altitudeNote, type AltitudeNote } from '../core/lighting.ts'
import { getSunPosition, type SunPosition } from '../core/sun.ts'
import { formatClock } from '../core/timezone.ts'
import type { VenueWindow } from '../lib/venue.ts'
import { Panel } from './Panel.tsx'

interface SunReadoutProps {
  venueWindow: VenueWindow | null
}

const COMPASS_POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
]

function cardinal(degrees: number): string {
  return COMPASS_POINTS[Math.round(degrees / 22.5) % 16]
}

const SHORT_NOTE: Record<AltitudeNote, string> = {
  'low sun, long shadows, flare risk': 'low sun',
  'flat overhead light': 'flat',
  workable: 'workable',
}

const degrees = (n: number) => `${n.toFixed(1)}°`

interface Sample {
  key: string
  label: string
  at: Date
  sun: SunPosition
  note: AltitudeNote
}

function sample(key: string, label: string, at: Date, lat: number, lon: number): Sample {
  const sun = getSunPosition(at, lat, lon)
  return { key, label, at, sun, note: altitudeNote(sun.altitude) }
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

  const belowHorizon = samples.filter((s) => s.sun.altitude <= 0)
  const notes = [...new Set(samples.map((s) => s.note))]

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
              <span className="readout__value num">{degrees(s.sun.azimuth)}</span>
              <span className="readout__sub">{cardinal(s.sun.azimuth)}</span>
            </div>
          ))}

          <div className="readout__cell">Altitude</div>
          {samples.map((s) => (
            <div className="readout__cell" key={s.key}>
              <span className="readout__value num">{degrees(s.sun.altitude)}</span>
              <span className="readout__sub">
                {s.sun.altitude > 0 ? 'above horizon' : 'below'}
              </span>
            </div>
          ))}

          <div className="readout__cell">Shadow</div>
          {samples.map((s) => (
            <div className="readout__cell" key={s.key}>
              <span className="readout__value num">{degrees(s.sun.shadowBearing)}</span>
              <span className="readout__sub">{cardinal(s.sun.shadowBearing)}</span>
            </div>
          ))}

          <div className="readout__cell">Light</div>
          {samples.map((s) => (
            <div className="readout__cell" key={s.key}>
              {SHORT_NOTE[s.note]}
            </div>
          ))}
        </div>

        <div className="readout__foot">
          {belowHorizon.length > 0 ? (
            <p className="readout__night">
              Sun is below the horizon for part of this window. There is nothing to
              light a position with.
            </p>
          ) : null}
          {notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
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
