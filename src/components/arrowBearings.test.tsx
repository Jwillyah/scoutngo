import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { summarise } from '../core/windModels.ts'
import { windArrows } from '../core/layerTimeline.ts'
import { blowsToward } from '../core/droneNow.ts'
import { DEFAULT_UNITS } from '../lib/units.ts'
import { Dial, WindContent } from './WindPageV2.tsx'
import { DroneCompass } from './DroneNow.tsx'
import { PartArrow } from './SurfPageV2.tsx'
import { WindDial } from './Home.tsx'
import TIMELINE_SRC from './LayerTimeline.tsx?raw'

/*
 * EVERY ARROW POINTS WHERE THE WIND GOES, ON THE GLASS (Batch FIX, Section
 * 1.3: 17 Nov 7:06, the Wind page's "now" arrow in the 12 h row was seen
 * pointing E with the wind from the NE). Not the number in the transform:
 * the rendered path's head, turned the way the SVG turns it, read back as a
 * compass bearing on the screen (x right, y down). One case per octant.
 *
 * The head: the vertex the most strokes meet at, the farthest from the turn's
 * centre on a tie (a chevron's point, an arrow's head).
 */
type Pt = readonly [number, number]

function vertices(d: string): Map<string, { p: Pt; n: number }> {
  const out = new Map<string, { p: Pt; n: number }>()
  const tok = d.match(/[MLVHZ]|-?\d*\.?\d+/gi) ?? []
  let cur: Pt = [0, 0]
  let start: Pt = [0, 0]
  let cmd = 'M'
  const bump = (p: Pt, k: number) => {
    const key = `${p[0]},${p[1]}`
    const v = out.get(key) ?? { p, n: 0 }
    v.n += k
    out.set(key, v)
  }
  const seg = (to: Pt) => {
    bump(cur, 1)
    bump(to, 1)
    cur = to
  }
  for (let i = 0; i < tok.length; ) {
    if (/[A-Z]/i.test(tok[i])) cmd = tok[i++].toUpperCase()
    if (cmd === 'Z') {
      seg(start)
      continue
    }
    if (cmd === 'V') seg([cur[0], Number(tok[i++])])
    else if (cmd === 'H') seg([Number(tok[i++]), cur[1]])
    else {
      const p: Pt = [Number(tok[i++]), Number(tok[i++])]
      if (cmd === 'M') {
        cur = p
        start = p
        bump(p, 0)
        cmd = 'L'
      } else seg(p)
    }
  }
  return out
}

/** The bearing on the glass the head points to, degrees clockwise from up. */
function glassBearing(d: string, rotDeg: number, centre: Pt): number {
  const v = [...vertices(d).values()]
  const far = (p: Pt) => Math.hypot(p[0] - centre[0], p[1] - centre[1])
  const head = v.sort((a, b) => b.n - a.n || far(b.p) - far(a.p))[0].p
  const a = (rotDeg * Math.PI) / 180
  const x = head[0] - centre[0]
  const y = head[1] - centre[1]
  /* SVG's rotate turns clockwise on the screen (y down). */
  const rx = x * Math.cos(a) - y * Math.sin(a)
  const ry = x * Math.sin(a) + y * Math.cos(a)
  return (((Math.atan2(rx, -ry) * 180) / Math.PI) % 360 + 360) % 360
}

const apart = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180)
const OCTANTS = [0, 45, 90, 135, 180, 225, 270, 315]
const NAME = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

/** Each <path d=… transform="rotate(a[ cx cy])"> in the markup, with its centre. */
function turnedPaths(html: string): { d: string; rot: number; centre: Pt }[] {
  const out: { d: string; rot: number; centre: Pt }[] = []
  for (const m of html.matchAll(/<(path|g)\b[^>]*?transform="rotate\(([-\d.]+)(?:\s+([-\d.]+)\s+([-\d.]+))?\)"[^>]*>/g)) {
    const rot = Number(m[2])
    const centre: Pt = m[3] === undefined ? [0, 0] : [Number(m[3]), Number(m[4])]
    if (m[1] === 'path') out.push({ d: /\bd="([^"]+)"/.exec(m[0])![1], rot, centre })
    else {
      /* A turned group: its first path. */
      const rest = html.slice((m.index ?? 0) + m[0].length)
      out.push({ d: /<path\b[^>]*\bd="([^"]+)"/.exec(rest)![1], rot, centre })
    }
  }
  return out
}

