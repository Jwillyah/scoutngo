/*
 * THE PHOTO AGAINST ITS 3D RECREATION, SCORED ON WHAT CAN BE SCORED
 * (src/core/photoCompare.ts does the arithmetic; this reads the pixels).
 *
 * Both pictures are scaled to SCORE_W pixels wide, the photo's shape. Every
 * difference is said in pixels of that and in degrees of the photo's view,
 * so a number means the same at any size.
 */
import { brightest, distanceToEdges, edgeAgreement, edges, findHorizon, horizonRow, luminance, project } from '../../core/photoCompare.ts'

export const SCORE_W = 360

export interface CompareScore {
  width: number
  height: number
  /** Degrees of the photo's view per pixel of the scored size, up and down. */
  degPerPx: number
  horizon: {
    /** From the camera's height and tilt. */
    predicted: number
    /** Found in the photo's pixels, and in the render's; null where no sea horizon shows. */
    photo: number | null
    render: number | null
  }
  /** Where the sun should be, and the photo's brightest spot; null when the sun is out of the frame or down. */
  sun: { predicted: { x: number; y: number }; photo: { x: number; y: number }; offDeg: number } | null
  sunNote: string
  /** The render's strong edges against the photo's: the median gap, and the share within 4 px. */
  edges: { medianPx: number; within: number } | null
}

function pixels(source: CanvasImageSource, w: number, h: number): Uint8ClampedArray | null {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (ctx === null) return null
  ctx.drawImage(source, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h).data
}

export function scoreCompare(
  photo: CanvasImageSource & { width: number; height: number },
  render: CanvasImageSource,
  view: { heightAboveSeaM: number; yaw: number; pitch: number; fov: { horizontalDeg: number; verticalDeg: number } },
  sun: { azimuth: number; altitude: number },
): CompareScore | null {
  const width = SCORE_W
  const height = Math.max(1, Math.round((SCORE_W * photo.height) / photo.width))
  const p = pixels(photo, width, height)
  const r = pixels(render, width, height)
  if (p === null || r === null) return null
  const lp = luminance(p, width, height)
  const lr = luminance(r, width, height)
  const degPerPx = view.fov.verticalDeg / height
  const predicted = horizonRow(view.heightAboveSeaM, view.pitch, view.fov.verticalDeg, height)
  const inFrame = predicted >= 0 && predicted <= height
  const foundPhoto = inFrame ? findHorizon(p, width, height) : null
  const foundRender = inFrame ? findHorizon(r, width, height) : null
  let sunScore: CompareScore['sun'] = null
  let sunNote = ''
  if (sun.altitude <= 0) sunNote = 'The sun was down when the photo was taken.'
  else {
    const at = project(sun, { yaw: view.yaw, pitch: view.pitch }, view.fov, { width, height })
    if (at === null || at.x < 0 || at.x > width || at.y < 0 || at.y > height) sunNote = 'The sun was out of this frame, so it is not scored.'
    else {
      const b = brightest(lp, width)
      sunScore = { predicted: at, photo: { x: b.x, y: b.y }, offDeg: Math.hypot(at.x - b.x, at.y - b.y) * degPerPx }
      sunNote = `The sun should be ${sunScore.offDeg.toFixed(1)} degrees from the photo's brightest spot.`
    }
  }
  const e = edgeAgreement(edges(lr, width, height), distanceToEdges(edges(lp, width, height), width, height))
  return {
    width,
    height,
    degPerPx,
    horizon: { predicted, photo: foundPhoto?.row ?? null, render: foundRender?.row ?? null },
    sun: sunScore,
    sunNote,
    edges: e === null ? null : { medianPx: e.medianPx, within: e.within },
  }
}
