import {
  PHASE_LABEL,
  anticollisionRequired,
  nightTrainingRequired,
  phaseRequirements,
  type LightPhase,
  type PhaseSpan,
} from '../core/nightWindow.ts'
import type { SunPosition } from '../core/sun.ts'
import { positionInWindow, type TideExtreme } from '../core/tide.ts'
import { formatClock } from '../core/timezone.ts'

interface TimeScrubberProps {
  start: Date
  end: Date
  /** 0 at the start of the window, 1 at the end. */
  value: number
  onChange: (next: number) => void
  at: Date
  sun: SunPosition
  /** The venue's IANA zone. Every time on this bar is a venue wall clock. */
  timeZone: string
  /** Short form of that zone, "EDT", shown beside the time so it is never a guess. */
  timeZoneAbbr: string
  /**
   * High and low water falling inside the window. Marked on the track so a
   * window that straddles a turn is visible at a glance rather than only after
   * opening the Conditions tab.
   */
  tideExtremes: TideExtreme[]
  /**
   * DAY, CIVIL TWILIGHT AND NIGHT ACROSS THE WINDOW, as bands on the track.
   *
   * The app already held these boundaries and never drew them. A window
   * reported as "blue hour peak 18:44 to 18:53" sat entirely inside civil
   * twilight, where anti-collision lighting is required, and nothing on the
   * screen said so. Empty when the venue has no location to compute from.
   */
  phases: PhaseSpan[]
  /** The phase at the scrubbed moment, or null with nothing to compute from. */
  phase: LightPhase | null
}

/**
 * Scrubs through the entered window. Everything downstream, the sun rays and
 * every cone's lighting color, recomputes from the scrubbed time, which is what
 * makes a four hour window visibly flip from backlit to front-lit.
 */
export function TimeScrubber({
  start,
  end,
  value,
  onChange,
  at,
  sun,
  timeZone,
  timeZoneAbbr,
  tideExtremes,
  phases,
  phase,
}: TimeScrubberProps) {
  const clock = (date: Date) => formatClock(date, timeZone)

  /*
   * Bands as a share of the track, clipped to it. positionInWindow already
   * answers "where on this bar" for tide turns, and a band is the same
   * question asked of two instants instead of one.
   */
  const span = end.getTime() - start.getTime()
  const bands =
    span <= 0
      ? []
      : phases.map((p) => ({
          phase: p.phase,
          left: Math.max(0, (p.start.getTime() - start.getTime()) / span),
          right: Math.min(1, (p.end.getTime() - start.getTime()) / span),
        })).filter((b) => b.right > b.left)

  /* Only the turns that actually fall on the track can be drawn on it. */
  const marks = tideExtremes
    .map((e) => ({ extreme: e, share: positionInWindow(e.at, start, end) }))
    .filter((m): m is { extreme: TideExtreme; share: number } => m.share !== null)

  return (
    <div className="scrub">
      <div className="scrub__readout">
        <span className="scrub__time num">{clock(at)}</span>
        <span className="scrub__zone">{timeZoneAbbr}</span>
        <span className="scrub__stat">
          <span className="scrub__stat-label">Az</span>
          <span className="num">{sun.azimuth.toFixed(1)}°</span>
        </span>
        <span className="scrub__stat">
          <span className="scrub__stat-label">Alt</span>
          <span className="num">{sun.altitude.toFixed(1)}°</span>
        </span>
      </div>

      {marks.length === 0 ? null : (
        <div className="scrub__tide" aria-hidden="true">
          {marks.map(({ extreme, share }) => (
            <span
              key={extreme.at.toISOString()}
              className={`scrub__turn scrub__turn--${extreme.kind}`}
              style={{ left: `${share * 100}%` }}
            >
              <span className="scrub__turn-tag">{extreme.kind === 'high' ? 'HW' : 'LW'}</span>
            </span>
          ))}
        </div>
      )}

      {bands.length === 0 ? null : (
        <div className="scrub__phases" aria-hidden="true">
          {bands.map((band) => (
            <span
              key={`${band.phase}-${band.left}`}
              className={`scrub__phase scrub__phase--${band.phase}`}
              style={{ left: `${band.left * 100}%`, width: `${(band.right - band.left) * 100}%` }}
            />
          ))}
        </div>
      )}

      <input
        className="scrub__range"
        type="range"
        min={0}
        max={1000}
        value={Math.round(value * 1000)}
        aria-label="Time through the window"
        aria-valuetext={[
          `${clock(at)} ${timeZoneAbbr}`,
          `sun at ${sun.azimuth.toFixed(1)} degrees`,
          ...marks.map((m) => `${m.extreme.kind} water at ${clock(m.extreme.at)}`),
        ].join(', ')}
        onChange={(event) => onChange(Number(event.target.value) / 1000)}
      />

      {/*
        * WHAT THE PHASE REQUIRES, AT THE MOMENT ON THE BAR.
        *
        * Stated as the rule and the boundary, never as a verdict on the
        * flight. The two requirements have DIFFERENT boundaries and are listed
        * separately for that reason: 107.29 lighting starts at sunset, and
        * 107.65 night training starts at dusk. Collapsing them into "night
        * rules" would misstate both edges.
        */}
      {phase === null || phaseRequirements(phase).length === 0 ? null : (
        <div className={`scrub__rule scrub__rule--${phase}`}>
          <p className="scrub__rule-phase">
            <span className="scrub__rule-tag">{PHASE_LABEL[phase]}</span>
            {anticollisionRequired(phase) ? (
              <span className="scrub__rule-need">Anti-collision lights</span>
            ) : null}
            {nightTrainingRequired(phase) ? (
              <span className="scrub__rule-need">107.65 night training</span>
            ) : null}
          </p>
          <ul className="scrub__rule-list">
            {phaseRequirements(phase).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {/*
        * NO END LABELS. They printed the window's start and end directly under
        * the peek summary, which states the same window WITH its timezone. Two
        * bars apart, the same two numbers, and the zone only on one of them.
        * The scrubber owns the moment; the summary owns the window.
        */}
    </div>
  )
}
