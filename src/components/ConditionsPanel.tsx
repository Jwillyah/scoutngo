import type { TideInfo } from '../lib/useTide.ts'
import type { VenueWindow } from '../lib/venue.ts'
import { SunReadout } from './SunReadout.tsx'
import { TideReadout } from './TideReadout.tsx'

interface ConditionsPanelProps {
  venueWindow: VenueWindow | null
  tide: TideInfo
  scrubbedAt: Date | null
}

/**
 * Sun and tide detail, behind ONE control rather than a tab of its own.
 *
 * The headline numbers already live where they are used: sun bearing on the map
 * HUD and the scrubber, tide turns marked on the scrubber track. A whole tab for
 * the detail implied it was a place to go, when it is something to check.
 */
export function ConditionsPanel({ venueWindow, tide, scrubbedAt }: ConditionsPanelProps) {
  return (
    <>
      <SunReadout venueWindow={venueWindow} />
      <TideReadout tide={tide} venueWindow={venueWindow} scrubbedAt={scrubbedAt} />
    </>
  )
}
