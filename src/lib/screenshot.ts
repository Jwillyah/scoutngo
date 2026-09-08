/**
 * The uploaded satellite screenshot.
 *
 * The image is held as an object URL in memory for the life of the tab. It is
 * never written to localStorage, never uploaded, and never persisted anywhere.
 * The URL is revoked when the image is replaced, cleared, or unmounted.
 */
export interface Screenshot {
  /** blob: URL. Valid only in this tab, only until it is revoked. */
  url: string
  name: string
  /**
   * The thing being shot, in normalized image coordinates, 0 to 1 from the top
   * left of the image. Every camera position will be aimed at this point.
   */
  subject: SubjectPoint | null
}

export interface SubjectPoint {
  x: number
  y: number
}

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg']

export function isAcceptedImage(file: File): boolean {
  return ACCEPTED_TYPES.includes(file.type)
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** Turns a click inside the image box into normalized 0 to 1 coordinates. */
export function normalizePoint(
  clientX: number,
  clientY: number,
  box: { left: number; top: number; width: number; height: number },
): SubjectPoint {
  if (box.width <= 0 || box.height <= 0) return { x: 0.5, y: 0.5 }
  return {
    x: clamp01((clientX - box.left) / box.width),
    y: clamp01((clientY - box.top) / box.height),
  }
}
