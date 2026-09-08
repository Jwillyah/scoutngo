import type { GenerationState } from '../lib/planRequest.ts'
import type { VenueDraft, VenueErrors } from '../lib/venue.ts'
import { VenueForm } from './VenueForm.tsx'

interface PlanPanelProps {
  venue: VenueDraft
  errors: VenueErrors
  onVenueChange: (next: VenueDraft) => void
  venueOpen: boolean
  onVenueToggle: () => void
  revealAllErrors: boolean
  generation: GenerationState
  /** Set when Overpass could not be reached, so siting was not checked. */
  siteNote: string | null
}

/** The raw response, shown whenever parsing fails, so this is never a dead end. */
function RawResponse({ reason, raw }: { reason: string; raw: string }) {
  return (
    <div className="raw">
      <p className="raw__head">Could not read the response</p>
      <p className="raw__reason">{reason}</p>
      <p className="raw__hint">
        The exact text the model returned is below. Nothing was discarded.
      </p>
      <pre className="raw__body">{raw === '' ? '(the response was empty)' : raw}</pre>
    </div>
  )
}

export function PlanPanel({
  venue,
  errors,
  onVenueChange,
  venueOpen,
  onVenueToggle,
  revealAllErrors,
  generation,
  siteNote,
}: PlanPanelProps) {
  return (
    <>
      {generation.status === 'working' ? (
        <p className="notice">Asking the model for positions. This takes a few seconds.</p>
      ) : null}

      {generation.status === 'error' ? (
        <p className="notice notice--hazard">{generation.message}</p>
      ) : null}

      {generation.status === 'done' ? (
        <p className="notice">
          {generation.count} positions placed. Lighting and field of view are computed
          by the app, not by the model.
          {generation.dropped > 0
            ? ` ${generation.dropped} were dropped for naming a lens that is not in your kit.`
            : ''}
        </p>
      ) : null}

      {siteNote === null ? null : <p className="notice">{siteNote}</p>}

      {generation.status === 'raw' ? (
        <RawResponse reason={generation.reason} raw={generation.raw} />
      ) : null}

      <VenueForm
        value={venue}
        errors={errors}
        onChange={onVenueChange}
        open={venueOpen}
        onToggle={onVenueToggle}
        revealAllErrors={revealAllErrors}
      />
    </>
  )
}
