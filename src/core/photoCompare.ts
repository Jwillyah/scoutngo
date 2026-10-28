/*
 * HOW CLOSE THE 3D VIEW IS TO A REAL PHOTO, scored on what can be scored:
 *
 *   horizon   the sea horizon's row: predicted from the camera's height and
 *             tilt (the dip of the horizon below level, with refraction),
 *             and found in the pixels of the photo and of the render
 *   sun       where the sun falls in the frame, from suncalc and the
 *             camera's heading and tilt, against the photo's brightest spot,
 *             when the sun is in the frame at all
 *   edges     the render's strong edges (block outlines, the shore) against
 *             the photo's: the median distance from one to the nearest other
 *
 * Arithmetic only: the screen and scripts/measure-compare.mjs call these.
 */

const R = 6_371_000
const REFRACTION = 0.13

/** Degrees the sea horizon lies below level from `heightM` above the sea, standard refraction. */
export function horizonDipDeg(heightM: number): number {
  if (heightM <= 0) return 0
  const r = R / (1 - REFRACTION)
  return (Math.acos(r / (r + heightM)) * 180) / Math.PI
}

/** Pixels from the image's centre to its edge, as a focal length in pixels, for a field of view across that many pixels. */
const focalPx = (fovDeg: number, px: number) => px / 2 / Math.tan((fovDeg * Math.PI) / 360)

/** The row the sea horizon should cross the frame's centre at, from the top, for a camera tilted `pitchDeg` (negative down). */
export function horizonRow(heightM: number, pitchDeg: number, verticalFovDeg: number, imageH: number): number {
  const angle = -horizonDipDeg(heightM) - pitchDeg
  return imageH / 2 - focalPx(verticalFovDeg, imageH) * Math.tan((angle * Math.PI) / 180)
}

/**
 * Where a direction (azimuth, altitude) lands in a frame looking along
 * (yaw, pitch), level, by the pinhole; null behind the camera.
 */
export function project(
  dir: { azimuth: number; altitude: number },
  cam: { yaw: number; pitch: number },
  fov: { horizontalDeg: number; verticalDeg: number },
  size: { width: number; height: number },
): { x: number; y: number } | null {
  const rad = Math.PI / 180
  const v = (az: number, alt: number) => [Math.sin(az * rad) * Math.cos(alt * rad), Math.cos(az * rad) * Math.cos(alt * rad), Math.sin(alt * rad)]
  const d = v(dir.azimuth, dir.altitude)
  /* The camera's forward, right and up in east-north-up. */
  const f = v(cam.yaw, cam.pitch)
  const right = [Math.cos(cam.yaw * rad), -Math.sin(cam.yaw * rad), 0]
  const up = [right[1] * f[2] - right[2] * f[1], right[2] * f[0] - right[0] * f[2], right[0] * f[1] - right[1] * f[0]]
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const z = dot(d, f)
  if (z <= 0) return null
  return {
    x: size.width / 2 + focalPx(fov.horizontalDeg, size.width) * (dot(d, right) / z),
    y: size.height / 2 - focalPx(fov.verticalDeg, size.height) * (dot(d, up) / z),
  }
}

/** Luminance, 0..255, of an RGBA buffer, row by row. */
export function luminance(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height)
  for (let i = 0; i < out.length; i += 1) out[i] = 0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]
  return out
}

/*
 * THE HORIZON IN THE PIXELS: the topmost row where the picture steps from
 * the band above to the band below ALL THE WAY ACROSS.
 *
 * Each row is scored by the MEDIAN over the columns of its colour step (the
 * red, green and blue steps added), so a pier or a building in a few columns
 * does not move it, and neither do waves: surf lines are as strong as the
 * horizon in the columns they cross, but they wander, and their median along
 * a row is low. The sea horizon is straight across a frame with no roll.
 *
 * TOPMOST, NOT STRONGEST, of the rows at least half as strong as the best.
 * Sea, then shore, lie below the horizon in a drone frame looking out to sea.
 *
 * COLOUR, NOT LUMINANCE. On the 27 Oct sunrise frames the sky at the
 * horizon is red and the sea grey-blue at almost the same brightness: by
 * luminance the strongest step was the surf on the sand (row 381 of 658
 * where the horizon is near 221). By this rule: 153 of 450 where the eye
 * puts it at about 152, and 144 where the eye says 142.
 *
 * Null when no row steps clearly (a median under 24 levels).
 */
export function findHorizon(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, band = 3): { row: number; strength: number } | null {
  const profile = new Float32Array(height)
  const col = new Float32Array(width)
  const at = (x: number, y: number, c: number) => rgba[(y * width + x) * 4 + c]
  for (let y = band; y < height - band; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let d = 0
      for (let c = 0; c < 3; c += 1) {
        let above = 0
        let below = 0
        for (let k = 1; k <= band; k += 1) {
          above += at(x, y - k, c)
          below += at(x, y + k - 1, c)
        }
        d += Math.abs(above - below) / band
      }
      col[x] = d
    }
    profile[y] = Float32Array.from(col).sort()[Math.floor(width / 2)]
  }
  let best = 0
  for (const v of profile) best = Math.max(best, v)
  if (best < 24) return null
  let y = band
  while (y < height - band && profile[y] < best / 2) y += 1
  /* On to the peak of that step. */
  while (y + 1 < height - band && profile[y + 1] > profile[y]) y += 1
  return { row: y, strength: profile[y] }
}

