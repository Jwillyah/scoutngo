import type { SetupTarget } from './mode.ts'
import type { VenueDraft, VenueErrors } from './venue.ts'
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
  staleBrief: boolean
  venue: VenueDraft
}): GenerateBlock | null {
  if (hasErrors(input.errors)) {
    return {
      message:
        'The venue is not complete enough to ask about. Setup will show which field is missing.',
      field: input.missing,
      action: 'Finish setup',
    }
  }

  if (input.staleBrief) {
    return {
      message:
        'The pin moved after the brief was written, so the brief describes somewhere else. Keep it or clear it in Setup before suggesting positions.',
      field: 'brief',
      action: 'Sort out the brief',
    }
  }

  /*
   * NO BRIEF, NO CALL. Pressed at an apartment complex with an empty
   * description, this once invented a marina shoot: handed a satellite image
   * and nothing else, the model is obliged to answer, so it answered about
   * what it thought it saw. The refusal is right. Only the silence was wrong.
   */
  if (input.venue.eventDescription.trim() === '') {
    return {
      message:
        'Tell me what the shoot is first. With only a satellite image to go on I would be guessing, and a guess shaped like a plan is worse than no plan. Chips set the window and the platform; this needs words.',
      field: 'brief',
      action: 'Describe the shoot',
    }
  }

  return null
}
