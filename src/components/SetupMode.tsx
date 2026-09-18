import type { KitSelection } from '../lib/kitSelection.ts'
import type { Spot } from '../lib/spots.ts'
import type { VenueDraft, VenueErrors } from '../lib/venue.ts'
import { KitProfile } from './KitProfile.tsx'
import { Panel } from './Panel.tsx'
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
}: SetupModeProps) {
  return (
    <div className="page">
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
      />

      <KitProfile value={kit} onChange={onKit} />

      {/* Spots stop being a tab and become what they are: a way to start from
          a setup you already made. */}
      <Panel index="03" title="Saved setups">
        <SpotsPanel
          spots={spots}
          onSave={onSaveSpot}
          onLoad={onLoadSpot}
          onDelete={onDeleteSpot}
          onImport={onImportSpots}
          suggestedName={suggestedName}
          canSave={canSave}
        />
      </Panel>
    </div>
  )
}
