import { compassPoint } from '../core/field.ts'
import type { LatLon } from '../core/geo.ts'
import { metersToFeet } from '../core/reachScale.ts'
import { rankUpwind, UPWIND_CONE_DEGREES, type Wind } from '../core/upwind.ts'
import { CAMS } from '../data/cams.ts'

interface CamListProps {
  venue: LatLon | null
  /** Null until the wind lookup answers, or when it fails. */
  wind: Wind | null
}

/**
 * SKY CAMERAS, RANKED BY WHAT THEY CAN TELL YOU.
 *
 * A cam downwind is showing weather that has already gone past. A cam upwind
 * is showing the next hour. So the list is ordered upwind first and then by
 * how soon that weather arrives, which is the arithmetic in
 * src/core/upwind.ts.
 *
 * THE LIST IS A FILE IN THIS REPO, src/data/cams.ts. Nothing is fetched to
 * build it and the venue coordinate never leaves the device: "which cams are
 * near me" is answered here, against data already in the bundle. Any cam API
 * would have required sending the venue somewhere, which is the thing this app
 * exists to avoid.
 *
 * LINK OUT ONLY. These are anchors. Nothing is embedded, proxied, streamed or
 * saved, including into an offline field pack. Tapping one is you visiting that
 * operator's site; the app's involvement ends at the href.
 */
export function CamList({ venue, wind }: CamListProps) {
  if (venue === null) {
    return (
      <p className="cams__empty">
        Drop the venue pin and these sort themselves by which one is upwind of it.
      </p>
    )
  }

  /*
   * NO WIND, NO RANKING CLAIM. Without a direction there is no upwind, so the
   * list falls back to nearest first and says that is what it is doing rather
   * than implying an order it cannot compute.
   */
  const ranked = rankUpwind(venue, CAMS, wind ?? { fromDegrees: 0, speedMps: 0 })
  const km = (metres: number) => `${(metres / 1000).toFixed(0)} km`
  const miles = (metres: number) => `${Math.round(metersToFeet(metres) / 5280)} mi`

  return (
    <div className="cams">
      <p className="cams__note">
        {wind === null
          ? 'Nearest first. The wind has not come back yet, so nothing here is ranked by what is upwind.'
          : `Upwind first, then soonest. Wind from ${Math.round(wind.fromDegrees)}° ${compassPoint(
              wind.fromDegrees,
            )} at ${Math.round(wind.speedMps)} m/s.`}
      </p>

      <ul className="cams__list">
        {ranked.map((entry) => (
          <li key={entry.item.id} className={`cam${entry.isUpwind ? ' cam--upwind' : ''}`}>
            {/*
              * An anchor, opened in a new tab, and that is the entire
              * integration. noreferrer as well as noopener: the operator does
              * not need to be told which app sent you.
              */}
            <a
              className="cam__link"
              href={entry.item.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              <span className="cam__name">{entry.item.name}</span>
              <span className="cam__where num">
                {km(entry.distanceMeters)} · {miles(entry.distanceMeters)}{' '}
                {compassPoint(entry.bearingDegrees)}
              </span>
              <span className="cam__why">
                {entry.isUpwind
                  ? entry.leadMinutes === null
                    ? 'upwind'
                    : `upwind · about ${Math.round(entry.leadMinutes)} min out`
                  : `${Math.round(entry.offWindDegrees)}° off the wind`}
              </span>
            </a>
            <span className={`cam__who${entry.item.access === 'paid' ? ' cam__who--paid' : ''}`}>
              {entry.item.operator}
              {entry.item.access === 'paid' ? ' · paid' : ''}
            </span>
          </li>
        ))}
      </ul>

      <p className="cams__foot">
        This list is a file in the app, so nothing about your venue is sent anywhere to
        build it. Tapping a camera opens that operator&rsquo;s own site. Anything inside{' '}
        {UPWIND_CONE_DEGREES}° of the wind counts as upwind.
      </p>
    </div>
  )
}
