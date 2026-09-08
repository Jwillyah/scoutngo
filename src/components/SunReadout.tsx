import { altitudeNote, type AltitudeNote } from '../core/lighting.ts'
import { getSunPosition, type SunPosition } from '../core/sun.ts'
import type { VenueWindow } from '../lib/venue.ts'
import { Section } from './Section.tsx'

interface SunReadoutProps {
  venueWindow: VenueWindow | null
  open: boolean
  onToggle: () => void
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

const clock = (date: Date) =>
  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

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

export function SunReadout({ venueWindow, open, onToggle }: SunReadoutProps) {
  if (venueWindow === null) {
    return (
      <Section
        index="03"
        title="Sun through the window"
        summary="Waiting on the venue"
        open={open}
        onToggle={onToggle}
      >
        <div className="readout">
          <p className="readout__empty">
            Enter a valid latitude, longitude, date, and time window above. The
            readout computes as soon as they are all good.
          </p>
        </div>
      </Section>
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
    <Section
      index="03"
      title="Sun through the window"
      summary={`mid-window azimuth ${degrees(samples[1].sun.azimuth)}`}
      open={open}
      onToggle={onToggle}
    >
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
              <span className="readout__value num">{clock(s.at)}</span>
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
          <p>
            Times read in this device's timezone, <span className="num">{venueWindow.timeZone}</span>.
            Check that this is the venue's timezone too.
          </p>
        </div>
      </div>
    </Section>
  )
}
