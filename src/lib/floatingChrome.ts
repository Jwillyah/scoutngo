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
