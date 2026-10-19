import {
  PHASE_LABEL,
  anticollisionRequired,
  nightTrainingRequired,
  part107Applies,
  phaseRequirements,
  type FlyingContext,
  type LightPhase,
} from '../core/nightWindow.ts'

/*
 * WHAT THE LIGHT PHASE REQUIRES, AT THE MOMENT ON THE STRIP.
 *
 * IT WAS INSIDE THE TIME SCRUBBER, which is why it moved: the scrubber is a
 * control now, 34px of clock and rail, and a regulatory requirement is not a
 * control. The light card is the card about the phase, so this is where the
 * phase's consequences belong.
 *
 * STATED AS THE RULE AND THE BOUNDARY, NEVER AS A VERDICT ON THE FLIGHT. The
 * app says what the regulation requires and when it starts. It does not say
 * whether to fly, here or anywhere.
 *
 * THE TWO REQUIREMENTS HAVE DIFFERENT BOUNDARIES AND ARE LISTED SEPARATELY
 * FOR THAT REASON: 107.29 lighting starts at sunset, 107.65 night training
 * starts at dusk. Collapsing them into "night rules" would misstate both
 * edges.
 *
 * THE BAND ALWAYS, THE AIRCRAFT RULES ONLY WHEN SOMETHING FLIES. Civil
 * twilight is when the light is, which is why a ground shooter is standing
 * there, so the phase and its boundary are not conditional. 107.29 and
 * 107.65 govern an uncrewed aircraft, and with GROUND 1 and AIR 0 there is
 * no aircraft for them to govern.
 */
export function PhaseRule({
  phase,
  flying,
}: {
  /** The phase at the scrubbed moment, or null with nothing to compute from. */
  phase: LightPhase | null
  flying: FlyingContext
}) {
  /* Plain daylight requires nothing, and an empty box saying so is worse. */
  if (phase === null || phase === 'day') return null

  const requirements = phaseRequirements(phase, flying)

  return (
    <div className={`scrub__rule scrub__rule--${phase}`}>
      <p className="scrub__rule-phase">
        <span className="scrub__rule-tag">{PHASE_LABEL[phase]}</span>
        {!part107Applies(flying) ? null : (
          <>
            {anticollisionRequired(phase) ? (
              <span className="scrub__rule-need">Anti-collision lights</span>
            ) : null}
            {nightTrainingRequired(phase) ? (
              <span className="scrub__rule-need">107.65 night training</span>
            ) : null}
          </>
        )}
      </p>
      {requirements.length === 0 ? null : (
        <ul className="scrub__rule-list">
          {requirements.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
