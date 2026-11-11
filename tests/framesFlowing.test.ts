import { describe, expect, it } from 'vitest'
// @ts-expect-error a .mjs script without types
import { framesFlowing, MIN_FRAMES, NoFramesError } from '../scripts/preflight.mjs'

/*
 * Batch Polish 2, Section 0: the gesture audit's first-run failures were a
 * headless tab that stopped drawing frames under load. Nothing timed is
 * judged until frames are drawn; a stall is nudged, and one that never
 * clears is said to be the machine, never a gesture failure.
 */
const wait = async () => {}
describe('frames flowing before anything timed', () => {
  it('drawing: goes on at once, nothing nudged', async () => {
    let nudged = 0
    expect(await framesFlowing(async () => 18, wait, async () => void (nudged += 1))).toBe(0)
    expect(nudged).toBe(0)
  })
  it('stalled, then a nudge gets the frames going: waits for them', async () => {
    const counts = [0, 0, 1, MIN_FRAMES + 3]
    let nudged = 0
    expect(await framesFlowing(async () => counts.shift() ?? 20, wait, async () => void (nudged += 1))).toBe(3)
    expect(nudged).toBe(3)
  })
  it('never drawing: the machine is named, not the gesture', async () => {
    await expect(framesFlowing(async () => 0, wait, async () => {})).rejects.toBeInstanceOf(NoFramesError)
  })
})
