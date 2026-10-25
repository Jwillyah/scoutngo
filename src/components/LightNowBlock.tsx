import { compassWord } from '../core/compassWords.ts'
import { durationWords } from '../core/duration.ts'
import { BAND_WORDS, lightNow, PERSON_HEIGHT_METERS } from '../core/lightNow.ts'
import type { LatLon } from '../core/geo.ts'
import { formatRange, type Units } from '../lib/units.ts'

/*
 * THE LIGHT AT THE MOMENT ON THE TIME BAR: which light it is, where the sun
 * is, when that changes, and how long a person's shadow is. src/core/lightNow.ts.
 */
export function LightNowBlock({ at, venue, units }: { at: Date; venue: LatLon; units: Units }) {
  const read = lightNow(at, venue.lat, venue.lon)
  return (
    <div className="lightnow">
      <p className={`lightnow__band lightnow__band--${read.band}`}>{BAND_WORDS[read.band]}</p>
      <p className="lightnow__line num">
        {read.altitude > 0
          ? `Sun ${Math.round(read.altitude)}° up in the ${compassWord(read.azimuth)}.`
          : `Sun ${Math.abs(Math.round(read.altitude))}° below the horizon.`}{' '}
        {read.next === null ? 'No change in the next 18 h.' : `${BAND_WORDS[read.next.band]} in ${durationWords(read.next.minutes)}.`}
      </p>
      {read.personShadow === null ? null : (
        <p className="lightnow__line num">
          A person {units.distance === 'ft' ? `${Math.round(PERSON_HEIGHT_METERS / 0.3048)} ft` : `${PERSON_HEIGHT_METERS} m`} tall throws a{read.personShadow.capped ? ' more than' : ''}{' '}
          {formatRange(read.personShadow.lengthMeters, units.distance)} shadow toward the {compassWord(read.personShadow.bearing)}, on flat ground.
        </p>
      )}
    </div>
  )
}
