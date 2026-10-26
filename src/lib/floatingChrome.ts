/*
 * EVERYTHING THAT FLOATS OVER THE MAP, as selectors: what a ray label must
 * never be placed under.
 *
 * ONE LIST, READ BY TWO. The map's label placer (MapView) and the label audit
 * (scripts/audit-labels.mjs) each kept their own copy, and they had drifted:
 * neither had the chip row or the map rail, and when the top bar replaced the
 * venue bar neither knew it was there. Two sources for one fact,
 * docs/failure-modes.md shape A. Add a new floating surface here, once.
 *
 * MAPLIBRE'S OWN CONTROL CORNERS are listed because the scale bar and the
 * attribution live in them; a control moved to another corner would otherwise
 * reintroduce labels stacking under it.
 */
export const FLOATING_CHROME_SELECTORS: readonly string[] = [
  '.topbar',
  '.chips2',
  '.rail2',
  '.tooldock',
  '.hud',
  '.mapctl',
  '.sheet',
  '.dock',
  '.card',
  '.confirm',
  '.picker__menu',
  '.overflow__menu',
  '.plat',
  '.newbuild',
  '.tapnote',
  '.skykey',
  '.shadowkey',
  '.maplibregl-ctrl-top-left',
  '.maplibregl-ctrl-top-right',
  '.maplibregl-ctrl-bottom-left',
  '.maplibregl-ctrl-bottom-right',
]

/*
 * A CONTROL CORNER IS MEASURED AS WHAT IS IN IT, NOT AS ITSELF.
 *
 * MapLibre's corner is a container, and the bottom-left one stretches the
 * height of the map: MEASURED at 390 x 844 in Plan, 102 px wide by 577 tall
 * (y 103 to 680) holding a 92 x 14 scale bar and a 28 x 28 credit button at
 * the foot (measurements/2026-10-25-ray-label-corner.md). Reserving the
 * container kept every ray label out of an empty strip down the left edge.
 *
 * Self-contained, with the selectors passed in, so the label audit can run
 * this very function in the page (it is sent as source) rather than a copy.
 */
export function floatingChromeNodes(root: ParentNode, selectors: readonly string[]): Element[] {
  return [...root.querySelectorAll(selectors.join(', '))].flatMap((node) =>
    /maplibregl-ctrl-(top|bottom)-(left|right)/.test(node.className.toString()) ? [...node.children] : [node],
  )
}
