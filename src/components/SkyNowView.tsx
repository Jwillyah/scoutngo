import { getPosition } from 'suncalc'
import { compassPoint } from '../core/field.ts'
import type { LatLon } from '../core/geo.ts'
import type { MetarSky } from '../core/metar.ts'
import { skyNow, STATION_FRESH_MS } from '../core/skyNow.ts'
import { formatClock } from '../core/timezone.ts'
import { hourlyAt, type Hourly } from '../lib/tideSheetData.ts'

/*
 * THE SKY PAGE'S NOW (Batch NOW, Section 1.1): the cloud over you in words
 * (the station's decks and heights, the forecast's above its reach), whether
 * it is worth a look and why, then what is next today. The words are
 * src/core/skyNow.ts's.
 */
export function SkyNowView({ venue, now, timeZone, station, wx, next, onNext }: { venue: LatLon; now: Date; timeZone: string; station: { sky: MetarSky; at: Date } | null; wx: Hourly | null; next: { kind: 'sunset' | 'sunrise'; at: Date; call: string; value: string } | null; onNext: (k: 'sunset' | 'sunrise') => void }) {
  const fresh = station !== null && now.getTime() - station.at.getTime() <= STATION_FRESH_MS ? station : null
  const at = (name: string) => (wx === null ? null : hourlyAt(wx, name, now))
  const model = wx === null ? null : { low: at('cloud_cover_low'), mid: at('cloud_cover_mid'), high: at('cloud_cover_high') }
  const sun = getPosition(now, venue.lat, venue.lon)
  const read = skyNow(fresh?.sky ?? null, model, sun.altitude, compassPoint(sun.azimuth))
  const clock = (d: Date) => formatClock(d, timeZone)
  return (
    <>
      <p className="spage__event num">Now · {clock(now)}</p>
      <p className="spage__head" data-now-head>{read.worth.length > 0 ? 'Worth a look' : 'Nothing special now'}</p>
      <p className="spage__why">{read.worth.length > 0 ? `${read.worth.length === 1 ? 'One thing' : `${read.worth.length} things`} in the sky now.` : `${read.nothing?.replace(/^./, (c) => c.toUpperCase()) ?? 'Nothing found'}.`}</p>
      <section className="dcard spage__now" aria-label="The sky now">
        <p className="dcard__label">The sky now</p>
        <p className="spage__nowclouds" data-now-clouds>{read.clouds.replace(/^./, (c) => c.toUpperCase())}</p>
        <p className="spage__nowsrc">{fresh !== null ? `${fresh.sky.station} at ${clock(fresh.at)}` : 'Forecast: no station report in the last 75 minutes'}</p>
        {read.worth.length === 0 ? null : (
          <ul className="spage__nowlist">
            {read.worth.map((w) => (
              <li key={w.kind}>{w.line.replace(/^./, (c) => c.toUpperCase())}</li>
            ))}
          </ul>
        )}
      </section>
      {next === null ? null : (
        <section className="dcard spage__next" aria-label="Next today">
          <p className="dcard__label">Next</p>
          {/* The call the home shows for the same event (scripts/audit-one-number.mjs reads data-shared). */}
          <button type="button" className="spage__nextbtn" data-shared="skycall" data-value={next.value} onClick={() => onNext(next.kind)}>
            {next.kind === 'sunset' ? 'Sunset' : 'Sunrise'} {clock(next.at)} · {next.call} ›
          </button>
        </section>
      )}
    </>
  )
}
