/*
 * THE NEAR GROUND PICTURE'S SIZE (Batch DRONE, Section 2.6). The 3D view's
 * near square is one canvas, NEAR_TILES zoom-18 tiles across. At 256 px a
 * tile that is 4096 x 4096: 64 MiB of canvas, the same again as a texture,
 * and a third more for its mipmaps. iOS kills a tab that holds too much
 * (Batch CORE, Section 2: the 3D reload, most likely that, not proven), so
 * on iOS each tile is drawn at half size: 2048 x 2048, a quarter of the
 * memory. Elsewhere the picture stays sharp.
 *
 * Batch FIX, Section 0: the 3D view now takes its sizes from src/core/lite3d.ts
 * (1024 on an iPhone until it earns 2048); nearAtlasPx is kept for the old
 * measurement's sake (tests/groundAtlas.test.ts).
 */
export const ATLAS_PX_FULL = 4096
export const ATLAS_PX_IOS = 2048
/** The 3D view's pixel ratio is never over this (src/three/world/scene.ts). */
export const MAX_3D_DPR = 2

/** An iPhone, iPad or iPod, including an iPad that says it is a Mac (it has touch). */
export function isIOSDevice(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
}

/** The near square's canvas size in pixels. */
export const nearAtlasPx = (ios: boolean): number => (ios ? ATLAS_PX_IOS : ATLAS_PX_FULL)

/** Bytes the near picture holds: the canvas, its texture, and the texture's mipmaps (a third more). */
export const nearAtlasBytes = (px: number): number => Math.round(px * px * 4 * (1 + 1 + 1 / 3))
