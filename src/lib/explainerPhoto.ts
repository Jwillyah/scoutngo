/*
 * "ADD YOUR OWN EXAMPLE PHOTO" FOR A TIDE EXPLAINER, KEPT ON THIS PHONE ONLY.
 *
 * The picture never leaves the phone: it is shrunk in a canvas to
 * PHOTO_MAX_PX on its long side and kept as a JPEG data URL in localStorage
 * under the explainer's own key. No upload, no server.
 */
export const PHOTO_MAX_PX = 900
const key = (id: string) => `scoutngo.explainer.${id}.v1`

export function readPhoto(id: string): string | null {
  try {
    return localStorage.getItem(key(id))
  } catch {
    return null
  }
}

export function forgetPhoto(id: string): void {
  try {
    localStorage.removeItem(key(id))
  } catch {
    /* Nothing kept, nothing to forget. */
  }
}

/** Shrinks and keeps the picture; resolves false when the phone would not store it. */
export async function keepPhoto(id: string, file: File): Promise<boolean> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const scale = Math.min(1, PHOTO_MAX_PX / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
    localStorage.setItem(key(id), canvas.toDataURL('image/jpeg', 0.8))
    return true
  } catch {
    return false
  } finally {
    URL.revokeObjectURL(url)
  }
}
