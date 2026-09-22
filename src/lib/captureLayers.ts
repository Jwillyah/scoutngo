/**
 * Which map layers belong to this app, and therefore must be hidden before the
 * map canvas is captured and sent to a model.
 *
 * WHY THIS EXISTS. `capture()` reads the WebGL canvas, and the canvas holds
 * every layer this app draws as well as the satellite tiles. Without this,
 * every capture carried our own annotations burned into the photograph: a full
 * height dashed sun axis through the subject, the sun and shadow rays, and the
 * translucent cone of any isolated position. The model was handed that and told
 * it was a satellite view.
 *
 * DERIVED FROM SOURCES, NOT FROM A LIST OF LAYER IDS. A new layer drawn on a
 * source already listed here is covered without anyone remembering to update
 * anything, and it is exactly that kind of drift that let the original bug live
 * as long as it did. Adding a new SOURCE is the one thing that needs a change
 * here, and that is a visible, deliberate edit.
 */

export const RADIUS_SOURCE = 'reach-radius'
export const CONE_SOURCE = 'fov-cones'
export const SUN_SOURCE = 'sun-axis'
export const RAY_SOURCE = 'sun-rays'

/** Every source this app draws with. The basemap is NOT here and must not be. */
export const APP_SOURCES: readonly string[] = [
  RADIUS_SOURCE,
  CONE_SOURCE,
  SUN_SOURCE,
  RAY_SOURCE,
]

/**
 * The app's own layers within a style.
 *
 * Pure, so the rule is testable without a WebGL context. It must never return a
 * basemap layer: hiding those would capture a blank rectangle and send that
 * instead, which is a worse failure than the one this fixes.
 */
export function appLayerIdsIn(
  layers: readonly { id: string; source?: unknown }[],
  sources: readonly string[] = APP_SOURCES,
): string[] {
  return layers
    .filter((layer) => layer.source !== undefined && sources.includes(String(layer.source)))
    .map((layer) => layer.id)
}
