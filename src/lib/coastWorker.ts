/*
 * The coastal cleanup (src/core/coastArtefacts.ts) off the main thread: a
 * coastal tile at zoom 15 took 215 ms on a laptop
 * (measurements/2026-10-27-coast-artefacts.md), longer on a phone, and the
 * map has to keep moving while it runs.
 */
import { cleanTileInContext } from '../core/coastArtefacts.ts'

export interface CoastJob {
  id: number
  tiles: (Float32Array | null)[]
  size: number
  metresPerPixel: number
}

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<CoastJob>) => void) | null
  postMessage: (message: unknown, transfer: Transferable[]) => void
}

scope.onmessage = (event) => {
  const { id, tiles, size, metresPerPixel } = event.data
  const { heights, result } = cleanTileInContext(tiles, size, metresPerPixel)
  scope.postMessage({ id, heights, changed: result.cleared + result.spikes + result.belowSea }, [heights.buffer])
}
