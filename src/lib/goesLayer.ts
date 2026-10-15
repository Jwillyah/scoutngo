import {
  GOES_FRAME_STEP_MINUTES,
  GOES_LAYER,
  GOES_MATRIX_SET,
  type GoesBand,
} from '../core/goes.ts'

/**
 * The GOES tile source, as a NASA GIBS WMTS template.
 *
 * VERIFIED AGAINST THE REAL SERVICE before any of this was written. Its
 * capabilities lists both bands, each with a Time dimension at PT10M steps and
 * a months-deep archive; tiles requested at 09:00 and 09:10 on the same day
 * came back with different checksums, and so did the same minute a day
 * earlier. The visible band arrives as greyscale-plus-alpha PNG and the
 * infrared as RGBA, which is why only the infrared has a colour table.
 *
 * WHY NOT THE IEM WMS THIS REPLACED. It ignores TIME: byte-identical PNGs for
 * TIME unset, for today and for yesterday, with no dimension declared. Fine
 * for "now", impossible for a scrub.
 *
 * NO KEY, and no account. Public data on a public service.
 */
export const GIBS_WMTS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best'

/**
 * Snaps an instant to a frame GIBS actually has.
 *
 * Floored, not rounded to nearest: a frame is an observation of the ten
 * minutes BEFORE its timestamp, so rounding up would label a frame with a time
 * it does not cover yet. The caller reports the real frame time, never the
 * time that was asked for.
 */
export function snapToFrame(at: Date, stepMinutes = GOES_FRAME_STEP_MINUTES): Date {
  const step = Math.max(1, stepMinutes) * 60_000
  return new Date(Math.floor(at.getTime() / step) * step)
}

/** GIBS wants a second-precision ISO stamp with a Z. */
export function frameStamp(at: Date): string {
  return `${at.toISOString().slice(0, 19)}Z`
}

/**
 * A tile template for one band at one frame.
 *
 * `default` is the style segment GIBS uses for a layer with one style. The
 * braces are maplibre's own placeholders and must stay literal.
 */
export function goesTileUrl(band: GoesBand, at: Date | null = null): string {
  const time = at === null ? 'default' : frameStamp(snapToFrame(at))
  return (
    `${GIBS_WMTS}/${GOES_LAYER[band]}/default/${time}` +
    `/${GOES_MATRIX_SET[band]}/{z}/{y}/{x}.png`
  )
}
