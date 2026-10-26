/*
 * WebGL 2 or not: the 3D view needs it, and says so in one line when it is missing.
 */
/** Whether this browser can draw the 3D view at all. */
export function hasWebGL2(): boolean {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null
  } catch {
    return false
  }
}
