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
/** The measured line from the pilot to each air position. */
export const PILOT_SOURCE = 'pilot-links'
/**
 * What a top-down and a 360 see: a ground rectangle with the shadows across
 * it, and a horizon ring with the sun marked on it. Neither is a cone.
 */
export const FOOTPRINT_SOURCE = 'shot-footprints'
/**
 * GOES-19 cloud imagery.
 *
 * HIDDEN BEFORE A CAPTURE, like everything else here, though for a different
 * reason. The rest of this list is annotation THIS APP DREW, and the capture
 * hides it so a model is not handed our own drawings as a photograph. Cloud is
 * not an annotation; it is observed weather. But the capture exists so a model
 * can read the GROUND and put positions on it, and a cloud layer at 55 percent
 * over the imagery hides the ground, which defeats the capture whatever the
 * cloud is.
 *
 * So the test is not "did we draw it", it is "does it stop the capture showing
 * the ground". Both answers are yes here.
 */
export const GOES_SOURCE = 'goes-sky'

/**
 * Both bands get their own source, so switching at dawn is a visibility change
 * rather than a source swap that drops the tiles and refetches them.
 *
 * BOTH IDS ARE LISTED because appLayerIdsIn matches a layer's `source` exactly.
 * Listing the `goes-sky` prefix alone matched nothing, and the first version of
 * the test for this passed only because its fixture used the prefix as a source
 * id, which no layer in the app does.
 */
export const GOES_BAND_SOURCES = [`${GOES_SOURCE}-visible`, `${GOES_SOURCE}-infrared`] as const

/** Every source this app draws with. The basemap is NOT here and must not be. */
export const APP_SOURCES: readonly string[] = [
  RADIUS_SOURCE,
  CONE_SOURCE,
  SUN_SOURCE,
  RAY_SOURCE,
  PILOT_SOURCE,
  FOOTPRINT_SOURCE,
  ...GOES_BAND_SOURCES,
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
