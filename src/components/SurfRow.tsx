import { CAMS, camKind } from '../data/cams.ts'
import { bearingBetween, distanceMeters, type LatLon } from '../core/geo.ts'
import { formatClock } from '../core/timezone.ts'
import type { BuoyReading } from '../lib/buoy.ts'
import type { SurfHour } from '../lib/surfDay.ts'
import { compass, metresToFeet } from '../lib/tideWords.ts'
import { formatRange, type Units } from '../lib/units.ts'

/*
 * THE SURF ROW ON THE TIDE SHEET, coastal venues only (Settings, Surf).
 *
 * One plain line (Fun, Clean) and the estimated face height, said as an
 * estimate every time; the swell it came from; and the nearest buoy's latest
 * reading beside the forecast for now, so a forecast that is off today shows
 * it. The cams are links out: the operator's page opens, nothing is fetched or
 * embedded. Which way each camera points is not in the cam index, so the row
 * says where each one is from here instead.
 */
export const SURF_LABEL = 'Estimate from the offshore forecast, not a surf report.'

interface SurfRowProps {
  now: SurfHour | null
  shape: string | null
  buoy: BuoyReading | null
  venue: LatLon
  units: Units
  timeZone: string
}

export function SurfRow({ now, shape, buoy, venue, units, timeZone }: SurfRowProps) {
  const cams = CAMS.filter((c) => camKind(c) === 'coast')
    .map((c) => ({ cam: c, m: distanceMeters(venue, c.at), bearing: bearingBetween(venue, c.at) }))
    .sort((a, b) => a.m - b.m)
    .slice(0, 3)
  return (
    <div className="tides__surf">
      <div className="tides__surfread">
        <p className="tides__glassline">
          {now === null ? 'Surf: no sea forecast here yet' : `Surf: ${now.estimate.size}${shape === null ? '' : `, ${shape}`} · ${now.estimate.faceFt.toFixed(1)} ft faces`}
        </p>
        <p className="tides__small num">
          {SURF_LABEL}
          {now === null ? '' : ` Swell ${now.swellFt.toFixed(1)} ft, ${Math.round(now.periodS)} s from ${compass(now.fromDeg)}`}
          {now?.windWaveFt == null ? '' : ` · wind waves ${now.windWaveFt.toFixed(1)} ft`}
          {buoy === null
            ? ''
            : buoy.status === 'ok'
              ? ` · buoy ${buoy.buoy.id} at ${formatClock(buoy.at, timeZone)}: ${metresToFeet(buoy.waveM).toFixed(1)} ft${buoy.periodS === null ? '' : `, ${Math.round(buoy.periodS)} s`}${buoy.fromDeg === null ? '' : ` from ${compass(buoy.fromDeg)}`}`
              : ` · ${buoy.reason}`}
        </p>
      </div>
      {cams.length === 0 ? null : (
        <div className="tides__cams">
          {cams.map(({ cam, m, bearing }) => (
            <a key={cam.id} className="tides__cam" href={cam.url} target="_blank" rel="noreferrer noopener">
              <span className="tides__camname">{cam.name}</span>
              <span className="tides__small num">
                {formatRange(m, units.distance)} {compass(bearing)}
                {cam.access === 'paid' ? ' · paid' : ''}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
