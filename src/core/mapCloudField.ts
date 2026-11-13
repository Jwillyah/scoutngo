/*
 * THE FORECAST CLOUD AS A SOFT FIELD (Batch NOW, Section 4: "draw it as a
 * smooth, soft field, not grid squares"). The model's cover at the grid's
 * points (src/core/cloudGrid.ts, 5 x 5 over 150 km), interpolated between
 * them (bilinear), its opacity by cover: nothing under FIELD_FROM_PCT, rising
 * to FIELD_MAX_ALPHA at 100%. The map blurs it once more as it draws. The
 * label says it is a forecast ("Forecast · Sat 1 AM"): the softness no
 * longer tells it from the satellite's photograph, the words do.
 *
 * Arithmetic only: an RGBA buffer the map turns into an image.
 */
export const FIELD_PX = 64
export const FIELD_FROM_PCT = 10
export const FIELD_MAX_ALPHA = 0.7

/** Opacity for a cover, 0-1. */
export function fieldAlpha(cover: number | null): number {
  if (cover === null || !Number.isFinite(cover) || cover <= FIELD_FROM_PCT) return 0
  return Math.min(1, (cover - FIELD_FROM_PCT) / (100 - FIELD_FROM_PCT)) * FIELD_MAX_ALPHA
}

/**
 * `grid[row][col]`, row 0 the north, cover % (null where not said). The
 * field spans the grid's cells edge to edge; each pixel's cover is the
 * bilinear blend of the four cell centres round it (a missing one leaves
 * its weight out). Returns RGBA, white.
 */
export function cloudFieldPixels(grid: readonly (readonly (number | null)[])[], px = FIELD_PX, opacity = 1): Uint8ClampedArray {
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  const out = new Uint8ClampedArray(px * px * 4)
  if (rows === 0 || cols === 0) return out
  for (let y = 0; y < px; y += 1) {
    /* Pixel centre in cell units, cell centres at 0.5, 1.5 ... */
    const gy = Math.min(rows - 1, Math.max(0, ((y + 0.5) / px) * rows - 0.5))
    const r0 = Math.floor(gy)
    const r1 = Math.min(rows - 1, r0 + 1)
    const fy = gy - r0
    for (let x = 0; x < px; x += 1) {
      const gx = Math.min(cols - 1, Math.max(0, ((x + 0.5) / px) * cols - 0.5))
      const c0 = Math.floor(gx)
      const c1 = Math.min(cols - 1, c0 + 1)
      const fx = gx - c0
      let sum = 0
      let wsum = 0
      for (const [r, c, w] of [
        [r0, c0, (1 - fx) * (1 - fy)],
        [r0, c1, fx * (1 - fy)],
        [r1, c0, (1 - fx) * fy],
        [r1, c1, fx * fy],
      ] as const) {
        const v = grid[r]?.[c] ?? null
        if (v === null || w === 0) continue
        sum += v * w
        wsum += w
      }
      const cover = wsum === 0 ? null : sum / wsum
      const i = (y * px + x) * 4
      out[i] = 255
      out[i + 1] = 255
      out[i + 2] = 255
      out[i + 3] = Math.round(fieldAlpha(cover) * opacity * 255)
    }
  }
  return blurAlpha(out, px, BLUR_PASSES)
}

/** Box-blur passes over the alpha once interpolated: the soft edge (a canvas filter is not on every phone's Safari). */
export const BLUR_PASSES = 2

export function blurAlpha(buf: Uint8ClampedArray, px: number, passes: number): Uint8ClampedArray {
  let a = buf
  for (let p = 0; p < passes; p += 1) {
    const next = new Uint8ClampedArray(a)
    for (let y = 0; y < px; y += 1) {
      for (let x = 0; x < px; x += 1) {
        let sum = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = x + dx
            const yy = y + dy
            if (xx < 0 || yy < 0 || xx >= px || yy >= px) continue
            sum += a[(yy * px + xx) * 4 + 3]
            n += 1
          }
        }
        next[(y * px + x) * 4 + 3] = Math.round(sum / n)
      }
    }
    a = next
  }
  return a
}

/** The cells as rows, north first, west to east, and the field's corners [lon, lat] (top-left, top-right, bottom-right, bottom-left): each cell centre half a step in from the edge. */
export function fieldGrid(cells: readonly { at: { lat: number; lon: number }; cover: number | null }[]): { grid: (number | null)[][]; corners: [[number, number], [number, number], [number, number], [number, number]] } | null {
  if (cells.length < 4) return null
  const lats = [...new Set(cells.map((c) => c.at.lat.toFixed(4)))].map(Number).sort((a, b) => b - a)
  const n = Math.round(Math.sqrt(cells.length))
  if (n * n !== cells.length) return null
  const rows = [...cells].sort((a, b) => b.at.lat - a.at.lat).reduce<{ at: { lat: number; lon: number }; cover: number | null }[][]>((acc, c, i) => {
    const r = Math.floor(i / n)
    ;(acc[r] ??= []).push(c)
    return acc
  }, [])
  for (const r of rows) r.sort((a, b) => a.at.lon - b.at.lon)
  void lats
  const north = rows[0].reduce((s, c) => s + c.at.lat, 0) / n
  const south = rows[n - 1].reduce((s, c) => s + c.at.lat, 0) / n
  const west = rows.reduce((s, r) => s + r[0].at.lon, 0) / n
  const east = rows.reduce((s, r) => s + r[n - 1].at.lon, 0) / n
  const dLat = (north - south) / (n - 1) / 2
  const dLon = (east - west) / (n - 1) / 2
  const N = north + dLat
  const S = south - dLat
  const W = west - dLon
  const E = east + dLon
  return { grid: rows.map((r) => r.map((c) => c.cover)), corners: [[W, N], [E, N], [E, S], [W, S]] }
}

/** Within this many hours after now, the last frame fades into the forecast. */
export const CROSSFADE_H = 3
/** The forecast's share, 0 at now to 1 at CROSSFADE_H ahead. */
export const forecastShare = (hoursAhead: number): number => Math.max(0, Math.min(1, hoursAhead / CROSSFADE_H))
