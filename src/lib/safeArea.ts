/**
 * The status bar's height in CSS pixels: env(safe-area-inset-top), as
 * --safe-top in src/styles/tokens.css resolves it.
 *
 * LAID OUT IN A PROBE, NOT READ AS A STRING. getComputedStyle hands a custom
 * property back unresolved ("env(safe-area-inset-top, 0px)"), so the only way
 * to get the number is to let the browser lay out a box of that height.
 *
 * From the home-screen icon the page draws under the status bar (viewport-fit
 * =cover, black-translucent), and a map label placed there sat under the
 * clock (29 Oct). Zero in a browser tab and on a desktop.
 */
export function safeInsetTop(doc: Document = document): number {
  const probe = doc.createElement('div')
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:var(--safe-top, 0px);visibility:hidden;pointer-events:none'
  doc.body.appendChild(probe)
  const height = probe.getBoundingClientRect().height
  probe.remove()
  return Number.isFinite(height) ? height : 0
}

/** A rectangle with its top pushed below the status bar, for anything placed over the map. */
export function belowStatusBar<R extends { top: number }>(box: R, inset: number): R {
  return box.top >= inset ? box : { ...box, top: inset }
}
