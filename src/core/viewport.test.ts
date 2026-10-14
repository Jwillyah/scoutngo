import { describe, expect, it } from 'vitest'
import { bearingLineEnd, destinationPoint, distanceMeters, type LatLon } from './geo.ts'
import {
  BEARING_LINE_MIN_METERS,
  bearingLineMeters,
  viewportCorners,
  viewportDiagonalMeters,
  steppedBearingLineMeters,
  viewportSpanMeters,
  type ViewportBounds,
} from './viewport.ts'

/*
 * A REFERENCE WEB MERCATOR, WRITTEN HERE ON PURPOSE.
 *
 * The claim under test is about pixels, so the test needs a projection. Asking
 * the implementation to supply it would make the assertion circular, and
 * asking maplibre would need WebGL, so this is the textbook formula at
 * maplibre's 512px tile size. It is the same projection the real map uses, and
 * the browser audit in scripts/audit-projection.mjs checks the real one.
 */
const WORLD = (zoom: number) => 512 * 2 ** zoom

function project(at: LatLon, zoom: number): { x: number; y: number } {
  const world = WORLD(zoom)
  const phi = (at.lat * Math.PI) / 180
  return {
    x: ((at.lon + 180) / 360) * world,
    y: (0.5 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / (2 * Math.PI)) * world,
  }
}

function unproject(x: number, y: number, zoom: number): LatLon {
  const world = WORLD(zoom)
  const lon = (x / world) * 360 - 180
  const n = Math.PI * (1 - 2 * (y / world))
  return { lat: (180 / Math.PI) * Math.atan(Math.sinh(n)), lon }
}

/** What the map would report visible for a viewport of this size, north up. */
function boundsFor(centre: LatLon, zoom: number, width: number, height: number): ViewportBounds {
  const c = project(centre, zoom)
  const topLeft = unproject(c.x - width / 2, c.y - height / 2, zoom)
  const bottomRight = unproject(c.x + width / 2, c.y + height / 2, zoom)
  return {
    north: topLeft.lat,
    west: topLeft.lon,
    south: bottomRight.lat,
    east: bottomRight.lon,
  }
}

/** An iPhone 14 Pro in CSS pixels, which is the viewport this app is built for. */
const WIDTH = 390
const HEIGHT = 844
const BREW_RIVER: LatLon = { lat: 38.364236, lon: -75.605912 }

/*
 * THE JOB 2 ASSERTION.
 *
 * At every zoom from 10 to 20, on every bearing, the line has to be at least
 * the viewport diagonal long on screen. Before this existed the sun ray was a
 * fixed 900m, which measured 15px against a 930px diagonal at zoom 10.
 */
