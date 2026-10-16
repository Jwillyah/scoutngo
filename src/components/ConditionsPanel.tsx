import type { WindHeight } from '../core/windHeight.ts'
import type { SightlineCloud } from '../core/cloud.ts'
import type { LatLon } from '../core/geo.ts'
import type { TideState } from '../core/tide.ts'
import type { LevelWind } from '../core/windProfile.ts'
import type { Wind } from '../core/upwind.ts'
import type { TideInfo } from '../lib/useTide.ts'
import type { VenueWindow } from '../lib/venue.ts'
import { CamList } from './CamList.tsx'
import { Panel } from './Panel.tsx'
import { SunReadout } from './SunReadout.tsx'
import { WeatherPanel } from './WeatherPanel.tsx'

interface ConditionsPanelProps {
  venueWindow: VenueWindow | null
  tide: TideInfo
  scrubbedAt: Date | null
  venue: LatLon | null
  /** Ground wind, which is what the cam ranking wants. Null until it answers. */
  wind: Wind | null
  /** All four served heights, for interpolating to a flight altitude. */
  windLevels: LevelWind[]
  gustMps: number | null
  /** The hour the wind is for, and whether it has already happened. */
  windAt: Date | null
  windPast: boolean
  /** Which height the wind is read at, and whether that height is assumed. */
  windHeight: WindHeight
  ratedWindMps: number | null
  ratedWindSource: string
  tideNow: TideState | null
  cloud: SightlineCloud | null
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
  windLevels,
  gustMps,
  windAt,
  windPast,
  windHeight,
  ratedWindMps,
  ratedWindSource,
  tideNow,
  cloud,
}: ConditionsPanelProps) {
  return (
    <>
      {/*
        * WEATHER FIRST, because it is what the panel is for now. Three
        * readings: wind at the height being flown, tide state and the next
        * turn, cloud on the sightline. Everything for the scrubbed moment.
        */}
      <Panel index="03" title="Weather">
        <WeatherPanel
          at={windAt ?? scrubbedAt}
          timeZone={venueWindow?.timeZone ?? null}
          past={windPast}
          levels={windLevels}
          gustMps={gustMps}
          windHeight={windHeight}
          ratedWindMps={ratedWindMps}
          ratedWindSource={ratedWindSource}
          tide={tide}
          tideNow={tideNow}
          cloud={cloud}
        />
      </Panel>

      {/*
        * The sun detail keeps its own panel. It is the layer every later claim
        * about light is checked against, and it carries the peak.
        */}
      <SunReadout venueWindow={venueWindow} />

      <Panel index="05" title="Sky cameras">
        <CamList venue={venue} wind={wind} />
      </Panel>
    </>
  )
}
