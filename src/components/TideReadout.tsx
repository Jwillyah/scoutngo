import { feetToMetres, tidalRangeFeet, tideStateAt, type TideExtreme } from '../core/tide.ts'
import { formatClock } from '../core/timezone.ts'
import type { TideInfo } from '../lib/useTide.ts'
import type { VenueWindow } from '../lib/venue.ts'
import { Panel } from './Panel.tsx'

interface TideReadoutProps {
  tide: TideInfo
  venueWindow: VenueWindow | null
  /** The moment the scrubber is sitting on. */
  scrubbedAt: Date | null
}

const feet = (n: number) => `${n.toFixed(1)}ft`
const both = (n: number) => `${n.toFixed(1)}ft · ${feetToMetres(n).toFixed(2)}m`

const DIRECTION_COPY = {
  rising: 'rising',
  falling: 'falling',
  slack: 'near slack',
} as const

/**
 * Tide on the Conditions tab.
 *
 * Every number here is computed in src/core/tide.ts from NOAA's published
 * predictions. Nothing is asked of a model, and nothing here says whether a bank
 * is walkable: that is a judgement about mud and rip-rap that no dataset in this
 * app knows about, and it belongs to the person standing there.
 */
export function TideReadout({ tide, venueWindow, scrubbedAt }: TideReadoutProps) {
  const body = () => {
    if (tide.status === 'idle') {
      return <p className="readout__empty">Set the venue and the window to read the tide.</p>
    }
    if (tide.status === 'loading') {
      return <p className="readout__empty">Asking NOAA for the nearest tide station…</p>
    }
    /*
     * The distance is stated, not implied. An inland venue is not a failure and
     * must not read as one, but neither may a station two hundred kilometres
     * away be presented as if it described this water.
     */
    if (tide.status === 'no-station') {
      return (
        <p className="readout__empty">
          No tide station near this venue. The closest NOAA one,{' '}
          {tide.nearestName}, is <span className="num">{Math.round(tide.nearestKm)}km</span>{' '}
          away, which is too far to describe the water here. If this is an inland
          venue that is simply the right answer.
        </p>
      )
    }
    if (tide.status === 'unavailable') {
      return <p className="readout__empty">{tide.reason}</p>
    }

    const { predictions, station, distanceKm, distant } = tide
    const zone = venueWindow?.timeZone ?? 'UTC'
    const state = scrubbedAt === null ? null : tideStateAt(predictions.curve, predictions.extremes, scrubbedAt)
    const range = tidalRangeFeet(predictions.extremes)

    const windowExtremes: TideExtreme[] =
      venueWindow === null
        ? predictions.extremes
        : predictions.extremes.filter(
            (e) =>
              e.at.getTime() >= venueWindow.start.getTime() - 3 * 3600_000 &&
              e.at.getTime() <= venueWindow.end.getTime() + 3 * 3600_000,
          )

    return (
      <div className="readout">
        {state === null ? null : (
          <p className="tide__now">
            <span className="tide__now-label">At the scrubbed time</span>
            <span className="num tide__now-level">{both(state.feet)}</span>
            <span className="tide__now-dir">{DIRECTION_COPY[state.direction]}</span>
          </p>
        )}

        <ol className="tide__list">
          {windowExtremes.map((e) => {
            const inside =
              venueWindow !== null &&
              e.at.getTime() >= venueWindow.start.getTime() &&
              e.at.getTime() <= venueWindow.end.getTime()
            return (
              <li
                className={`tide__row${inside ? ' tide__row--in' : ''}`}
                key={e.at.toISOString()}
              >
                <span className="tide__kind">{e.kind === 'high' ? 'High' : 'Low'}</span>
                <span className="num tide__time">{formatClock(e.at, zone)}</span>
                <span className="num tide__feet">{feet(e.feet)}</span>
                {inside ? <span className="tide__in">in window</span> : null}
              </li>
            )
          })}
        </ol>

        <div className="readout__foot">
          <p>
            Range today <span className="num">{feet(range)}</span>. Times are venue
            local. Levels are feet above MLLW, the datum NOAA predicts against.
          </p>
          <p>
            Station <span className="num">{station.id}</span>, {station.name},{' '}
            <span className="num">{distanceKm.toFixed(1)}km</span> from the venue.
          </p>
          {!distant ? null : (
            <p className="tide__warn">
              That station is <span className="num">{Math.round(distanceKm)}km</span>{' '}
              away. Tide phase and range shift along an estuary, so treat these times
              as approximate for this venue.
            </p>
          )}
          <p>
            Predicted by NOAA, not measured. Wind and river flow move real water
            away from the prediction.
          </p>
        </div>
      </div>
    )
  }

  return (
    <Panel index="04" title="Tide">{body()}</Panel>
  )
}
