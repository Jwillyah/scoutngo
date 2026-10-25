import type { SetupTarget } from './mode.ts'
import type { VenueErrors } from './venue.ts'
import { hasErrors } from './venue.ts'

/**
 * WHY A GENERATE CANNOT RUN, AS A VALUE.
 *
 * WHAT WAS REPORTED. "I tap it and nothing happens. No positions, no spinner,
 * no error." Measured in the browser on the real shoot's state, a pin and a
 * date and the Drone chip but no typed brief:
 *
 *   DIAG tap   {hasErrors:false, staleBrief:false, briefLen:0, mode:"plan"}
 *   DIAG stop  guard 2, empty brief -> setMode('setup') + setGeneration(error)
 *   rail after tap   Setup=step, Plan=null
 *   request sent     (map tiles only; no /api/generate)
 *   .stages shown    false
 *   message on screen []
 *
 * The reason WAS computed. It was written into generation state as an error
 * string, and then the same handler navigated to SETUP, which unmounts
 * PlanStatus, which is the only thing that renders that string. The app knew
 * exactly what was wrong and threw the sentence away in the same breath.
 *
 * THE BRIEF BEING EMPTY IS NOT AN EDGE CASE, it is now the normal state. The
 * brief box was demoted when the chips arrived, and `eventDescription` is only
 * ever written by the Describe model call. A shooter who taps Sunrise and Drone
 * and never opens Describe has an empty brief every time, so the most common
 * setup in the app hit the one guard with no visible outcome.
 *
 * SO THE REASON IS A VALUE RATHER THAN A SIDE EFFECT. It is computed here,
 * rendered on the screen the button is on, and the navigation to Setup becomes
 * something the shooter chooses after reading it rather than something that
 * happens to them instead of being told.
 */
export interface GenerateBlock {
  /** What to say, in the shooter's terms. */
  message: string
  /** What tapping "Fix it" should point at in Setup, or null to just go there. */
  field: SetupTarget | 'brief' | null
  /** The label on the button that goes and fixes it. */
  action: string
}

/**
 * Whether a generate can run, and if not, why.
 *
 * Pure, so the reason can be asserted in a test rather than discovered on a
 * phone in a car park.
 */
export function generateBlock(input: {
  errors: VenueErrors
  missing: SetupTarget | null
}): GenerateBlock | null {
  if (hasErrors(input.errors)) {
    return {
      message:
        'The venue is not complete enough to ask about. Setup will show which field is missing.',
      field: input.missing,
      action: 'Finish setup',
    }
  }

  /*
   * A STALE BRIEF NO LONGER BLOCKS. It did, when Suggest sent the brief to a
   * model: a brief describing somewhere the pin had left was a wrong fact in
   * the prompt. Suggest is arithmetic now (src/core/suggest.ts) and never
   * reads the brief, so blocking on it would be a reason that is not true.
   */

  /*
   * THE TYPED BRIEF IS NOT REQUIRED, AND THE GUARD THAT REQUIRED IT IS GONE.
   *
   * It used to block here on an empty eventDescription. That was the right
   * instinct aimed at the wrong thing: the failure it was protecting against
   * is a model handed a satellite image and NOTHING ELSE, which once invented
   * a marina shoot at an apartment complex. The fix for that is to send
   * something true, not to demand prose.
   *
   * The chips already say what the shoot is, more precisely than a sentence
   * would: "Sunrise" is a band of the sun's own altitude computed for this
   * venue on this date, and "Drone" is a platform the parser enforces. So the
   * brief is built from them in src/core/shootBrief.ts, and that text states
   * plainly that no event was described and must not be invented.
   *
   * Requiring the sentence as well re-added, as a gate, the text box the chips
   * were built to demote.
   *
   * WHAT STILL BLOCKS is the case where there genuinely is nothing: no pin, no
   * date. That is the branch above, and it is unchanged.
   */
  return null
}