describe('a bearing line always crosses the frame', () => {
  const BEARINGS = Array.from({ length: 36 }, (_, i) => i * 10)

  for (let zoom = 10; zoom <= 20; zoom++) {
    it(`is at least the viewport diagonal on screen at zoom ${zoom}`, () => {
      const bounds = boundsFor(BREW_RIVER, zoom, WIDTH, HEIGHT)
      const meters = bearingLineMeters(BREW_RIVER, bounds)
      const diagonalPx = Math.hypot(WIDTH, HEIGHT)
      const origin = project(BREW_RIVER, zoom)

      for (const bearing of BEARINGS) {
        const end = project(bearingLineEnd(BREW_RIVER, bearing, meters), zoom)
        const lengthPx = Math.hypot(end.x - origin.x, end.y - origin.y)
        expect(lengthPx, `bearing ${bearing} at zoom ${zoom}`).toBeGreaterThanOrEqual(diagonalPx)
      }
    })
  }

  /*
   * The stronger claim, and the one that actually matters: the far end is off
   * frame. A line can be longer than the diagonal and still stop inside the
   * view if it started near a far corner, which is why the length comes from
   * the farthest corner rather than from half the diagonal.
   */
  it('ends outside the frame even when the pin is in a corner of it', () => {
    for (let zoom = 10; zoom <= 20; zoom++) {
      const bounds = boundsFor(BREW_RIVER, zoom, WIDTH, HEIGHT)
      const centre = project(BREW_RIVER, zoom)
      const frame = {
        left: centre.x - WIDTH / 2,
        right: centre.x + WIDTH / 2,
        top: centre.y - HEIGHT / 2,
        bottom: centre.y + HEIGHT / 2,
      }

      // Every corner of the frame, and a point just inside each, as the origin.
      for (const [fx, fy] of [[0.02, 0.02], [0.98, 0.02], [0.98, 0.98], [0.02, 0.98], [0.5, 0.5]]) {
        const pin = unproject(
          frame.left + fx * WIDTH,
          frame.top + fy * HEIGHT,
          zoom,
        )
        const meters = bearingLineMeters(pin, bounds)
        for (const bearing of BEARINGS) {
          const end = project(bearingLineEnd(pin, bearing, meters), zoom)
          const inside =
            end.x >= frame.left && end.x <= frame.right &&
            end.y >= frame.top && end.y <= frame.bottom
          expect(inside, `zoom ${zoom}, pin ${fx},${fy}, bearing ${bearing} ended inside`).toBe(false)
        }
      }
    }
  })

  /*
   * An axis line runs both ways from the pin, so the same number is its HALF
   * length and each arm has to clear the frame on its own.
   */
  it('clears the frame in both directions for a line drawn through the pin', () => {
    const zoom = 10
    const bounds = boundsFor(BREW_RIVER, zoom, WIDTH, HEIGHT)
    const half = bearingLineMeters(BREW_RIVER, bounds)
    const centre = project(BREW_RIVER, zoom)
    for (const bearing of BEARINGS) {
      for (const arm of [bearing, bearing + 180]) {
        const end = project(bearingLineEnd(BREW_RIVER, arm, half), zoom)
        expect(Math.hypot(end.x - centre.x, end.y - centre.y)).toBeGreaterThanOrEqual(
          Math.hypot(WIDTH, HEIGHT) / 2,
        )
      }
    }
  })
})

/*
 * The component calls the stepped version, so the Job 2 assertion has to hold
 * for that one too. Rounding up can only ever help, and this says so.
 */
describe('steppedBearingLineMeters', () => {
  it('is never shorter than the exact length, at every zoom 10 to 20', () => {
    for (let zoom = 10; zoom <= 20; zoom++) {
      const bounds = boundsFor(BREW_RIVER, zoom, WIDTH, HEIGHT)
      const exact = bearingLineMeters(BREW_RIVER, bounds)
      const stepped = steppedBearingLineMeters(BREW_RIVER, bounds)
      expect(stepped).toBeGreaterThanOrEqual(exact)
      expect(stepped).toBeLessThan(exact * 2)
    }
  })

  /*
   * The point of stepping: a pinch from zoom 20 out to zoom 10 rewrites the
   * source a handful of times, not once per frame. Counted over a sweep,
   * because at a step boundary even a small nudge does change the number;
   * what matters is that it almost never does.
   */
  it('changes about once per zoom level across a full pinch, not once per frame', () => {
    let changes = 0
    let previous = 0
    const STEP = 0.05
    for (let zoom = 20; zoom >= 10; zoom -= STEP) {
      const next = steppedBearingLineMeters(BREW_RIVER, boundsFor(BREW_RIVER, zoom, WIDTH, HEIGHT))
      if (next !== previous) changes += 1
      previous = next
    }
    const frames = Math.round(10 / STEP)
    expect(frames).toBeGreaterThan(190)
    // Eleven zoom levels, so eleven or twelve steps, against 200 frames.
    expect(changes).toBeLessThanOrEqual(12)
  })

  it('still crosses the frame on every bearing at every zoom 10 to 20', () => {
    const diagonalPx = Math.hypot(WIDTH, HEIGHT)
    for (let zoom = 10; zoom <= 20; zoom++) {
      const bounds = boundsFor(BREW_RIVER, zoom, WIDTH, HEIGHT)
      const meters = steppedBearingLineMeters(BREW_RIVER, bounds)
      const origin = project(BREW_RIVER, zoom)
      for (let bearing = 0; bearing < 360; bearing += 10) {
        const end = project(bearingLineEnd(BREW_RIVER, bearing, meters), zoom)
        expect(Math.hypot(end.x - origin.x, end.y - origin.y)).toBeGreaterThanOrEqual(diagonalPx)
      }
    }
  })
})