describe('the Wind page: the 12 h row\'s arrows and the dial point where the wind goes', () => {
  const H = Array.from({ length: 24 }, (_, i) => new Date(Date.UTC(2026, 10, 17, 11) + i * 3_600_000))
  const now = new Date('2026-11-17T12:06:00Z')
  for (const [k, from] of OCTANTS.entries()) {
    it(`from the ${NAME[k]} (${from}°): the "now" arrow, every hour's arrow and the dial point to ${(from + 180) % 360}°`, () => {
      const ground = H.map(() => summarise([6, 6, 6, 6, 6], [from, from, from, from, from], [8]))
      const models = { hours: H, byLevel: { ground, '80m': ground, '120m': ground }, perModel: {}, tempC: H.map(() => 10), cloud: H.map(() => 0), aloft: H.map(() => ({ cls: 'mixing' as const, alpha: 0.1, factor: 1.2 })), filled120: [] }
      const html = renderToStaticMarkup(createElement(WindContent, { now, data: { models: models as never, measured: [] }, facing: 100, placeName: 'VB', timeZone: 'America/New_York', units: DEFAULT_UNITS, drone: null, shared: { mps: 6.7, fromDeg: from, gustMps: null } }))
      const strip = html.slice(html.indexOf('dwind__strip'))
      const arrows = turnedPaths(strip.slice(0, strip.indexOf('</div></div>') + 12))
      expect(arrows.length).toBe(6)
      expect(strip.indexOf('>now<')).toBeGreaterThan(-1)
      for (const a of arrows) expect(apart(glassBearing(a.d, a.rot, a.centre), from + 180)).toBeLessThan(1)
      const dial = turnedPaths(html.slice(html.indexOf('dwind__dial'), html.indexOf('</svg>', html.indexOf('dwind__dial'))))
      expect(dial.length).toBe(1)
      expect(apart(glassBearing(dial[0].d, dial[0].rot, dial[0].centre), from + 180)).toBeLessThan(1)
    })
  }
  it('the Dial alone, with no forecast hours, the same', () => {
    for (const from of OCTANTS) {
      const [a] = turnedPaths(renderToStaticMarkup(createElement(Dial, { facing: null, fromDeg: from })))
      expect(apart(glassBearing(a.d, a.rot, a.centre), from + 180)).toBeLessThan(1)
    }
  })
})

describe('the other wind and sea arrows, the same rule', () => {
  it('the home\'s wind dial', () => {
    for (const from of OCTANTS) {
      const [a] = turnedPaths(renderToStaticMarkup(createElement(WindDial, { fromDeg: from, facing: null })))
      expect(apart(glassBearing(a.d, a.rot, a.centre), from + 180)).toBeLessThan(1)
    }
  })
  it('the drone page\'s compass', () => {
    for (const from of OCTANTS) {
      const [a] = turnedPaths(renderToStaticMarkup(createElement(DroneCompass, { towardDeg: blowsToward(from) })))
      expect(apart(glassBearing(a.d, a.rot, a.centre), from + 180)).toBeLessThan(1)
    }
  })
  it('the Surf page\'s parts of the sea: where each part goes (it pointed back the way it came)', () => {
    for (const from of OCTANTS) {
      const [a] = turnedPaths(renderToStaticMarkup(createElement(PartArrow, { fromDeg: from })))
      expect(apart(glassBearing(a.d, a.rot, a.centre), from + 180)).toBeLessThan(1)
    }
  })
  it('the map\'s time bar: the arrow\'s turn is where it goes, and its glyph\'s head is up', () => {
    const glyph = /className="ltl__arrow"[\s\S]*?<path d="([^"]+)"/.exec(TIMELINE_SRC)![1]
    const span = { from: new Date('2026-11-17T05:00:00Z'), hours: 24 }
    for (const from of OCTANTS) {
      const hours = Array.from({ length: 24 }, () => ({ fromDeg: from }) as never)
      const [arrow] = windArrows(hours, span, 'UTC')
      /* CSS turns the 12 x 12 box about its middle. */
      expect(apart(glassBearing(glyph, arrow.toDeg, [6, 6]), from + 180)).toBeLessThan(1)
    }
  })
})

describe('the 12 h row draws an arrow that reads one way (Batch FIX, Section 1.3)', () => {
  it('a shaft and a head: the tail reaches as far from the centre as the tip, so the back cannot read as a point', async () => {
    const { HOUR_ARROW } = await import('./WindPageV2.tsx')
    const ys = [...HOUR_ARROW.matchAll(/(-?\d*\.?\d+) (-?\d*\.?\d+)/g)].map((m) => Number(m[2]))
    expect(Math.min(...ys)).toBeLessThanOrEqual(-7)
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(6.5)
  })
})
