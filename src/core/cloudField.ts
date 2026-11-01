/*
 * THE CLOUD FIELD'S NOISE AND ITS COVER (Batch D, Section 5).
 *
 * The 3D clouds are drawn from this noise: a few octaves of value noise over
 * the ground plane, the same arithmetic in the shader (src/three/world/
 * clouds.ts, CLOUD_NOISE_GLSL) and here. A cloud is where the noise is above
 * a threshold, and the threshold is the noise's own quantile for the
 * forecast's cover: cover 37% puts cloud over about 37% of the field. That
 * is the whole claim; where each cloud is, is illustrative, and the "i" says
 * so.
 */

const fract = (x: number) => x - Math.floor(x)
/* Hash and noise written so float32 GLSL and float64 JS land within a hair of each other. */
export const hash2 = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453)

export function noise2(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  let fx = x - ix
  let fy = y - iy
  fx = fx * fx * (3 - 2 * fx)
  fy = fy * fy * (3 - 2 * fy)
  const a = hash2(ix, iy)
  const b = hash2(ix + 1, iy)
  const c = hash2(ix, iy + 1)
  const d = hash2(ix + 1, iy + 1)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

export const OCTAVES = 5
export function fbm(x: number, y: number): number {
  let v = 0
  let amp = 0.5
  let px = x
  let py = y
  for (let i = 0; i < OCTAVES; i += 1) {
    v += amp * noise2(px, py)
    px = px * 2.03 + 17.1
    py = py * 2.03 + 9.2
    amp *= 0.5
  }
  return v / 0.96875
}

/** The noise's distribution, sampled once: sorted values over a wide area. */
let sorted: Float64Array | null = null
function distribution(): Float64Array {
  if (sorted !== null) return sorted
  const n = 40_000
  const out = new Float64Array(n)
  /* A low-discrepancy walk over a field far larger than one cloud. */
  for (let i = 0; i < n; i += 1) out[i] = fbm(((i * 0.618034) % 1) * 400 + 0.37, ((i * 0.754878) % 1) * 400 + 0.71)
  out.sort()
  sorted = out
  return out
}

/** The noise level above which a share `cover` (0 to 1) of the field is cloud. */
export function coverThreshold(cover: number): number {
  const c = Math.max(0, Math.min(1, cover))
  if (c <= 0) return 2
  if (c >= 1) return -1
  const d = distribution()
  return d[Math.min(d.length - 1, Math.floor((1 - c) * d.length))]
}

/** The share of an area that is cloud at a threshold: for checks. */
export function coveredShare(threshold: number, x0 = 1000, y0 = 1000, span = 300, n = 120): number {
  let wet = 0
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) if (fbm(x0 + (i / n) * span, y0 + (j / n) * span) > threshold) wet += 1
  return wet / (n * n)
}
