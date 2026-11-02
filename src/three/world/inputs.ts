/*
 * WHAT THE 3D SCENE IS DRAWN FROM, BEYOND THE MAP: the look, and the forecast's
 * sea, water level, cloud cover and visibility (src/lib/cinema/useCinemaData.ts).
 * Moved here from the old globe preview (Batch D) so nothing that drives the
 * scene imports the globe library.
 */
import type { Cover } from '../../core/clouds.ts'
import type { SeaInput } from '../../core/seaSurface.ts'

export type Look = 'real' | 'animated'

export const CLOUDS_NOTE = 'Clouds illustrative'

export interface CinemaInputs {
  sea: SeaInput
  /** The water's height in the scene's frame (NAVD88 metres, as the ground), or null when it is not known: then 0 and said so. */
  waterLevelM: number | null
  cover: Cover | null
  visibilityKm: number | null
  /** Where the ocean is, around the venue, as a mask image (no longer used by the 3D scene: it reads the water polygons). */
  seaMask: { url: string; halfM: number } | null
  seed: number
}

/*
 * A SOFT CLOUD: overlapping round puffs, white, fading at the edge. AN SVG
 * IMAGE, NOT A CANVAS (29 Oct: rainbow-speckled clouds on an iPhone). WebKit's
 * fingerprinting protection adds noise to pixels read back from a 2D canvas,
 * and a texture is read from its canvas; an image decoded from SVG is not.
 */
export const CLOUD_PUFFS: readonly (readonly [number, number, number])[] = [[70, 78, 46], [118, 60, 58], [170, 72, 48], [205, 86, 34], [40, 92, 30], [140, 92, 50]]
export function cloudSprite(): string {
  const puffs = CLOUD_PUFFS.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#p)"/>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="128" viewBox="0 0 256 128"><defs><radialGradient id="p"><stop offset="0.2" stop-color="#fff" stop-opacity="0.95"/><stop offset="0.6" stop-color="#fff" stop-opacity="0.6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>${puffs}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
