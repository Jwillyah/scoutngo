/*
 * ILLUSTRATIVE CLOUDS FOR THE 3D PREVIEW, from the forecast's cloud cover.
 *
 * The forecast gives how much of the sky is covered at three heights (low,
 * mid, high, per cent). It does not say where the clouds are, so they are
 * placed generically (seeded by the place and the hour, so the same preview
 * looks the same twice) and the preview says "Clouds illustrative".
 *
 * How many: enough that their footprints cover the layer's share of a disc
 * of CLOUD_FIELD_M around the venue (n = cover x disc area / one cloud's
 * area). Checked a second way by casting rays from the ground at the venue
 * into the layer and counting the share that hit a cloud
 * (coveredShareByRays), within the disc where the layer is seen from close.
 */
export const CLOUD_FIELD_M = 6000

export interface CloudLayer {
  name: 'low' | 'mid' | 'high'
  heightM: number
  /** One cloud's footprint radius. */
  radiusM: number
}

export const LAYERS: readonly CloudLayer[] = [
  { name: 'low', heightM: 1200, radiusM: 350 },
  { name: 'mid', heightM: 4000, radiusM: 700 },
  { name: 'high', heightM: 8000, radiusM: 1100 },
]

export interface Cloud {
  layer: CloudLayer['name']
  east: number
  north: number
  up: number
  radiusM: number
}

export interface Cover {
  low: number | null
  mid: number | null
  high: number | null
}

/* Mulberry32: a small seeded generator, so a place and hour always look the same. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** How many clouds of a layer cover `share` (0..1) of the field. */
export const cloudCount = (share: number, layer: CloudLayer): number =>
  Math.round((Math.min(1, Math.max(0, share)) * CLOUD_FIELD_M ** 2) / layer.radiusM ** 2)

/**
 * The clouds for some cover, placed so they do not stack: each tries a few
 * spots and keeps the one farthest from those already placed (a poor man's
 * blue noise), which keeps the covered share near the target.
 */
export function placeClouds(cover: Cover, seed: number): Cloud[] {
  const rand = seeded(seed)
  const out: Cloud[] = []
  for (const layer of LAYERS) {
    const pct = cover[layer.name]
    if (pct === null || pct <= 0) continue
    const n = cloudCount(pct / 100, layer)
    const mine: Cloud[] = []
    for (let i = 0; i < n; i += 1) {
      let best: Cloud | null = null
      let bestGap = -1
      for (let k = 0; k < 6; k += 1) {
        const r = CLOUD_FIELD_M * Math.sqrt(rand())
        const a = 2 * Math.PI * rand()
        const c: Cloud = { layer: layer.name, east: r * Math.cos(a), north: r * Math.sin(a), up: layer.heightM * (0.9 + 0.2 * rand()), radiusM: layer.radiusM * (0.8 + 0.4 * rand()) }
        const gap = mine.reduce((m, o) => Math.min(m, Math.hypot(o.east - c.east, o.north - c.north)), Infinity)
        if (gap > bestGap) {
          bestGap = gap
          best = c
        }
      }
      if (best !== null) mine.push(best)
    }
    out.push(...mine)
  }
  return out
}

/** The share of the field one layer's clouds cover, by sampling the disc on a grid (the second way). */
export function coveredShareByRays(clouds: readonly Cloud[], layer: CloudLayer['name'], steps = 200): number {
  const mine = clouds.filter((c) => c.layer === layer)
  let inside = 0
  let hit = 0
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < steps; j += 1) {
      const x = ((i + 0.5) / steps) * 2 * CLOUD_FIELD_M - CLOUD_FIELD_M
      const y = ((j + 0.5) / steps) * 2 * CLOUD_FIELD_M - CLOUD_FIELD_M
      if (Math.hypot(x, y) > CLOUD_FIELD_M) continue
      inside += 1
      if (mine.some((c) => Math.hypot(c.east - x, c.north - y) <= c.radiusM)) hit += 1
    }
  }
  return inside === 0 ? 0 : hit / inside
}
