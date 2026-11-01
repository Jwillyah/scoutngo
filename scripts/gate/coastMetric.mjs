/* The staircase count along a water mask's edge (scripts/audit-water-coast.mjs; tests/coastMetric.test.ts proves it can fail). */
/** Staircase steps along the water's edge in a magenta mask image. */
export function stairs(png) {
  const { width: W, height: H, data } = png
  const wet = (x, y) => { const i = (y * W + x) * 4; return data[i] > 200 && data[i + 1] < 70 && data[i + 2] > 200 }
  const count = (along, across, at) => {
    let steps = 0
    let still = 0
    let prev = null
    for (let a = 0; a < along; a += 1) {
      let edge = null
      for (let b = 1; b < across; b += 1) if (at(a, b) !== at(a, b - 1)) { edge = b; break }
      if (edge === null || prev === null) { prev = edge; still = 0; continue }
      const d = Math.abs(edge - prev)
      if (d === 0) still += 1
      else {
        if (d >= 4 && d < 40 && still >= 3) steps += 1
        still = 0
      }
      prev = edge
    }
    return steps
  }
  const m = Math.floor(Math.min(W, H) * 0.1)
  const rows = count(H - 2 * m, W - 2 * m, (a, b) => wet(m + b, m + a))
  const cols = count(W - 2 * m, H - 2 * m, (a, b) => wet(m + a, m + b))
  let any = 0
  for (let i = 0; i < data.length; i += 4 * 97) if (data[i] > 200 && data[i + 1] < 70 && data[i + 2] > 200) any += 1
  return { steps: Math.max(rows, cols), wetSample: any }
}

