import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CameraHold, HOLD_AFTER_LIFT_MS, type HoldClock } from '../src/lib/cameraHold.ts'

/*
 * PINCH STILL SNAPPED ON THE PHONE (Batch H, 2 Nov 9:36 AM). Every camera
 * write the app makes waits while a finger is down and HOLD_AFTER_LIFT_MS
 * after the last lift, and the terrain switch is one of them.
 */
function fakeClock() {
  let t = 0
  let jobs: { at: number; run: () => void; id: number }[] = []
  let id = 0
  const clock: HoldClock = {
    now: () => t,
    later: (run, ms) => {
      jobs.push({ at: t + ms, run, id: ++id })
      return id
    },
    cancel: (h) => {
      jobs = jobs.filter((j) => j.id !== h)
    },
  }
  const advance = (ms: number) => {
    const end = t + ms
    for (;;) {
      const next = jobs.filter((j) => j.at <= end).sort((a, b) => a.at - b.at)[0]
      if (next === undefined) break
      t = next.at
      jobs = jobs.filter((j) => j !== next)
      next.run()
    }
    t = end
  }
  return { clock, advance }
}

describe('the camera hold', () => {
  it('runs a write at once when no finger is down', () => {
    const hold = new CameraHold({ clock: fakeClock().clock })
    let ran = 0
    hold.move('flyTo', () => ran++)
    expect(ran).toBe(1)
  })

  it('holds while a finger is down and for 600 ms after the last lift', () => {
    const { clock, advance } = fakeClock()
    const hold = new CameraHold({ clock })
    const ran: string[] = []
    hold.setFingers(2)
    hold.move('venue', () => ran.push('venue'))
    hold.setFingers(1) /* the first finger of a pinch lifts */
    advance(1000)
    expect(ran).toEqual([])
    hold.setFingers(0)
    advance(HOLD_AFTER_LIFT_MS - 1)
    expect(ran).toEqual([])
    hold.move('zoomBy', () => ran.push('zoomBy'))
    expect(ran).toEqual([])
    advance(1)
    expect(ran).toEqual(['venue', 'zoomBy'])
  })

  it('keeps the latest write per caller, and each caller once', () => {
    const { clock, advance } = fakeClock()
    const hold = new CameraHold({ clock })
    const ran: string[] = []
    hold.setFingers(2)
    hold.move('terrain', () => ran.push('terrain off'))
    hold.move('terrain', () => ran.push('terrain on'))
    hold.move('resize', () => ran.push('resize'))
    hold.setFingers(0)
    advance(HOLD_AFTER_LIFT_MS)
    expect(ran).toEqual(['terrain on', 'resize'])
  })

  it('a new touch in the 600 ms starts the hold again', () => {
    const { clock, advance } = fakeClock()
    const hold = new CameraHold({ clock })
    let ran = 0
    hold.setFingers(2)
    hold.move('flyTo', () => ran++)
    hold.setFingers(0)
    advance(300)
    hold.setFingers(2)
    advance(2000)
    expect(ran).toBe(0)
    hold.setFingers(0)
    advance(HOLD_AFTER_LIFT_MS)
    expect(ran).toBe(1)
  })

  it('waits for the map to stop coasting before it releases', () => {
    const { clock, advance } = fakeClock()
    let moving = true
    const hold = new CameraHold({ clock, busy: () => moving })
    let ran = 0
    hold.setFingers(1)
    hold.move('fitBounds', () => ran++)
    hold.setFingers(0)
    advance(HOLD_AFTER_LIFT_MS + 500)
    expect(ran).toBe(0)
    moving = false
    advance(100)
    expect(ran).toBe(1)
  })
})

describe('every camera write in the map goes through the hold', () => {
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  const MAP = strip(readFileSync('src/components/MapView.tsx', 'utf8'))

  it('flyTo, easeTo, fitBounds, setBearing, setPadding and resize only inside moveCamera', () => {
    const lines = MAP.split('\n')
    const writes = lines
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => /\.(flyTo|easeTo|fitBounds|setZoom|setCenter|zoomTo|panTo|panBy|setPadding|resize)\(/.test(line))
      .filter(({ line }) => !/^\s*(flyTo|fitAll|zoomTo|zoomBy)\(/.test(line))
    for (const { i } of writes) {
      const near = lines.slice(Math.max(0, i - 3), i + 1).join('\n')
      expect(near, lines[i]).toMatch(/moveCamera\(/)
    }
  })

  it('the terrain switch is a held camera write, and a finger\'s gesture never flips it', () => {
    expect(MAP).toMatch(/moveCamera\('terrain', \(\) => \{/)
    expect(MAP).toMatch(/const start = \(\) => \{\s*if \(hold\.current\?\.held\(\) !== true\) setGesturing\(true\)/)
  })
})
