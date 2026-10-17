import type { PlatformFilter } from './platformFilter.ts'
import { SHOOT_KIND_LABEL, type ShootKind } from './shootWindow.ts'

/**
 * WHAT THE SHOOT IS, BUILT FROM THE CHIPS RATHER THAN TYPED.
 *
 * WHY. The empty-brief guard was fixed by showing the reason and a button to
 * go and write one, and that was the wrong fix: "The chips already say what
 * the shoot is: Sunrise, Drone. That is the intent, structured. Making me type
 * a sentence as well re-adds the text box we just demoted, as a gate."
 *
 * And the chips are better evidence than prose. "Sunrise" is a band of the
 * sun's own altitude, computed in src/core/shootWindow.ts from this venue's
 * coordinates on this date. "Drone" is a platform the parser enforces. A typed
 * sentence saying "sunrise drone shoot" is the same two facts, less precisely,
 * with a chance of being misread on the way in.
 *
 * WHAT THIS DOES NOT DO, AND THE REASON IT EXISTS AT ALL.
 *
 * The guard it replaces was protecting against a real failure: pressed at an
 * apartment complex with an empty description, a generate once invented a
 * marina shoot. Handed a satellite image and nothing else, a model is obliged
 * to answer, so it answered about what it thought it saw.
 *
 * An empty string is what caused that. This is not an empty string, and it is
 * not an invented one either: it SAYS that no event has been described, and it
 * says so to the model in as many words. The chips describe the LIGHT and the
 * PLATFORM, which is what they know. Nobody has told the app what happens at
 * the venue, so nothing here claims to know, and the instruction not to invent
 * one is part of the text rather than a hope.
 *
 * The typed box stays, for a real client brief that adds something the chips
 * cannot say. It wins wherever it is filled in.
 */

export interface ChipIntent {
  /** The time-of-day chip, or null if none has been tapped. */
  kind: ShootKind | null
  /** The Ground/Drone/Both chip. */
  platform: PlatformFilter
  /** What the venue is called. Often a reverse geocode; may be empty. */
  venueName: string
  /** How many shots were pasted from a list. They are sent separately. */
  shotCount: number
}

export interface SynthesisedBrief {
  event: string
  outcome: string
}

const PLATFORM_SENTENCE: Record<PlatformFilter, string> = {
  air: 'Every position is a drone position: the shooter is flying, not walking.',
  ground: 'Every position is on the ground: no aircraft on this shoot.',
  both: 'Ground and air positions are both in play.',
}

/**
 * What the light is being chosen for, in the model's terms.
 *
 * NOT A TIME. The window is sent separately and the sun's actual azimuth and
 * altitude at three points across it are sent as computed facts. This says
 * what the shooter is AFTER, which is the part the numbers do not carry.
 */
const KIND_SENTENCE: Record<ShootKind, string> = {
  sunrise:
    'A sunrise shoot. The light is low, warm and moving fast, and the best of it is usually before the sun clears the horizon rather than after.',
  sunset:
    'A sunset shoot. The light is low and warm and the colour often peaks after the sun is down, so positions should still work into dusk.',
  daytime:
    'A daytime shoot. The sun is high for most of the window, so position choice is about what it is falling on rather than about catching a low angle.',
}

/** The sentence that goes where a typed description of the event would go. */
export function briefFromChips(intent: ChipIntent): SynthesisedBrief {
  const where = intent.venueName.trim()

  /*
   * NOTHING WAS DESCRIBED, AND THAT IS WHAT IT SAYS.
   *
   * An empty string here is what produced the invented marina. This is the
   * opposite: it names the absence and forbids filling it in. A model told
   * "no event was described, do not invent one" has somewhere to put the
   * uncertainty; a model told nothing has only the picture.
   */
  const event = [
    'NO EVENT WAS DESCRIBED. Nobody has told you what happens at this venue, and you must not decide for yourself.',
    where === ''
      ? 'Treat the location itself as the subject.'
      : `Treat the location itself as the subject: ${where}.`,
    'Do not invent an event, a crowd, a ceremony or an activity. If the satellite image suggests one, that is a guess and it does not go in the plan. Write each position around what is actually visible in the view and around the light.',
    intent.shotCount > 0
      ? 'A shot list was supplied separately and is the brief; work to it.'
      : '',
  ]
    .filter((line) => line !== '')
    .join(' ')

  /*
   * WHAT THEY WANT, which is the half the chips genuinely know. A null kind
   * is left out rather than defaulted: no chip tapped means no claim about
   * what the light is for.
   */
  const outcome = [
    intent.kind === null
      ? 'No time-of-day intent was set, so choose positions that work across the whole window rather than for one moment in it.'
      : KIND_SENTENCE[intent.kind],
    PLATFORM_SENTENCE[intent.platform],
    'This came from the shoot setup rather than from a written brief, so it is the shape of the day and not a list of requirements.',
  ].join(' ')

  return { event, outcome }
}

/**
 * The brief to send: what was typed, or what the chips say.
 *
 * TYPED WINS, PER FIELD. A client brief that describes the event but says
 * nothing about the outcome keeps its event text and takes the chips' outcome,
 * rather than all-or-nothing on either.
 */
export function resolveBrief(
  typed: { event: string; outcome: string },
  intent: ChipIntent,
): SynthesisedBrief {
  const chips = briefFromChips(intent)
  return {
    event: typed.event.trim() === '' ? chips.event : typed.event,
    outcome: typed.outcome.trim() === '' ? chips.outcome : typed.outcome,
  }
}

/** Whether anything the shooter typed is being sent at all. */
export function briefIsTyped(typed: { event: string; outcome: string }): boolean {
  return typed.event.trim() !== '' || typed.outcome.trim() !== ''
}

/** A short line for the screen, so the shooter knows what is being sent. */
export function briefSourceLine(intent: ChipIntent, typed: boolean): string {
  if (typed) return 'Using the brief you wrote.'
  const parts = [
    intent.kind === null ? null : SHOOT_KIND_LABEL[intent.kind],
    intent.platform === 'air' ? 'drone' : intent.platform === 'ground' ? 'ground' : null,
  ].filter((part): part is string => part !== null)

  if (parts.length === 0) return 'Using the venue and the window. No chips tapped.'
  return `Using the chips: ${parts.join(', ').toLowerCase()}.`
}
