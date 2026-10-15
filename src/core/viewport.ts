/*
 * HOW FAR A BEARING LINE HAS TO RUN.
 *
 * A bearing has no length. The sun sits on a compass direction, not at a
 * distance, so the line that shows that direction should run off the edge of
 * the frame whatever the frame happens to be showing. It used to run 900m,
 * which is a sensible length at one zoom and the wrong length at every other:
 * measured on the real map at a 390x844 viewport, the sun ray was 15px long at
 * zoom 10 and 15,393px long at zoom 20. At the wide end it was a stub hidden
 * under the pin, which is exactly the reported symptom: the SUN and SHADOW
 * labels visible with no lines under them.
 *
 * So the length comes from the viewport instead.
 *
 * THE GUARANTEE. A line of `bearingLineMeters(origin, bounds)` from `origin`
 * leaves the frame along any bearing. The proof is that the frame is the convex
 * hull of its four corners, so it sits entirely inside the circle centred on
 * `origin` through the farthest of them; a point beyond that radius is outside
 * the circle and therefore outside the frame. Taking the farthest corner rather
 * than half the diagonal is what makes it hold when the pin is off to one side,
 * or off frame entirely after a pan.
 *
 * WHY THE ENDPOINT AND NOT A SCREEN-SPACE RAY. Under pitch, a constant compass
 * bearing is not a straight line on screen, and under rotation it is not
 * vertical either. Drawing two real coordinates and letting the map project
 * them is correct in both cases for free. Nothing here knows about pixels.
 *
 * `bounds` is whatever the map reports as currently visible. Under pitch that
 * is the bounding box of the visible ground, which reaches toward the horizon,
 * so the pitched case needs no special handling: the box is already bigger.
 */

import { distanceMeters, type LatLon } from './geo.ts'

/** A visible extent, as the map reports it. Degrees. */
export interface ViewportBounds {
  north: number
  south: number
  east: number
  west: number
}

/**
 * Slack on top of the proof.
 *
 * The containment argument is exact in metres, but the frame is a box in
 * projected space where a metre near the top edge and a metre near the bottom
 * are different numbers of pixels. Across a 50km view that scale varies by
 * well under one percent. A quarter is far more than covers it, and it also
 * stops the line ending exactly on the frame edge, which reads as a line that
 * stops rather than a line that leaves.
 */
export const BEARING_LINE_SLACK = 1.25

/**
 * Shortest a bearing line may be, in metres.
 *
 * Only reached when the map reports a degenerate extent, which happens for a
 * frame or two while a container is still being measured. A zero length line
 * is a line that is not drawn, so it gets a floor rather than a zero.
 */
export const BEARING_LINE_MIN_METERS = 100

export function viewportCorners(bounds: ViewportBounds): LatLon[] {
  return [
    { lat: bounds.north, lon: bounds.west },
    { lat: bounds.north, lon: bounds.east },
    { lat: bounds.south, lon: bounds.east },
    { lat: bounds.south, lon: bounds.west },
  ]
}

/**
 * The shorter visible side, in metres. What you want for placing something a
 * fraction of the way across the view, where the longer side would push it off
 * the narrow edge.
 */
export function viewportSpanMeters(bounds: ViewportBounds): number {
  const southWest = { lat: bounds.south, lon: bounds.west }
  return Math.min(
    distanceMeters(southWest, { lat: bounds.south, lon: bounds.east }),
    distanceMeters(southWest, { lat: bounds.north, lon: bounds.west }),
  )
}

/** The visible diagonal, in metres. The shortest line that can cross the view. */
export function viewportDiagonalMeters(bounds: ViewportBounds): number {
  return distanceMeters(
    { lat: bounds.south, lon: bounds.west },
    { lat: bounds.north, lon: bounds.east },
  )
}

/**
 * How far a line from `origin` must run to leave the frame along ANY bearing.
 *
 * For a line through `origin` rather than from it, this is the half length:
 * each arm has to clear the frame on its own.
 */
export function bearingLineMeters(origin: LatLon, bounds: ViewportBounds): number {
  const farthestCorner = Math.max(
    ...viewportCorners(bounds).map((corner) => distanceMeters(origin, corner)),
  )
  /*
   * TWO LOWER BOUNDS, AND THE LARGER WINS.
   *
   * The farthest corner is the one that proves the line leaves the frame. The
   * diagonal is the one that makes the line at least as long as the view is
   * across, which from a centred pin is twice what it strictly needs: half the
   * diagonal would clear the edge. It is kept because it is the property worth
   * asserting. "Longer than the frame is wide" is checkable at a glance and
   * stays true when the pin moves, where "longer than it needs to be from
   * where it currently is" has to be re-derived every time.
   */
  const needed = Math.max(farthestCorner, viewportDiagonalMeters(bounds))
  return Math.max(BEARING_LINE_MIN_METERS, needed * BEARING_LINE_SLACK)
}

