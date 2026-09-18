import {
  GENERATE_STAGES,
  stageIndex,
  type GenerateStage,
  type GenerationState,
} from '../lib/planRequest.ts'
import type { PlanCoverage } from '../lib/plan.ts'
import { CoverageNotice } from './CoverageNotice.tsx'

interface PlanStatusProps {
  generation: GenerationState
  planCoverage: PlanCoverage | null
  /** Set when Overpass could not be reached, so siting was not checked. */
  siteNote: string | null
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

/**
 * What the last generate did, and how good the resulting plan is.
 *
 * Split out of the old PlanPanel, which also carried the venue form and the
 * stale brief guard. Those are SETUP concerns, decided at home; this is about
 * the work and stays with the map.
 */
export function PlanStatus({ generation, planCoverage, siteNote }: PlanStatusProps) {
  return (
    <>
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

      <CoverageNotice planCoverage={planCoverage} />

      {siteNote === null ? null : <p className="notice">{siteNote}</p>}

      {generation.status === 'raw' ? (
        <RawResponse reason={generation.reason} raw={generation.raw} />
      ) : null}
    </>
  )
}
