/*
 * WHERE THE SUN'S GLINT LIES ON THE WATER, seen from a camera.
 *
 * Flat water is a mirror: the glint is where a ray from the sun, bounced off
 * the plane, reaches the camera. Coordinates are local metres, east, north,
 * up; `sun` points toward the sun. Two ways:
 *
 *   mirror     reflect the sun's ray in the plane and walk back from the
 *              camera: P = C + t (sx, sy, -sz) with t = (Cz - w) / sz
 *   half-way   search the plane for the point where the half-way vector
 *              between "toward the camera" and "toward the sun" stands
 *              straight up (the reflection law, without the formula)
 *
 * The ocean shader draws its glint with the scene's own light; this is what
 * scripts/measure-cinema.mjs checks the rendered frame against.
 */
export type Vec3 = [number, number, number]

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2])
  return [v[0] / l, v[1] / l, v[2] / l]
}

/** The glint on the plane z = w by reflection, or null when the sun is down or the camera is not above the water. */
export function glintMirror(camera: Vec3, sun: Vec3, w: number): Vec3 | null {
  const s = norm(sun)
  if (s[2] <= 0 || camera[2] <= w) return null
  const t = (camera[2] - w) / s[2]
  return [camera[0] + t * s[0], camera[1] + t * s[1], w]
}

/** How far from straight up the half-way vector is at a point on the plane, radians. */
export function halfwayTilt(camera: Vec3, sun: Vec3, p: Vec3): number {
  const v = norm([camera[0] - p[0], camera[1] - p[1], camera[2] - p[2]])
  const s = norm(sun)
  const h = norm([v[0] + s[0], v[1] + s[1], v[2] + s[2]])
  return Math.acos(Math.min(1, Math.max(-1, h[2])))
}

/**
 * The glint by search, not by formula: a sweep of the plane around the
 * camera in every direction (each half degree) and at distances spaced
 * evenly in their logarithm (10 cm to `reachM`), then shrinking grids around
 * the best. A coarse even grid will not do: far out toward the sun the tilt
 * tends to a small number, and a coarse grid finds that instead.
 */
export function glintSearch(camera: Vec3, sun: Vec3, w: number, reachM = 20_000): Vec3 | null {
  if (norm(sun)[2] <= 0 || camera[2] <= w) return null
  let best = Infinity
  let cx = camera[0]
  let cy = camera[1]
  let step = 0
  const RINGS = 600
  for (let a = 0; a < 720; a += 1) {
    const az = (a / 720) * 2 * Math.PI
    for (let k = 0; k <= RINGS; k += 1) {
      const r = 0.1 * (reachM / 0.1) ** (k / RINGS)
      const x = camera[0] + r * Math.sin(az)
      const y = camera[1] + r * Math.cos(az)
      const tilt = halfwayTilt(camera, sun, [x, y, w])
      if (tilt < best) {
        best = tilt
        cx = x
        cy = y
        step = r * Math.max((reachM / 0.1) ** (1 / RINGS) - 1, Math.PI / 360)
      }
    }
  }
  let span = 2 * step
  /* A pattern search: the window moves to the best point, and shrinks only when a round finds nothing better (the valley is long and narrow when the sun is low). */
  for (let round = 0; round < 400 && span > 1e-4; round += 1) {
    const before = best
    let bx = cx
    let by = cy
    for (let i = -6; i <= 6; i += 1) {
      for (let j = -6; j <= 6; j += 1) {
        const x = cx + (i / 6) * span
        const y = cy + (j / 6) * span
        const tilt = halfwayTilt(camera, sun, [x, y, w])
        if (tilt < best) {
          best = tilt
          bx = x
          by = y
        }
      }
    }
    cx = bx
    cy = by
    if (best >= before) span /= 2
  }
  return [cx, cy, w]
}
