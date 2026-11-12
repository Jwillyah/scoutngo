/*
 * REAL SHADOWS, PAINTED (Batch Polish 2, Section 3). The buildings' shadows
 * as one picture laid on the map (a canvas source), not a polygon each:
 *
 *   union      every shadow drawn into one grey mask with "lighten", the
 *              greater of the two wherever they meet, so where two shadows
 *              overlap the ground is no darker than under one (a fill per
 *              building at 0.45 stacked to 0.70 where two met)
 *   fade       each one dark at its building, fading along its length to
 *              nothing at its end or 6x the building's height
 *              (src/core/shadowFade.ts)
 *   feather    the mask blurred by FEATHER_M, no hard edge
 *   roof       the building's own footprint cut out of its shadow (the lit
 *              roof); a roof inside a taller neighbour's shadow stays dark
 *   tint       the light's (shadowLayer.ts shadowTint), at SHADOW_OPACITY
 *
 * The shapes are shadowMap's own (they also answer "is this point in
 * shadow"); this only draws them. Local metres around the shadows' middle,
 * so a few hundred metres either way stay square.
 */
import type { ShadowMap } from '../core/shadowMap.ts'
import { FADE_STOPS, fadeLength, FEATHER_M, rasterScale, SHADOW_OPACITY } from '../core/shadowFade.ts'

const M_PER_DEG = 111_320

export interface ShadowRaster {
  /** Corners [lon, lat]: top left, top right, bottom right, bottom left (MapLibre's order). */
  coordinates: [[number, number], [number, number], [number, number], [number, number]]
  /** How many shadows were drawn, and how long it took (ms), for the audits. */
  drawn: number
  ms: number
}

/** The tint's [r, g, b] from "rgb(r, g, b)". */
const rgbOf = (tint: string): [number, number, number] => {
  const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(tint)
  return m === null ? [10, 9, 12] : [Number(m[1]), Number(m[2]), Number(m[3])]
}

let mask: HTMLCanvasElement | null = null

/**
 * Paints `map`'s shadows onto `canvas` and returns where it lies, or null
 * when there is nothing to draw (the canvas is then cleared).
 */
export function paintShadows(map: ShadowMap | null, tint: string, canvas: HTMLCanvasElement, maxPx = 1024, within: { west: number; south: number; east: number; north: number } | null = null): ShadowRaster | null {
  const t0 = performance.now()
  /* Read back every paint (the tint goes into the alpha): kept on the CPU, no GPU readback. */
  const out = canvas.getContext('2d', { willReadFrequently: true })
  if (out === null) return null
  /* Only the shadows in view (and a margin): the pixels go where they are seen, half a metre each near the ground. */
  const shadows =
    map === null || map.status !== 'ok'
      ? []
      : within === null
        ? map.shadows
        : map.shadows.filter((sh) => sh.hull.some(([x, y]) => x >= within.west && x <= within.east && y >= within.south && y <= within.north))
  if (shadows.length === 0) {
    out.clearRect(0, 0, canvas.width, canvas.height)
    return null
  }
  /* The extent, in degrees, then local metres about its middle. */
  let w = Infinity
  let e = -Infinity
  let s = Infinity
  let n = -Infinity
  for (const sh of shadows) {
    for (const [x, y] of sh.hull) {
      if (x < w) w = x
      if (x > e) e = x
      if (y < s) s = y
      if (y > n) n = y
    }
  }
  /* No further than the view's margin: a long low-sun shadow running off the screen does not spread the pixels thin. */
  if (within !== null) {
    w = Math.max(w, within.west)
    e = Math.min(e, within.east)
    s = Math.max(s, within.south)
    n = Math.min(n, within.north)
  }
  const pad = (FEATHER_M * 4) / M_PER_DEG
  const lat0 = (s + n) / 2
  const kx = M_PER_DEG * Math.cos((lat0 * Math.PI) / 180)
  w -= pad / Math.cos((lat0 * Math.PI) / 180)
  e += pad / Math.cos((lat0 * Math.PI) / 180)
  s -= pad
  n += pad
  const widthM = (e - w) * kx
  const heightM = (n - s) * M_PER_DEG
  const mpp = rasterScale(Math.max(widthM, heightM), maxPx)
  const W = Math.max(2, Math.ceil(widthM / mpp))
  const H = Math.max(2, Math.ceil(heightM / mpp))
  const px = (lon: number) => ((lon - w) * kx) / mpp
  const py = (lat: number) => ((n - lat) * M_PER_DEG) / mpp

  /* The mask: black, each shadow in grey by its darkness, the greater kept. */
  mask ??= document.createElement('canvas')
  mask.width = W
  mask.height = H
  const g = mask.getContext('2d')
  if (g === null) return null
  g.globalCompositeOperation = 'source-over'
  g.fillStyle = '#000'
  g.fillRect(0, 0, W, H)
  g.globalCompositeOperation = 'lighten'
  let drawn = 0
  for (const sh of shadows) {
    if (sh.hull.length < 3) continue
    const fade = fadeLength(sh.heightMeters) / mpp
    if (fade <= 0 || sh.lengthMeters <= 0) continue
    /* From the footprint's middle, along the shadow's bearing. */
    let cx = 0
    let cy = 0
    for (const [x, y] of sh.footprint) {
      cx += px(x)
      cy += py(y)
    }
    cx /= sh.footprint.length
    cy /= sh.footprint.length
    const b = (sh.bearing * Math.PI) / 180
    const grad = g.createLinearGradient(cx, cy, cx + Math.sin(b) * fade, cy - Math.cos(b) * fade)
    /* Dark along most of it, fading toward its end (shadowFade.ts FADE_STOPS). */
    for (const [at, v] of FADE_STOPS) grad.addColorStop(at, `rgb(${v}, ${v}, ${v})`)
    g.fillStyle = grad
    g.beginPath()
    sh.hull.forEach(([x, y], i) => (i === 0 ? g.moveTo(px(x), py(y)) : g.lineTo(px(x), py(y))))
    g.closePath()
    /* The roof, cut out by the even-odd rule: the hull with a hole (shadowLayer.ts shadowRings). */
    sh.footprint.forEach(([x, y], i) => (i === 0 ? g.moveTo(px(x), py(y)) : g.lineTo(px(x), py(y))))
    g.closePath()
    g.fill('evenodd')
    drawn += 1
  }

  /* Feathered, then tinted: the grey is the alpha. */
  canvas.width = W
  canvas.height = H
  out.clearRect(0, 0, W, H)
  out.filter = `blur(${Math.max(0.5, FEATHER_M / mpp).toFixed(2)}px)`
  out.drawImage(mask, 0, 0)
  out.filter = 'none'
  const img = out.getImageData(0, 0, W, H)
  const d = img.data
  const [r, gg, bb] = rgbOf(tint)
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i]
    d[i] = r
    d[i + 1] = gg
    d[i + 2] = bb
    d[i + 3] = Math.round(a * SHADOW_OPACITY)
  }
  out.putImageData(img, 0, 0)
  return {
    coordinates: [
      [w, n],
      [e, n],
      [e, s],
      [w, s],
    ],
    drawn,
    ms: performance.now() - t0,
  }
}
