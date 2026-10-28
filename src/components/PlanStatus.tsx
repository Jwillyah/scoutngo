import type { SuggestSummary } from '../lib/suggestRun.ts'
import {
  GENERATE_STAGES,
  stageIndex,
  type GenerateStage,
  type GenerationState,
} from '../lib/generation.ts'
import type { PlanCoverage } from '../lib/plan.ts'
import type { SetupTarget } from '../lib/mode.ts'
import { CoverageNotice } from './CoverageNotice.tsx'

interface PlanStatusProps {
  generation: GenerationState
  /** Goes and fixes whatever a block named. See src/lib/generateGate.ts. */
  onFixBlock: (field: SetupTarget | null) => void
  planCoverage: PlanCoverage | null
  /** Set when Overpass could not be reached, so siting was not checked. */
  siteNote: string | null
  /**
   * Set when terrain was flattened to take the image this plan came from.
   *
   * SAME TONE AND SAME REASON AS siteNote: it names something the plan could
   * not take into account. The model placed these positions on a flat map, so
   * on a ridgeline venue it did not know a position is over a drop.
   */
  terrainNote: string | null
  /**
   * What loading a saved plan had to change to make sense of it.
   *
   * A HAZARD TONE, because it means the plan on screen is not byte for byte
   * the plan that was saved. Silently correcting somebody's saved work is how
   * a plan changes under them between one visit and the next.
   */
  positionNote: string | null
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

/*
 * WHAT SUGGEST DID, ALL OF IT. Every candidate is accounted for: how many were
 * tried, how many each step dropped and why, what survived, why each pick was
 * picked and why the nearest runners-up lost. A result that cannot say why it
 * chose is a result nobody can check, which is the reason a model no longer
 * chooses. See src/core/suggest.ts.
 */
function SuggestAccount({ count, summary }: { count: number; summary: SuggestSummary }) {
  return (
    <div className="suggested">
      <p className="notice">
        {count === 0 ? 'No position survived.' : `${count} positions, worked out, not asked for.`}{' '}
        <span className="num">
          {summary.considered} tried, {summary.survivors} survived.
        </span>
      </p>
      {summary.picked.length === 0 ? null : (
        <ol className="suggested__picks">
          {summary.picked.map((why) => (
            <li key={why}>{why}</li>
          ))}
        </ol>
      )}
      {/* The venue-wide aerial: its own line, after the framing spots it is not one of. */}
      {summary.hero === undefined ? null : <p className="suggested__hero">{summary.hero}</p>}
      <details className="suggested__more">
        <summary>Why the others were dropped</summary>
        <ul className="suggested__drops num">
          {summary.drops
            .filter((d) => d.count > 0)
            .map((d) => (
              <li key={d.step}>
                {d.count} {d.step}
              </li>
            ))}
        </ul>
        {summary.runnersUp.length === 0 ? null : (
          <ul className="suggested__runners">
            {summary.runnersUp.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </details>
      {summary.notes.map((note) => (
        <p className="suggested__note" key={note}>
          {note}
        </p>
      ))}
    </div>
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
export function PlanStatus({
  generation,
  onFixBlock,
  planCoverage,
  siteNote,
  terrainNote,
  positionNote,
}: PlanStatusProps) {
  return (
    <>
      {generation.status === 'working' ? <GenerateProgress stage={generation.stage} /> : null}

      {positionNote === null ? null : (
        <p className="notice notice--warn">{positionNote}</p>
      )}

      {generation.status === 'error' ? (
        <p className="notice notice--hazard">{generation.message}</p>
      ) : null}

      {/*
        * BLOCKED IS NOT BROKEN, AND IT IS NEVER SILENT.
        *
        * The reported bug: tapping Suggest positions did nothing at all. The
        * handler computed the reason, wrote it into this state, and navigated
        * to Setup in the same breath, which unmounted this component before it
        * drew. So the one thing the app knew was thrown away.
        *
        * It stays on this screen now, and the way to Setup is a button the
        * shooter presses after reading why, rather than something that happens
        * to them instead of being told.
        */}
      {generation.status === 'blocked' ? (
        <div className="notice notice--blocked">
          <p className="notice__text">{generation.block.message}</p>
          <button
            type="button"
            className="notice__go"
            onClick={() => onFixBlock(generation.block.field)}
          >
            {generation.block.action}
          </button>
        </div>
      ) : null}

      {/*
        * Not a hazard. An optional feature that is not configured is a fact
        * about this install, and saying it in red next to "this position is in
        * water" would teach people to ignore the colour that matters.
        */}
      {generation.status === 'no-key' ? (
        <p className="notice notice--off">
          {generation.message} Place positions yourself with Add position, which
          is the primary way to build a plan.
        </p>
      ) : null}

      {generation.status === 'done' ? (
        generation.summary === undefined ? (
          <p className="notice">
            {generation.count} positions placed. Lighting and field of view are computed
            by the app.
          </p>
        ) : (
          <SuggestAccount count={generation.count} summary={generation.summary} />
        )
      ) : null}

      <CoverageNotice planCoverage={planCoverage} />

      {siteNote === null ? null : <p className="notice">{siteNote}</p>}
      {terrainNote === null ? null : <p className="notice">{terrainNote}</p>}

      {generation.status === 'raw' ? (
        <RawResponse reason={generation.reason} raw={generation.raw} />
      ) : null}
    </>
  )
}