/**
 * The same length, rounded up to the next power of two metres.
 *
 * WHY QUANTISE. The length has to be recomputed as the camera moves, and a
 * pinch moves it every frame. Feeding a slightly different number into the
 * map's source sixty times a second re-tiles the geometry sixty times for no
 * visible gain, and waiting for the gesture to END instead leaves the line
 * visibly stopping short for the whole pinch, which is the bug this is fixing.
 *
 * Stepping the length means the number only changes when a zoom level is
 * crossed, so the source is written a handful of times per gesture while the
 * line is never too short. Rounding UP is what keeps it never too short, so
 * every guarantee bearingLineMeters makes still holds; the line is simply up
 * to twice as long as it strictly needs to be, which costs nothing because a
 * rhumb line is drawn exactly at any length.
 */
export function steppedBearingLineMeters(origin: LatLon, bounds: ViewportBounds): number {
  return 2 ** Math.ceil(Math.log2(bearingLineMeters(origin, bounds)))
}

/*
 * WHERE THE MAP STARTS WHEN NOTHING IS KNOWN YET.
 *
 * It used to start at 38.364236N 75.605912W, zoom 16.5. That is Brew River in
 * Salisbury Maryland, the venue this app was calibrated against, framed at
 * street level about 600m across. Anyone opening the app for the first time
 * was shown one specific car park on the Eastern Shore, close enough to read
 * the parking bays, which is a claim about where they are and a wrong one.
 *
 * So it starts wide instead, on a view that is plainly asking rather than
 * answering. The search field is the tool for getting somewhere, and
 * "Use my location" is there for anyone who would rather tap it.
 *
 * NO IP GEOLOCATION, EVER. Not on load, not as a fallback, not for one frame.
 * An approximate position derived from an IP address is user data, and the way
 * not to hold it is not to ask for it. tests/noIpGeolocation.test.ts is what
 * keeps that true.
 */
export const COLD_START_VIEW = {
  /*
   * The Atlantic, which puts the Americas on one side and Europe and Africa on
   * the other. Chosen because it is the least like a claim: anybody can see at
   * a glance that the app does not know where they are.
   */
  center: [-30, 25] as [number, number],
  zoom: 1.7,
}

/** How close to frame a venue once there is one to frame. */
export const VENUE_ZOOM = 16.5

/**
 * Below this, a venue is not visible at all, so a new one gets framed rather
 * than just centred.
 *
 * It exists because the cold start view is now the whole Atlantic: centring a
 * searched venue there without touching the zoom would leave it a sub pixel
 * dot in the middle of an ocean. Above the threshold the zoom is left alone,
 * because someone sitting at zoom 14 looking around the county and dropping a
 * pin has chosen that view and should keep it.
 */
export const FRAME_VENUE_BELOW_ZOOM = 12

/*
 * WHERE A RAY LABEL SITS, AND HOW FAR IT MAY BE SLID.
 *
 * THE SAME BUG AS THE BEARING LINES, IN A SECOND PLACE. The label distance was
 * `span * 0.28` clamped between 50m and 700m, and both clamps broke it at
 * opposite ends of the zoom range. Measured on a 390x844 viewport at latitude
 * 38, in pixels from the pin, where the intent is a constant 109:
 *
 *   zoom 10   700m cap    11.7px   on top of the pin
 *   zoom 12   700m cap    46.7px
 *   zoom 14   uncapped   109.2px   as intended
 *   zoom 17   uncapped   109.2px   as intended
 *   zoom 19   50m floor  427.1px   off a 390px screen
 *   zoom 20   50m floor  854.3px   off a 390px screen
 *
 * So the readouts piled onto the pin at a wide zoom and vanished entirely at a
 * tight one, and only the middle four zooms behaved. Expressing the distance
 * as a fraction of the span is what makes it a constant number of PIXELS; a
 * metre clamp on top of that is the thing that stops it being one.
 *
 * Everything here is a fraction of the shorter visible side for that reason.
 */

/** How far along its ray a label prefers to sit. About 109px on a 390px view. */
export const LABEL_SPAN_FRACTION = 0.28

/**
 * How close to the pin a label may be pushed when it has to be.
 *
 * A preference is not an absence: the rule is to hide a readout only when no
 * clear point exists on its ray, so the search is allowed much closer in than
 * the preferred distance. About 12px on a 390px view, which is clear of the
 * pin's own 22px box once the clearance padding is counted.
 */
export const LABEL_MIN_SPAN_FRACTION = 0.032

/**
 * And how far out. Beyond about three fifths of the shorter side a label is
 * leaving the view anyway, and labelPlacement refuses a candidate that is not
 * fully on screen, so searching further is wasted work.
 */
export const LABEL_MAX_SPAN_FRACTION = 0.6

export interface LabelDistances {
  /** Where it wants to be. */
  preferredMeters: number
  /** The closest the search may push it to the pin. */
  minMeters: number
  /** The furthest out the search may push it. */
  maxMeters: number
}

export function labelDistances(spanMeters: number): LabelDistances {
  const span = Math.max(0, spanMeters)
  return {
    preferredMeters: span * LABEL_SPAN_FRACTION,
    minMeters: span * LABEL_MIN_SPAN_FRACTION,
    maxMeters: span * LABEL_MAX_SPAN_FRACTION,
  }
}
