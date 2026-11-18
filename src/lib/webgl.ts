/*
 * WebGL 2 or not: the 3D view needs it, and says so in one line when it is missing.
 *
 * Batch 3D, Section 1.2: ASKED ONCE, AND THE CONTEXT GIVEN BACK. This made a
 * new WebGL 2 context on every 3D, Fly, Stand here and Line up tap, opening
 * and closing, and dropped it for the garbage collector. WebKit keeps 16
 * live contexts a page and loses the OLDEST past that ("There are too many
 * active WebGL contexts on this page, the oldest context will be lost",
 * measured in Playwright's WebKit, measurements/2026-11-17-webgl-probe-webkit.md),
 * and the oldest is the map's or the 3D view's own. Now the answer is kept
 * and the one context it took is lost on purpose at once.
 */
let known: boolean | null = null

/** Whether this browser can draw the 3D view at all. */
export function hasWebGL2(): boolean {
  if (known !== null) return known
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    known = gl !== null
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    known = false
  }
  return known
}

/** For tests: ask again next time. */
export function forgetWebGL2(): void {
  known = null
}
