/*
 * LITE 3D ON THE IPHONE (Batch FIX, Section 0). The phone, not the Mac, is
 * the truth: on 16 Nov at 7:01 PM and 8:00 PM 3D and Fly reloaded the app
 * ("most likely out of memory") and Safari then said "A problem repeatedly
 * occurred", while the 5-of-5 WebKit test passed on the Mac. So on iOS the
 * 3D view starts small and earns its way up:
 *
 *   lite       ground pictures at most 1024 x 1024, pixel ratio 1.5, no
 *              shadows, the terrain meshes at half the segments, the tile
 *              caches capped at 64 tiles
 *   stepped    the same, with the near ground picture at 2048: only after
 *              STEP_UP_AFTER_MS shown at 30 frames a second or better with no
 *              context loss, kept on this phone (scoutngo.3dQuality.v1)
 *
 * Elsewhere (a desktop, an Android phone) the full view, unchanged. A lost
 * context while stepped puts this phone back on lite, and keeps it there.
 *
 * THE BUDGET. What the app puts on the GPU, by its own count (gpuBytes in
 * src/core/gpuBudget.ts), stays under BUDGET_IOS_BYTES on iOS.
 */
export type Quality3DLevel = 'full' | 'lite' | 'stepped'

export interface Quality3D {
  level: Quality3DLevel
  /** The near ground picture's size, pixels a side. */
  nearPx: number
  /** The fine square's picture (the imagery's top zoom under a low camera), pixels a side. */
  finePx: number
  /** The pixel ratio is never over this. */
  maxDpr: number
  shadows: boolean
  /** The shadow map's size when shadows are on. */
  shadowPx: number
  /** Grid segments of a far or mid ground tile, and of the near square. */
  ringSegments: number
  nearSegments: number
  /** Imagery bitmaps and terrain tiles kept in memory between uses. */
  pictureCache: number
  terrainCache: number
}

export const LITE_PX = 1024
export const STEPPED_PX = 2048
export const LITE_DPR = 1.5
export const LITE_TILE_CACHE = 64
export const STEP_UP_AFTER_MS = 20_000
export const STEP_UP_FPS = 30
/** Frames needed in the window before a step up is judged at all. */
export const STEP_UP_MIN_FRAMES = 60
export const BUDGET_IOS_BYTES = 150 * 1e6
export const QUALITY_KEY = 'scoutngo.3dQuality.v1'

export function quality3D(ios: boolean, stepped: boolean): Quality3D {
  if (!ios) return { level: 'full', nearPx: 4096, finePx: 2048, maxDpr: 2, shadows: true, shadowPx: 2048, ringSegments: 32, nearSegments: 128, pictureCache: 600, terrainCache: 160 }
  return {
    level: stepped ? 'stepped' : 'lite',
    nearPx: stepped ? STEPPED_PX : LITE_PX,
    finePx: LITE_PX,
    maxDpr: LITE_DPR,
    shadows: false,
    shadowPx: 0,
    ringSegments: 16,
    nearSegments: 64,
    pictureCache: LITE_TILE_CACHE,
    terrainCache: LITE_TILE_CACHE,
  }
}

/** What this phone kept: 'stepped' only after it earned it; anything else (nothing kept, storage blocked, 'lite') is lite. */
export const keptStepped = (stored: string | null): boolean => stored === 'stepped'

/**
 * Has this view earned the 2048 picture? `frames` is how long each frame
 * drawn since the view was shown took to draw, ms. Yes
 * when it has been shown STEP_UP_AFTER_MS, with no context loss, at least
 * STEP_UP_MIN_FRAMES drawn, and nine in ten of them drawn within a 30 fps
 * frame (33.3 ms): the phone kept up.
 */
export function earnedStepUp(shownMs: number, frames: readonly number[], contextLost: boolean): boolean {
  if (contextLost || shownMs < STEP_UP_AFTER_MS) return false
  if (frames.length < STEP_UP_MIN_FRAMES) return false
  const sorted = [...frames].sort((a, b) => a - b)
  const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))]
  return p90 <= 1000 / STEP_UP_FPS
}

/*
 * LABS (Batch 3D, Section 0.1; Jwilly's iPhone 13 Pro Max, iOS 18.7.8, 17 Nov
 * on 62899a6: "3D didn't load" within seconds, then a reload out of memory,
 * then Safari's "A problem repeatedly occurred"). 3D and Fly are a Settings ›
 * Labs switch. A choice made on the phone ('on' or 'off') wins over the
 * default.
 *
 * Batch SIMPLE-1, Section 4 (Jwilly, 18 Nov: "keep 3D and Fly on for testing
 * until they work"): on by default everywhere, iOS included. A failure lands
 * on the 2D map, never in a reload loop: a lost context is rebuilt at most
 * twice (src/core/firstView3d.ts), then "3D didn't load · Back to 2D", and
 * nothing reopens 3D or Fly after a reload (src/lib/errorLog.ts diedIn).
 * `ios` stays in the signature so the rule can differ again without moving.
 */
export const LABS_3D_KEY = 'scoutngo.labs3d.v1'
export const labs3DOn = (ios: boolean, stored: string | null): boolean => {
  void ios
  return stored !== 'off'
}
