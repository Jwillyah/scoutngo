import type { LatLon } from '../core/geo.ts'
import type { ShootKind } from '../core/shootWindow.ts'
import { shootPreset } from './shootPreset.ts'

/**
 * WHETHER A CHIP SETS THE WINDOW, AND WHAT IT SAYS WHEN IT DOES NOT.
 *
 * WHAT WAS REPORTED. "I tapped Sunset at Sandbridge and the window stayed
 * 3:00-7:00 PM. The hint says 'Drop the venue pin and the chip will set the
 * window too', so it only works if I drop the pin first. That ordering trap is
 * on me to remember and it should not be."
 *
 * It was correct and useless. The chip handler ran once, on the tap, and a tap
 * made before the pin existed could do nothing but leave a note explaining
 * that it had done nothing. Nothing ever came back to finish the job.
 *
 * SO THE RULE IS A CONDITION, NOT AN EVENT: whenever a kind and a pin and a
 * date all exist, the window follows the chip, in whichever order they
 * arrived. Expressed here as a pure function so it can be asked repeatedly
 * from an effect, and so the ordering can be tested without a map.
 *
 * TYPED TIMES ARE NEVER OVERWRITTEN, and the difference matters: a window the
 * app chose is a guess waiting to be improved, and a window the shooter typed
 * is an instruction. The source is tracked for exactly that reason, because
 * "has it been changed" cannot tell the two apart once a chip has changed it
 * once.
 */
export type WindowSource = 'default' | 'chip' | 'typed'

export type ChipWindow =
  /** Set the window to these times. */
  | { action: 'apply'; startTime: string; endTime: string; line: string }
  /** The shooter typed their own times. Left alone, and said so. */
  | { action: 'keep'; line: string }
  /** Not enough to work it out yet. Says which piece is missing. */
  | { action: 'wait'; line: string }
  /** Nothing to do, or no such event here on this date. */
  | { action: 'none'; line: string | null }

export function chipWindow(input: {
  kind: ShootKind | null
  source: WindowSource
  centre: LatLon | null
  /** yyyy-mm-dd, as the form holds it. */
  date: string
  timeZone: string | null
}): ChipWindow {
  if (input.kind === null) return { action: 'none', line: null }

  /*
   * TYPED WINS, AND IS CHECKED FIRST. Before the pin and the date, because
   * "your times are kept" is true whether or not the venue is finished, and
   * telling somebody to drop a pin so a chip can overwrite times they typed
   * on purpose would be a worse kind of wrong.
   */
  if (input.source === 'typed') {
    return {
      action: 'keep',
      line: 'Your own window is kept. Clear the times if you want the chip to set it.',
    }
  }

  if (input.centre === null) {
    return { action: 'wait', line: 'Drop the venue pin and the chip will set the window too.' }
  }
  if (input.timeZone === null || input.date === '') {
    return { action: 'wait', line: 'Set the date and the chip will set the window too.' }
  }

  const preset = shootPreset(input.kind, input.centre, input.date, input.timeZone)
  if (preset === null) {
    return { action: 'none', line: `No ${input.kind} at this latitude on that date.` }
  }

  return {
    action: 'apply',
    startTime: preset.startTime,
    endTime: preset.endTime,
    line: preset.line,
  }
}
