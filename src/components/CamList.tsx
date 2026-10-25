import { durationWords } from '../core/duration.ts'
import { Receipt } from '../lib/numerals.tsx'
import { compassPoint } from '../core/field.ts'
import type { LatLon } from '../core/geo.ts'
import { rankUpwind, UPWIND_CONE_DEGREES, type Wind } from '../core/upwind.ts'
import { formatRange, type Units } from '../lib/units.ts'
import { CAMS } from '../data/cams.ts'

/*
 * 200 km: about three hours of a brisk airmass, which is the outer edge of
 * "what is coming next". Past it a camera shows a different day's weather.
 */
const USEFUL_METERS = 200_000

/** Six. A longer list is one nobody reads to the bottom of. */
const MOST_SHOWN = 6

interface CamListProps {
  venue: LatLon | null
  /** Null until the wind lookup answers, or when it fails. */
  wind: Wind | null
  /** Which system the shooter reads distances in. See src/lib/units.ts. */
  units: Units
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
export function CamList({ venue, wind, units }: CamListProps) {
  if (venue === null) {
    return (
      <p className="cams__empty">
        Drop the venue pin and these sort themselves by which one is upwind of it.
      </p>
    )
  }

  /*
   * ONE DISTANCE, IN THE UNIT THE SHOOTER CHOSE.
   *
   * It printed both -- "180 km · 112 mi" -- which is what you do when there
   * is no preference to read. There is one now, in About, and it was being
   * offered while nothing in the app honoured it: a control that does
   * nothing is shape D in docs/failure-modes.md read from the other side.
   */
  const range = (metres: number) => formatRange(metres, units.distance)

  /*
   * NO WIND, NO RANKING CLAIM. Without a direction there is no upwind, so the
   * list falls back to nearest first and says that is what it is doing rather
   * than implying an order it cannot compute.
   */

  const all = rankUpwind(venue, CAMS, wind ?? { fromDegrees: 0, speedMps: 0 })

  /*
   * SIX, AND ONLY WHERE A CAM IS ACTUALLY NEAR.
   *
   * WHAT THIS REPLACES. Every cam in the file, ranked, however far away: at a
   * Shenandoah venue that was twenty entries beginning at 6,600 km. A cam
   * 6,600 km away is not weather information, it is a row, and twenty of them
   * is a wall that buries the two that matter when there ARE two that matter.
   *
   * A CAM IS USEFUL WHEN ITS WEATHER CAN REACH YOU. 200 km is about three
   * hours of a brisk airmass, which is the outer edge of "the next hour or
   * two", and past it the picture is of a different day's weather. So the
   * list is cut there and the count is capped at six -- more than six is a
   * list nobody reads to the bottom of.
   *
   * AND WHEN NOTHING IS WITHIN REACH IT SAYS SO IN ONE LINE. Not an empty
   * list, not twenty distant rows: a sentence saying there is no camera near
   * this venue, with the nearest distance so the reader knows it looked.
   */
  const ranked = all.filter((entry) => entry.distanceMeters <= USEFUL_METERS).slice(0, MOST_SHOWN)

  if (ranked.length === 0) {
    const nearest = all[0]
    return (
      <div className="cams">
        <p className="cams__empty">
          {nearest === undefined
            ? 'No sky cameras are listed.'
            : `No sky camera near this venue. The closest is ${range(nearest.distanceMeters)} away, which is too far to be showing your weather.`}
        </p>
      </div>
    )
  }
  return (
    <div className="cams">
      <p className="cams__note">
        {wind === null
          ? 'Nearest first. The wind has not come back yet, so nothing here is ranked by what is upwind.'
          : `Upwind first, then soonest. Wind from ${compassPoint(
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
                {range(entry.distanceMeters)} {compassPoint(entry.bearingDegrees)}
              </span>
              <span className="cam__why">
                {entry.isUpwind
                  ? entry.leadMinutes === null
                    ? 'upwind'
                    : `upwind · about ${durationWords(entry.leadMinutes)} out`
                  : (
                      <>
                        {/*
                          * The word has to carry the meaning on its own:
                          * "off the wind" with the number gone reads as a
                          * fragment, so the phrase changes rather than losing
                          * its subject.
                          */}
                        not upwind
                        <Receipt kind="bearing">
                          {' · '}
                          {Math.round(entry.offWindDegrees)}° off
                        </Receipt>
                      </>
                    )}
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
