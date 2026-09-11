import {
  GENERATE_STAGES,
  stageIndex,
  type GenerateStage,
  type GenerationState,
} from '../lib/planRequest.ts'
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
  /** The venue has moved far from where the brief text was written. */
  staleBrief: boolean
  drift: string
  onClearBrief: () => void
  onKeepBrief: () => void
}

/**
 * Where a generate has got to.
 *
 * Every line is a step the code actually takes, and the active one is whatever
 * App.onGenerate last set before awaiting. There is no timer and no interpolation
 * inside a step: `capture` and `lighting` are arithmetic and pass in a frame, and
 * the honest thing is for them to pass in a frame rather than be padded out to look
 * like progress. The two that hold the button are `terrain`, waiting on Overpass,
 * and `positions`, waiting on the model.
 */
function GenerateProgress({ stage }: { stage: GenerateStage }) {
  const active = stageIndex(stage)

  return (
    <ol className="stages" aria-live="polite">
      {GENERATE_STAGES.map((entry, index) => {
        const state = index < active ? 'done' : index === active ? 'now' : 'next'
        return (
          <li key={entry.key} className={`stages__step stages__step--${state}`}>
            <span className="stages__mark" aria-hidden="true" />
            <span className="stages__label">{entry.label}</span>
            {state === 'now' ? <span className="stages__state">working</span> : null}
            {state === 'done' ? <span className="stages__state">done</span> : null}
          </li>
        )
      })}
    </ol>
  )
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
  staleBrief,
  drift,
  onClearBrief,
  onKeepBrief,
}: PlanPanelProps) {
  return (
    <>
      {/*
        * The brief is text about one specific place. Moving the venue does not
        * make it wrong automatically, but it does make it suspect, and only the
        * shooter can say which. So this blocks Generate until it is answered,
        * and never edits the text on its own.
        */}
      {!staleBrief ? null : (
        <div className="stale">
          <p className="stale__head">This brief may be about somewhere else</p>
          <p className="stale__body">
            The venue has moved <span className="num">{drift}</span> from where this
            event description was written. Generating now would plan the old event
            at the new place.
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn--small btn--primary" onClick={onClearBrief}>
              Clear the brief
            </button>
            <button type="button" className="btn btn--small" onClick={onKeepBrief}>
              Keep it, still applies
            </button>
          </div>
        </div>
      )}

      {generation.status === 'working' ? <GenerateProgress stage={generation.stage} /> : null}

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
