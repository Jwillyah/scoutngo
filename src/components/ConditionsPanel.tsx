import type { LatLon } from '../core/geo.ts'
import type { Wind } from '../core/upwind.ts'
import type { TideInfo } from '../lib/useTide.ts'
import type { VenueWindow } from '../lib/venue.ts'
import { CamList } from './CamList.tsx'
import { Panel } from './Panel.tsx'
import { SunReadout } from './SunReadout.tsx'
import { TideReadout } from './TideReadout.tsx'

interface ConditionsPanelProps {
  venueWindow: VenueWindow | null
  tide: TideInfo
  scrubbedAt: Date | null
  venue: LatLon | null
  /** Null until the wind lookup answers, or when it fails. */
  wind: Wind | null
  gustMps: number | null
}

/**
 * Sun and tide detail, behind ONE control rather than a tab of its own.
 *
 * The headline numbers already live where they are used: sun bearing on the map
 * HUD and the scrubber, tide turns marked on the scrubber track. A whole tab for
 * the detail implied it was a place to go, when it is something to check.
 */
export function ConditionsPanel({
  venueWindow,
  tide,
  scrubbedAt,
  venue,
  wind,
  gustMps,
}: ConditionsPanelProps) {
  return (
    <>
      <SunReadout venueWindow={venueWindow} />
      <TideReadout tide={tide} venueWindow={venueWindow} scrubbedAt={scrubbedAt} />

      {/*
        * WIND, then the cameras it ranks.
        *
        * Wind earns its own readout before the cams do: for anyone flying, the
        * speed and the gust decide whether the aircraft goes up at all, and
        * that is a bigger question than which camera to look at.
        */}
      <Panel index="05" title="Wind and sky cameras">
        {wind === null ? (
          <p className="readout__empty">
            Wind has not come back yet. Open-Meteo answers in a second or two, and the
            cameras below fall back to nearest first until it does.
          </p>
        ) : (
          <p className="windline">
            <span className="windline__value num">{Math.round(wind.speedMps)} m/s</span>
            <span className="windline__sub num">
              {Math.round(wind.speedMps * 2.237)} mph
            </span>
            <span className="windline__from num">from {Math.round(wind.fromDegrees)}°</span>
            {gustMps === null ? null : (
              <span className="windline__gust num">
                gusting {Math.round(gustMps)} m/s · {Math.round(gustMps * 2.237)} mph
              </span>
            )}
          </p>
        )}
        <CamList venue={venue} wind={wind} />
      </Panel>
    </>
  )
}
