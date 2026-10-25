import { colorChance, COLOR_WORDS } from '../core/colorChance.ts'
import { feetToMeters } from '../core/reachScale.ts'
import { compareToRating, knots, windAtHeight, type LevelWind } from '../core/windProfile.ts'
import type { VenueCloud } from '../lib/forecast.ts'
import { forecastAge, type Provenance } from '../lib/savedForecast.ts'
import type { TideState } from '../core/tide.ts'
import {
  GROUND_WIND_METERS,
  windHeightLabel,
  windHeightNote,
  type WindHeight,
} from '../core/windHeight.ts'
import { formatClock } from '../core/timezone.ts'
import type { TideInfo } from '../lib/useTide.ts'
import { formatRange, type Units } from '../lib/units.ts'

interface WeatherPanelProps {
  /** The instant the time bar is on. Everything here is for that moment. */
  at: Date | null
  timeZone: string | null
  /** True when `at` has already happened. */
  past: boolean
  /**
   * All four heights Open-Meteo serves. Empty until it answers.
   *
   * The ground figure is not passed separately: windAtHeight(levels, 10) is
   * the same number from the same source, and two routes to one reading is
   * how they come to disagree.
   */
  levels: LevelWind[]
  gustMps: number | null
  /**
   * The air position's height in feet, or null with no air position.
   *
   * THE WHOLE REASON THIS PANEL EXISTS. Every weather app shows ten metre
   * wind, and at four hundred feet that is a different day: measured at
   * Lynnhaven Inlet at 07:00, ground 7.5 km/h and 180m 27.0 km/h.
   *
   * It carries WHICH height and WHY: a placed position, the default for a
   * drone shoot with nothing placed yet, or the ground. See
   * src/core/windHeight.ts.
   */
  windHeight: WindHeight
  /** The published rating of the aircraft, and where it came from. Null if unknown. */
  ratedWindMps: number | null
  ratedWindSource: string
  tide: TideInfo
  tideNow: TideState | null
  /** Cloud over the venue for the hour, from the same request as the wind. */
  cloud: VenueCloud | null
  /** Live, or saved with the time it arrived. Saved always shows its age. */
  forecast: Provenance
  /** Why there is no forecast, in words, when there is none. */
  forecastReason: string | null
  /*
   * WHICH READING TO SHOW. The panel held all three -- wind, tide, cloud --
   * one under another, which was right when the sheet was one scrolling page
   * about everything. Each is its own card opened from its own chip now, and
   * a card about the wind that also carries the tide is not one subject.
   */
  show?: 'all' | 'wind' | 'tide' | 'cloud'
  /** Which system the shooter reads distances in. See src/lib/units.ts. */
  units: Units
}

/** A dash. NEVER a zero standing in for a reading that did not arrive. */
const DASH = '–'

/*
 * A SAVED FORECAST SAYS SO, BESIDE THE VALUE, EVERY TIME.
 *
 * Never rendered as if it were current: under twelve hours the age is shown
 * plainly, over twelve it is marked, over thirty-six the reading is dimmed
 * and called an old forecast. A live one carries nothing, because a reading
 * with no qualifier is the live reading.
 */
function SavedAge({ provenance, what }: { provenance: Provenance; what: string }) {
  if (provenance.kind !== 'saved') return null
  const age = forecastAge(provenance.fetchedAt)
  return (
    <p className={`wx__age wx__age--${age.mark}`}>
      {age.mark === 'dimmed' ? `Old ${what}, ` : `Saved ${what}, `}
      <span className="num">{age.text}</span>
      {age.mark === 'dimmed' ? '. It may have changed since.' : '. No signal for a newer one.'}
    </p>
  )
}

const dimmedIf = (provenance: Provenance): string =>
  provenance.kind === 'saved' && forecastAge(provenance.fetchedAt).mark === 'dimmed'
    ? ' wx__read--old'
    : ''

/**
 * THREE READINGS, NOT A DASHBOARD.
 *
 * WHAT THIS REPLACED. A grid of azimuth, altitude, shadow bearing and light
 * class at three times, which is a table of numbers rather than something you
 * read one-handed in sunlight. The sun detail it carried is still in the sun
 * readout where it belongs; this is wind, tide and cloud, each short enough to
 * take in at a glance.
 *
 * EVERYTHING IS FOR THE SCRUBBED MOMENT. The sun, the shadow and the bands
 * already followed the time bar and these did not, so scrubbing to 06:45 gave
 * the light at 06:45 and the wind at whatever o'clock it happened to be. Past
 * is close to observed and future is a model, and the panel says which.
 *
 * UNKNOWN IS A DASH AND A SENTENCE. Never a zero: a zero is a reading, and
 * "the forecast did not say" is a different thing.
 */
