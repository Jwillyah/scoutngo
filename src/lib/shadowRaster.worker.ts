/*
 * THE SHADOW PICTURE, PAINTED OFF THE MAIN THREAD (Batch TRUTH, Section 5:
 * 32 fps at 4x slowdown while scrubbing, the target 50). The same painting
 * as src/lib/shadowRaster.ts paintRaster, on OffscreenCanvases here; the
 * picture goes back as an ImageBitmap, drawn onto the map's canvas source in
 * one call. Only the newest job is painted: a minute the needle has left is
 * never worked on.
 */
import { paintRaster, type RasterShadow, type Within } from './shadowRaster.ts'

interface Job {
  seq: number
  shadows: RasterShadow[]
  tint: string
  maxPx: number
  within: Within | null
}

const out = new OffscreenCanvas(2, 2)
const mask = new OffscreenCanvas(2, 2)
let next: Job | null = null
let busy = false

const scope = self as unknown as { postMessage(message: unknown, transfer?: Transferable[]): void; onmessage: ((e: MessageEvent<Job>) => void) | null }

function run(): void {
  if (busy || next === null) return
  const job = next
  next = null
  busy = true
  try {
    const r = paintRaster(job.shadows, job.tint, out, mask, job.maxPx, job.within)
    if (r === null) scope.postMessage({ seq: job.seq, empty: true })
    else {
      const bitmap = out.transferToImageBitmap()
      scope.postMessage({ seq: job.seq, empty: false, bitmap, coordinates: r.coordinates, drawn: r.drawn, ms: r.ms }, [bitmap])
    }
  } finally {
    busy = false
  }
  run()
}

scope.onmessage = (e) => {
  next = e.data
  run()
}
