/*
 * WHERE THE SHADOW PICTURE IS PAINTED (Batch TRUTH, Section 5): in a worker
 * when the browser can paint there with a blur (OffscreenCanvas with a 2D
 * context that has `filter`), else on the page as before (WebKit without it).
 */
let worker: Worker | null | undefined

export function canPaintOffThread(): boolean {
  if (typeof OffscreenCanvas === 'undefined' || typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined') return false
  const proto = (globalThis as { OffscreenCanvasRenderingContext2D?: { prototype: object } }).OffscreenCanvasRenderingContext2D?.prototype
  return proto !== undefined && 'filter' in proto
}

/** The one shadow worker, made on first use; null where it cannot paint (the page paints instead). */
export function shadowWorker(): Worker | null {
  if (worker !== undefined) return worker
  try {
    worker = canPaintOffThread() ? new Worker(new URL('./shadowRaster.worker.ts', import.meta.url), { type: 'module' }) : null
  } catch {
    worker = null
  }
  return worker
}