/** The brightest spot: the centre of the brightest tenth of a percent of pixels, and how bright. */
export function brightest(lum: Float32Array, width: number): { x: number; y: number; level: number } {
  const sorted = Float32Array.from(lum).sort()
  const cut = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.999))]
  let sx = 0
  let sy = 0
  let n = 0
  for (let i = 0; i < lum.length; i += 1) {
    if (lum[i] >= cut) {
      sx += i % width
      sy += Math.floor(i / width)
      n += 1
    }
  }
  return { x: sx / n, y: sy / n, level: cut }
}

/** Strong edges by the Sobel gradient: true where it is in the top `share` of the picture's gradients. */
export function edges(lum: Float32Array, width: number, height: number, share = 0.08): Uint8Array {
  const g = new Float32Array(width * height)
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const p = (dx: number, dy: number) => lum[(y + dy) * width + x + dx]
      const gx = p(1, -1) + 2 * p(1, 0) + p(1, 1) - p(-1, -1) - 2 * p(-1, 0) - p(-1, 1)
      const gy = p(-1, 1) + 2 * p(0, 1) + p(1, 1) - p(-1, -1) - 2 * p(0, -1) - p(1, -1)
      g[y * width + x] = Math.hypot(gx, gy)
    }
  }
  const sorted = Float32Array.from(g).sort()
  const cut = Math.max(1, sorted[Math.floor(sorted.length * (1 - share))])
  const out = new Uint8Array(width * height)
  for (let i = 0; i < g.length; i += 1) out[i] = g[i] >= cut ? 1 : 0
  return out
}

/** Distance from every pixel to the nearest edge pixel (two-pass chamfer, 1 and the square root of 2). */
export function distanceToEdges(e: Uint8Array, width: number, height: number): Float32Array {
  const d = new Float32Array(width * height)
  for (let i = 0; i < d.length; i += 1) d[i] = e[i] === 1 ? 0 : 1e9
  const D = Math.SQRT2
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x
      if (x > 0) d[i] = Math.min(d[i], d[i - 1] + 1)
      if (y > 0) d[i] = Math.min(d[i], d[i - width] + 1)
      if (x > 0 && y > 0) d[i] = Math.min(d[i], d[i - width - 1] + D)
      if (x < width - 1 && y > 0) d[i] = Math.min(d[i], d[i - width + 1] + D)
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const i = y * width + x
      if (x < width - 1) d[i] = Math.min(d[i], d[i + 1] + 1)
      if (y < height - 1) d[i] = Math.min(d[i], d[i + width] + 1)
      if (x < width - 1 && y < height - 1) d[i] = Math.min(d[i], d[i + width + 1] + D)
      if (x > 0 && y < height - 1) d[i] = Math.min(d[i], d[i + width - 1] + D)
    }
  }
  return d
}

/** Median distance, in pixels, from the render's edges to the photo's nearest edge; and the share within `nearPx`. */
export function edgeAgreement(renderEdges: Uint8Array, photoDistance: Float32Array, nearPx = 4): { medianPx: number; within: number; count: number } | null {
  const ds: number[] = []
  for (let i = 0; i < renderEdges.length; i += 1) if (renderEdges[i] === 1) ds.push(photoDistance[i])
  if (ds.length === 0) return null
  ds.sort((a, b) => a - b)
  return { medianPx: ds[Math.floor(ds.length / 2)], within: ds.filter((d) => d <= nearPx).length / ds.length, count: ds.length }
}

/*
 * THE PHOTO'S FRAME INSIDE THE 3D CANVAS. The canvas is the phone's shape
 * and the photo is its own; the engine's field of view is set so the
 * photo's frame fits the canvas exactly one way, and the render is cut to
 * the photo's frame: `crop` in canvas pixels. The engine takes its angle
 * along the canvas's longer side.
 */
export function fitPhotoFrame(canvasW: number, canvasH: number, horizontalDeg: number, verticalDeg: number): { engineFovDeg: number; crop: { x: number; y: number; w: number; h: number } } {
  const t = (deg: number) => Math.tan((deg * Math.PI) / 360)
  const deg = (tan: number) => (2 * Math.atan(tan) * 180) / Math.PI
  const tanH = t(horizontalDeg)
  const tanV = t(verticalDeg)
  let canvasTanH: number
  let canvasTanV: number
  let crop: { x: number; y: number; w: number; h: number }
  if (canvasW / canvasH >= tanH / tanV) {
    /* The canvas is wider than the photo: heights match, the sides are cut. */
    canvasTanV = tanV
    canvasTanH = (tanV * canvasW) / canvasH
    const w = (canvasW * tanH) / canvasTanH
    crop = { x: (canvasW - w) / 2, y: 0, w, h: canvasH }
  } else {
    canvasTanH = tanH
    canvasTanV = (tanH * canvasH) / canvasW
    const h = (canvasH * tanV) / canvasTanV
    crop = { x: 0, y: (canvasH - h) / 2, w: canvasW, h }
  }
  return { engineFovDeg: deg(canvasW >= canvasH ? canvasTanH : canvasTanV), crop }
}
