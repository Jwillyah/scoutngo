import type { LatLon } from '../core/geo.ts'
import type { DescribeState, DesiredShot } from '../lib/describe.ts'
import type { SearchHit } from '../lib/search.ts'
import type { KitSelection } from '../lib/kitSelection.ts'
import type { Spot } from '../lib/spots.ts'
import type { VenueDraft, VenueErrors } from '../lib/venue.ts'
import { Collapsible } from './Collapsible.tsx'
import { DescribeShoot } from './DescribeShoot.tsx'
import { KitProfile } from './KitProfile.tsx'
import { VenueThumb } from './VenueThumb.tsx'
import { SpotsPanel } from './SpotsPanel.tsx'
import { StaleBrief } from './StaleBrief.tsx'
import { VenueForm } from './VenueForm.tsx'

interface SetupModeProps {
  venue: VenueDraft
  errors: VenueErrors
  onVenueChange: (next: VenueDraft) => void
  revealAllErrors: boolean
  staleBrief: boolean
  drift: string
  onClearBrief: () => void
  onKeepBrief: () => void
  kit: KitSelection
  onKit: (next: KitSelection) => void
  spots: Spot[]
  onSaveSpot: (name: string) => void
  onLoadSpot: (spot: Spot) => void
  onDeleteSpot: (id: string) => void
  onImportSpots: (incoming: Spot[]) => void
  suggestedName: string
  canSave: boolean
  /* The one input at the front, and everything it produces. */
  describeText: string
  onDescribeText: (next: string) => void
  describeState: DescribeState
  onDescribe: () => void
  venueChoices: SearchHit[]
  onPickVenue: (hit: SearchHit) => void
  shotListText: string
  onShotListText: (next: string) => void
  desiredShots: DesiredShot[]
  parsedFields: string[]
  onFieldTyped: (field: string) => void
  /** Coordinates, once they resolve. Drives the thumbnail. */
  at: LatLon | null
}

/**
 * SETUP: everything decided before the day.
 *
 * A plain scrolling page. No sheet, no accordions, no tabs. Every block is open
 * because there is nothing here worth hiding: this is done at a desk, once, and
 * the cost of scrolling past a section you do not need is far lower than the
 * cost of not finding one you do.
 *
 * Absorbs the old KIT and SPOTS tabs. Spots stop being a destination and become
 * what they always were, a way to start from a setup you already made.
 */
export function SetupMode({
  venue,
  errors,
  onVenueChange,
  revealAllErrors,
  staleBrief,
  drift,
  onClearBrief,
  onKeepBrief,
  kit,
  onKit,
  spots,
  onSaveSpot,
  onLoadSpot,
  onDeleteSpot,
  onImportSpots,
  suggestedName,
  canSave,
  describeText,
  onDescribeText,
  describeState,
  onDescribe,
  venueChoices,
  onPickVenue,
  shotListText,
  onShotListText,
  desiredShots,
  parsedFields,
  onFieldTyped,
  at,
}: SetupModeProps) {
  /* Settings start shut once they are configured. Steps never do. */
  const kitConfigured = kit.lensIds.length > 0 && kit.bodyIds.length > 0

  return (
    <div className="page page--setup">
      {/* Confirmation that the geocoder found the right place, before anything else. */}
      <VenueThumb at={at} label={venue.name} />

      <DescribeShoot
        text={describeText}
        onText={onDescribeText}
        state={describeState}
        onRead={onDescribe}
        choices={venueChoices}
        onPickVenue={onPickVenue}
        shotListText={shotListText}
        onShotListText={onShotListText}
        desiredShots={desiredShots}
      />

      <StaleBrief
        staleBrief={staleBrief}
        drift={drift}
        onClearBrief={onClearBrief}
        onKeepBrief={onKeepBrief}
      />

      <VenueForm
        value={venue}
        errors={errors}
        onChange={onVenueChange}
        revealAllErrors={revealAllErrors}
        parsedFields={parsedFields}
        onFieldTyped={onFieldTyped}
      />

      {/* Settings, not steps: shut once configured. */}
      <Collapsible
        index="02"
        title="Kit and style"
        summary={`${kit.bodyIds.length} bodies, ${kit.lensIds.length} lenses, ${kit.droneIds.length} air`}
        defaultOpen={!kitConfigured}
      >
        <KitProfile value={kit} onChange={onKit} />
      </Collapsible>

      <Collapsible
        index="03"
        title="Saved setups"
        summary={spots.length === 0 ? 'None saved' : `${spots.length} saved`}
        defaultOpen={false}
      >
        <SpotsPanel
          spots={spots}
          onSave={onSaveSpot}
          onLoad={onLoadSpot}
          onDelete={onDeleteSpot}
          onImport={onImportSpots}
          suggestedName={suggestedName}
          canSave={canSave}
        />
      </Collapsible>
    </div>
  )
}