describe('bearingLineMeters', () => {
  const bounds = boundsFor(BREW_RIVER, 15, WIDTH, HEIGHT)

  it('grows as the view widens', () => {
    const tight = bearingLineMeters(BREW_RIVER, boundsFor(BREW_RIVER, 18, WIDTH, HEIGHT))
    const wide = bearingLineMeters(BREW_RIVER, boundsFor(BREW_RIVER, 12, WIDTH, HEIGHT))
    expect(wide).toBeGreaterThan(tight)
    // Six zoom levels is a factor of 64 in scale, and the length tracks it.
    expect(wide / tight).toBeCloseTo(64, 0)
  })

  it('clears the farthest corner', () => {
    const meters = bearingLineMeters(BREW_RIVER, bounds)
    for (const corner of viewportCorners(bounds)) {
      expect(meters).toBeGreaterThan(distanceMeters(BREW_RIVER, corner))
    }
  })

  /*
   * A pin panned off frame still gets a line that reaches across the view,
   * rather than one sized for a frame it is not in.
   */
  it('reaches the frame from a pin outside it', () => {
    const away = destinationPoint(BREW_RIVER, 90, 20_000)
    const meters = bearingLineMeters(away, bounds)
    expect(meters).toBeGreaterThan(20_000)
  })

  it('never returns zero for a viewport that has not been measured yet', () => {
    const degenerate = {
      north: BREW_RIVER.lat, south: BREW_RIVER.lat,
      east: BREW_RIVER.lon, west: BREW_RIVER.lon,
    }
    expect(bearingLineMeters(BREW_RIVER, degenerate)).toBe(BEARING_LINE_MIN_METERS)
  })
})

describe('viewport extents', () => {
  it('reports the shorter side as the span', () => {
    // A portrait phone is taller than it is wide, so the span is the width.
    const bounds = boundsFor(BREW_RIVER, 15, WIDTH, HEIGHT)
    const span = viewportSpanMeters(bounds)
    const diagonal = viewportDiagonalMeters(bounds)
    expect(span).toBeLessThan(diagonal)
    expect(span).toBeCloseTo(
      distanceMeters({ lat: bounds.south, lon: bounds.west }, { lat: bounds.south, lon: bounds.east }),
      0,
    )
  })

  it('matches the measured metres per pixel at a known zoom', () => {
    /*
     * Web Mercator ground resolution at the equator, zoom 15, 512px tiles:
     * 40075016.686 / (512 * 2^15) = 2.3886 m/px, times cos(38.364) = 1.8737.
     * A 390px wide viewport is therefore about 731m across.
     */
    const bounds = boundsFor(BREW_RIVER, 15, WIDTH, HEIGHT)
    const expected = (40_075_016.686 / (512 * 2 ** 15)) * Math.cos((38.364236 * Math.PI) / 180) * WIDTH
    expect(viewportSpanMeters(bounds)).toBeCloseTo(expected, -1)
  })

  it('lists the corners as north-west, north-east, south-east, south-west', () => {
    const corners = viewportCorners({ north: 39, south: 38, east: -75, west: -76 })
    expect(corners).toEqual([
      { lat: 39, lon: -76 },
      { lat: 39, lon: -75 },
      { lat: 38, lon: -75 },
      { lat: 38, lon: -76 },
    ])
  })
})