export function WeatherPanel({
  at,
  timeZone,
  past,
  levels,
  gustMps,
  windHeight,
  ratedWindMps,
  ratedWindSource,
  tide,
  tideNow,
  cloud,
  forecast,
  forecastReason,
  show = 'all',
  units,
}: WeatherPanelProps) {
  const shows = (which: 'wind' | 'tide' | 'cloud') => show === 'all' || show === which
  const clock = at === null || timeZone === null ? null : formatClock(at, timeZone)

  /*
   * AT THE HEIGHT BEING FLOWN, interpolated between the levels the model
   * serves, or at the ground when nothing is in the air. The height is always
   * stated: a wind speed with no height attached is meaningless.
   */
  const height =
    windHeight.feet === null ? GROUND_WIND_METERS : feetToMeters(windHeight.feet)
  const aloft = windAtHeight(levels, height)
  const against = compareToRating(gustMps, ratedWindMps)

  const speedLine =
    aloft.speedMps === null
      ? DASH
      : `${Math.round(knots(aloft.speedMps))} kts`
  const heightLine = windHeightLabel(windHeight)
  /*
   * AN ASSUMED HEIGHT SAYS SO. Reading at 200 ft because the Drone chip is on
   * is useful; letting that look like a height the shooter chose is not.
   */
  const heightNote = windHeightNote(windHeight)

  return (
    <section className="wx" aria-label="Weather">
      <p className="wx__when">
        {clock === null ? (
          'Set the venue and the window to read conditions.'
        ) : (
          <>
            <span className="num">{clock}</span>
            <span className="wx__source">{past ? 'observed' : 'forecast'}</span>
          </>
        )}
      </p>

      {/* ------------------------------------------------------------ wind */}
      {!shows('wind') ? null : (
      <div className={`wx__read${dimmedIf(forecast)}`}>
        <p className="wx__label">Wind {heightLine}</p>
        {heightNote === null ? null : <p className="wx__assumed">{heightNote}</p>}
        <p className="wx__value num">
          {speedLine}
          {aloft.fromDegrees === null ? null : (
            <span className="wx__from num"> from {Math.round(aloft.fromDegrees)}°</span>
          )}
        </p>

        {aloft.speedMps === null ? null : <SavedAge provenance={forecast} what="forecast" />}
        {aloft.speedMps === null ? (
          <p className="wx__note">{forecastReason ?? 'The forecast did not say.'}</p>
        ) : (
          <>
            {/*
              * INTERPOLATED IS SAID, because a figure between two served
              * heights is a reasonable number and not a measurement.
              */}
            {aloft.interpolated ? (
              <p className="wx__note">
                Interpolated between the {aloft.betweenMeters[0]} m and{' '}
                {aloft.betweenMeters[1]} m levels the forecast serves, not measured at
                this height.
              </p>
            ) : (
              <p className="wx__note">
                At the {aloft.betweenMeters[0]} m level the forecast serves.
              </p>
            )}

            {/*
              * THE GUST IS WHAT ENDS A FLIGHT, not the average. It is a
              * SURFACE figure: Open-Meteo serves no gust above ten metres, and
              * saying so is the difference between a number and a claim.
              */}
            {gustMps === null ? (
              <p className="wx__note">No gust reported for this hour.</p>
            ) : (
              <p className="wx__gust num">
                Gusting {Math.round(knots(gustMps))} kts at the surface
              </p>
            )}

            {/*
              * AND THE RATING BESIDE IT, as a measurement. Not a verdict, not
              * a go or no-go: the same rule as the Part 107 ceiling. Omitted
              * entirely when the aircraft's limit has not been confirmed,
              * because a wind limit invented for an aircraft is something
              * somebody could fly on.
              */}
            {against === null ? null : (
              <p className={`wx__rated${against.over ? ' wx__rated--over' : ''}`}>
                The aircraft is rated to{' '}
                <span className="num">{Math.round(knots(against.ratedMps))} kts</span> (
                <span className="num">{against.ratedMps} m/s</span>). {ratedWindSource}. Yours
                is the judgement.
              </p>
            )}
          </>
        )}
      </div>

      )}

      {/* ------------------------------------------------------------ tide */}
      {!shows('tide') ? null : (
      <div className="wx__read">
        <p className="wx__label">Tide</p>
        {tide.status !== 'ok' || tideNow === null ? (
          <>
            <p className="wx__value num">{DASH}</p>
            <p className="wx__note">
              {tide.status === 'no-station'
                ? `No station near this venue. The closest is ${formatRange(
                    tide.nearestKm * 1000,
                    units.distance,
                  )} away.`
                : tide.status === 'unavailable'
                  ? tide.reason
                  : 'Waiting for NOAA.'}
            </p>
          </>
        ) : (
          <>
            <p className="wx__value num">
              {tideNow.feet.toFixed(1)} ft
              <span className="wx__from">
                {tideNow.direction === 'slack' ? 'slack' : tideNow.direction}
              </span>
            </p>
            {tideNow.next === null ? (
              <p className="wx__note">No further turn in the published day.</p>
            ) : (
              <p className="wx__note">
                Next {tideNow.next.kind} <span className="num">
                  {tideNow.next.feet.toFixed(1)} ft
                </span>{' '}
                at{' '}
                <span className="num">
                  {timeZone === null ? DASH : formatClock(tideNow.next.at, timeZone)}
                </span>
                .
              </p>
            )}
            {/* A tide table is astronomy and does not go stale, but where it came from is said. */}
            {tide.predictions.provenance.kind === 'saved' ? (
              <p className="wx__age wx__age--plain">
                Saved from NOAA,{' '}
                <span className="num">{forecastAge(tide.predictions.provenance.fetchedAt).text}</span>.
                Predicted turns do not change.
              </p>
            ) : null}
            <p className="wx__note wx__note--quiet">
              {tide.station.name},{' '}
              <span className="num">{formatRange(tide.distanceKm * 1000, units.distance)}</span>
              {tide.predictions.curveSource === 'published'
                ? '.'
                : '. Level between turns computed here from the turns; the turns are NOAA’s.'}
            </p>
          </>
        )}
      </div>

      )}

      {/* ----------------------------------------------------------- cloud */}
      {!shows('cloud') ? null : (
      <div className={`wx__read${dimmedIf(forecast)}`}>
        <p className="wx__label">Cloud over the venue</p>
        {/*
          * THE VENUE'S CLOUD, from the request the wind already makes. This
          * card used to be fed the literal null and asked the shooter to
          * select a position, while the chip above it said "no data". The
          * cloud along one position's sightline is still on that position's
          * card, where it belongs.
          */}
        {cloud === null ? (
          <>
            <p className="wx__value num">{DASH}</p>
            <p className="wx__note">
              {forecastReason ??
                (clock === null ? 'Set the venue and the window.' : 'Waiting for Open-Meteo.')}
            </p>
          </>
        ) : (
          <>
            <p className="wx__value num">
              {cloud.low === null ? DASH : `${Math.round(cloud.low)}% low`}
            </p>
            <SavedAge provenance={forecast} what="forecast" />
            {/*
              * THE THREE LAYERS, each its own row, a dash where the forecast
              * did not say. The chip above stays one value, the low layer.
              */}
            <dl className="wx__layers num">
              {(
                [
                  ['Low', cloud.low],
                  ['Mid', cloud.mid],
                  ['High', cloud.high],
                ] as const
              ).map(([name, value]) => (
                <div key={name} className="wx__layer">
                  <dt>{name}</dt>
                  <dd>{value === null ? DASH : `${Math.round(value)}%`}</dd>
                </div>
              ))}
            </dl>
            {(() => {
              const read = colorChance(cloud)
              return (
                <p className="wx__note wx__color">
                  <strong>{COLOR_WORDS[read.chance]}.</strong> {read.why} Matters when the sun is low.
                </p>
              )
            })()}
            {cloud.low === null ? (
              <p className="wx__note">The forecast did not say how much low cloud.</p>
            ) : null}
            <p className="wx__note wx__note--quiet">
              Open-Meteo, over the venue for this hour. Low cloud is the layer that takes
              the sun away. Each position's sightline is on its own card.
            </p>
          </>
        )}
      </div>
      )}
    </section>
  )
}
