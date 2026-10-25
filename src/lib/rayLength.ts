/**
 * HOW LONG A SUN, MOON OR SHADOW RAY IS, AS A FRACTION OF THE SCREEN DIAGONAL.
 *
 * ONE: THE RAY RUNS TO THE EDGE OF THE SCREEN. A full diagonal from any point
 * on screen always leaves the frame, so the line reads as a direction all the
 * way across rather than as a short stub that might be read as a distance.
 * Asked for in the Phase 1 brief: "sun and moon direction lines run to the edge
 * of the screen, not stubs."
 *
 * WHAT IT REPLACED, AND WHAT STILL HOLDS. It was 0.28, a stub, chosen because
 * a world-space line crossed six states at regional zoom. The length is still
 * set in SCREEN space, so that problem does not come back: at any zoom the ray
 * is one screen long, never a hundred miles of ground.
 *
 * IN ITS OWN FILE so the map and the projection audit read one number. The
 * audit used to carry its own 0.28 beside this one, which is two sources for
 * one fact.
 */
export const RAY_SCREEN_FRACTION = 1
