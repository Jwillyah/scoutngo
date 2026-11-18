/*
 * THE 3D VIEW'S FIRST USEFUL FRAME (Batch SIMPLE-1, Section 4).
 *
 * Jwilly's phone, Settings › Debug, 18 Nov on 3db2f29: of 20 errors, 13 were
 * "3D not shown in 10 s" and 5 "Fly not open in 3 s", with no shader or
 * context error among them. The view was shown only when nothing at all was
 * in flight (src/three/world/scene.ts, `pending.n === 0 && ground.ready()`):
 * the near square's 256 sharp tiles, the mid and far rings and the water, some
 * 860 to 980 requests (docs/batches/3d-decisions.md, finding 1). Over a phone
 * network that is more than ten seconds.
 *
 * Now the view is shown at its first useful frame: the near square standing
 * on its terrain, wearing its coarse picture, with the sharp tiles of its
 * nearest ring in. The mid and far rings start after that and stream in.
 */

/** The near square's sharp tiles counted for the first frame: rings 0 to this, round the centre. 1 is the middle 4 x 4. */
export const NEAR_FIRST_RING = 1

/**
 * Which ring round the centre the tile (i, j) of an n x n square is in: 0 for
 * the middle 2 x 2, 1 for the 4 x 4 round it, and so on (by the tile's centre).
 */
export const tileRing = (i: number, j: number, n: number): number => Math.floor(Math.max(Math.abs(i + 0.5 - n / 2), Math.abs(j + 0.5 - n / 2)))

/** The n x n square's tiles in the order they are fetched: ring by ring from the centre, nearest first within a ring. */
export function nearTileOrder(n: number): { i: number; j: number }[] {
  const d = (t: { i: number; j: number }) => Math.hypot(t.i + 0.5 - n / 2, t.j + 0.5 - n / 2)
  return Array.from({ length: n * n }, (_, k) => ({ i: k % n, j: Math.floor(k / n) })).sort((a, b) => tileRing(a.i, a.j, n) - tileRing(b.i, b.j, n) || d(a) - d(b))
}

/** How many tiles rings 0 to `ring` hold in an n x n square. */
export const firstRingCount = (n: number, ring = NEAR_FIRST_RING): number => Math.min(n, 2 * (ring + 1)) ** 2

/**
 * The first useful frame: the near square built (its terrain read, its
 * coarse picture drawn) and every sharp tile of its first ring settled (in,
 * or failed: a tile that could not be had shows its parent, never a hole).
 */
export function firstUseful(s: { nearBuilt: boolean; firstRingSettled: number; firstRingCount: number }): boolean {
  return s.nearBuilt && s.firstRingSettled >= s.firstRingCount
}

/*
 * A LOST CONTEXT, REBUILT AT MOST TWICE (Batch SIMPLE-1, Section 4). Before,
 * every loss was rebuilt after 3 s with no count: if iOS takes the context
 * back for memory, the rebuild asks for the same memory again, a loop that
 * ends in "A problem repeatedly occurred". The third loss in one open gives
 * up: "3D didn't load · Back to 2D".
 */
export const MAX_CONTEXT_REBUILDS = 2

/** What to do on a lost context, given how many have been lost in this open, this one included. */
export const afterContextLoss = (losses: number): 'rebuild' | 'give-up' => (losses <= MAX_CONTEXT_REBUILDS ? 'rebuild' : 'give-up')
