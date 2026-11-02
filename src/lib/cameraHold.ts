/*
 * NOTHING THE APP DOES MOVES THE CAMERA UNDER A FINGER (Batch H, 2 Nov 9:36 AM:
 * pinch zoom still snapped on the real iPhone, home-screen app, satellite).
 *
 * The earlier guard held a camera write only while a finger was down, and
 * released it the instant the last one lifted. A two-finger pinch does not
 * lift both fingers in the same event: the first lift leaves one finger down
 * and MapLibre turns the pinch into a drag, the second ends it, and the map
 * may still be settling its zoom. A write released into that moment moved a
 * camera the hand had just let go of. And the terrain switch (setTerrain),
 * which moves the camera's elevation and so where the zoom lands, did not go
 * through the guard at all: it was flipped off at zoomstart and on at zoomend,
 * in the middle of the pinch, by a React effect.
 *
 * Now every camera write the app makes, terrain included, goes through one
 * hold: while any finger is down, and for HOLD_AFTER_LIFT_MS after the last
 * one lifts. The latest write per caller waits; older ones from the same
 * caller would be stale.
 */
export const HOLD_AFTER_LIFT_MS = 600

export interface HoldClock {
  now(): number
  later(run: () => void, ms: number): unknown
  cancel(handle: unknown): void
}

const realClock: HoldClock = {
  now: () => (typeof performance === 'undefined' ? Date.now() : performance.now()),
  later: (run, ms) => setTimeout(run, ms),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export class CameraHold {
  private fingers = 0
  private liftedAt = -Infinity
  private timer: unknown = null
  private readonly waiting = new Map<string, () => void>()
  private readonly clock: HoldClock
  private readonly log: (line: string) => void
  /** Asked before a release: true while the map is still coasting from the hand. */
  private readonly busy: () => boolean

  constructor(opts: { clock?: HoldClock; log?: (line: string) => void; busy?: () => boolean } = {}) {
    this.clock = opts.clock ?? realClock
    this.log = opts.log ?? (() => {})
    this.busy = opts.busy ?? (() => false)
  }

  /** True while a camera write must wait. */
  held(): boolean {
    return this.fingers > 0 || this.clock.now() - this.liftedAt < HOLD_AFTER_LIFT_MS
  }

  /** Runs the write now, or keeps it (the latest per tag) until the hold ends. */
  move(tag: string, run: () => void): boolean {
    if (!this.held()) {
      run()
      return true
    }
    this.waiting.set(tag, run)
    this.log(`held: ${tag} (${this.fingers > 0 ? `fingers ${this.fingers}` : 'just lifted'})`)
    return false
  }

  /** The number of fingers on the map now, from touchstart / touchend / touchcancel. */
  setFingers(n: number): void {
    const was = this.fingers
    this.fingers = n
    if (n > 0) {
      if (this.timer !== null) this.clock.cancel(this.timer)
      this.timer = null
      return
    }
    if (was > 0) this.liftedAt = this.clock.now()
    this.schedule(HOLD_AFTER_LIFT_MS)
  }

  pending(): string[] {
    return [...this.waiting.keys()]
  }

  private schedule(ms: number): void {
    if (this.timer !== null) this.clock.cancel(this.timer)
    this.timer = this.clock.later(() => this.release(), ms)
  }

  private release(): void {
    this.timer = null
    if (this.held()) return
    if (this.waiting.size === 0) return
    /* Still coasting from the fling: ask again shortly, never under a moving map. */
    if (this.busy()) {
      this.schedule(100)
      return
    }
    const runs = [...this.waiting.entries()]
    this.waiting.clear()
    for (const [tag, run] of runs) {
      this.log(`released: ${tag}`)
      run()
    }
  }
}
