/*
 * WHAT THE SKY LAYER CAN HONESTLY SHOW AT A GIVEN MOMENT.
 *
 * THE HARD LIMIT. There is no satellite image of the future. Scrubbing back
 * through this morning can show what actually happened; scrubbing forward to
 * tomorrow cannot, however much it would be nicer if it did. So the layer
 * splits at now, and the split is made visible rather than smoothed over:
 *
 *   PAST and NOW   real GOES frames. Observed.
 *   FUTURE         the Open-Meteo cloud forecast. A model.
 *
 * They are never blended and never share a label. A model result sitting under
 * a caption that says observed is the exact failure this project exists to
 * avoid, and it would be an easy one to ship: the two would look similar if
 * nothing stopped them.
 *
 * AND THE FORECAST DEGRADES. Every weather app draws the same confident
 * picture at four hours and at ten days. This one does not: the trust band
 * says what a forecast at that range is worth, and the layer is drawn fainter
 * as it gets further out until, past a week, it is not drawn at all. A faint
 * picture is an honest picture; a bold one at ten days is a lie about
 * precision.
 */

/** How far ahead a forecast is, as something that can be said out loud. */
export type ForecastTrust = 'near' | 'medium' | 'far' | 'beyond'

export const FORECAST_TRUST_HOURS: Record<Exclude<ForecastTrust, 'beyond'>, number> = {
  near: 24,
  medium: 72,
  far: 168,
}

export const FORECAST_TRUST_NOTE: Record<ForecastTrust, string> = {
  near: 'Within a day. The shape of the sky is usually about right; the timing can still move by half an hour.',
  medium:
    'Two to three days out. Worth knowing whether cloud is coming at all; the hour it arrives will move.',
  far: 'Up to a week out. A pattern rather than a plan. Drawn faint on purpose.',
  beyond:
    'More than a week out. Not drawn: a cloud map at this range would look exactly as confident as one for tomorrow, and it is not.',
}

/**
 * How solid to draw a forecast at each range.
 *
 * The degradation IS the honesty. Zero at 'beyond' is not a rendering
 * convenience; it is the statement that there is nothing worth drawing.
 */
export const FORECAST_OPACITY: Record<ForecastTrust, number> = {
  near: 0.5,
  medium: 0.36,
  far: 0.2,
  beyond: 0,
}

/**
 * The band, from the hours ahead ROUNDED THE WAY THEY ARE DISPLAYED.
 *
 * Banding the exact value and printing a rounded one lets the two contradict
 * each other: measured in the browser at 24.4 hours out, the key read "24 h
 * ahead" beside the two-to-three-days note, which reads as a bug whichever
 * half you trust. Rounding once, here, means the number on screen and the
 * sentence under it are always the same claim.
 */
export function forecastTrust(hoursAhead: number): ForecastTrust {
  const hours = Math.round(hoursAhead)
  if (hours <= FORECAST_TRUST_HOURS.near) return 'near'
  if (hours <= FORECAST_TRUST_HOURS.medium) return 'medium'
  if (hours <= FORECAST_TRUST_HOURS.far) return 'far'
  return 'beyond'
}

export type SkySource =
  | {
      kind: 'satellite'
      /** The frame actually shown, which is not the moment asked for. */
      frameAt: Date
      /** How far the frame is from the scrub point, in minutes. Always >= 0. */
      offsetMinutes: number
      /**
       * True when the nearest frame is further away than one scan interval,
       * which means the archive has a hole or the scrub is past its edge.
       */
      far: boolean
    }
  | {
      kind: 'forecast'
      hoursAhead: number
      trust: ForecastTrust
      /** False past a week, where nothing is drawn at all. */
      draw: boolean
    }

/**
 * How far from a frame counts as far enough to mention.
 *
 * GIBS serves one frame every ten minutes, so being inside ten minutes is
 * simply where the frames are. Beyond that the archive has a gap, which is
 * worth saying because the picture is then of a different sky.
 */
export const FRAME_FAR_MINUTES = 10

/**
 * Which source answers for this moment.
 *
 * `frameAt` is produced by the caller's snapping function so there is one
 * definition of where frames fall; this decides WHICH side of now the moment
 * is on and what that means.
 */
export function skySourceFor(
  scrubbedAt: Date,
  now: Date,
  snapToFrame: (at: Date) => Date,
): SkySource {
  const aheadMs = scrubbedAt.getTime() - now.getTime()

  if (aheadMs <= 0) {
    const frameAt = snapToFrame(scrubbedAt)
    const offsetMinutes = Math.abs(scrubbedAt.getTime() - frameAt.getTime()) / 60_000
    return {
      kind: 'satellite',
      frameAt,
      offsetMinutes,
      far: offsetMinutes > FRAME_FAR_MINUTES,
    }
  }

  const hoursAhead = aheadMs / 3_600_000
  const trust = forecastTrust(hoursAhead)
  return { kind: 'forecast', hoursAhead, trust, draw: FORECAST_OPACITY[trust] > 0 }
}

/**
 * The sentence for the boundary between the two.
 *
 * Said because the reader needs to know the exact point where they stop
 * looking at what happened and start looking at what a model thinks. Without
 * it the switch is a change of texture nobody asked about.
 */
export function boundaryNote(now: Date, clock: (at: Date) => string): string {
  return `Satellite up to ${clock(now)}, forecast after it.`
}
