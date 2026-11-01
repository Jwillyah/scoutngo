/*
 * HAND A FILE TO THE PHONE. Revoked on the next turn, not straight away:
 * Safari reads the object URL after click() returns (see saveScoutFile).
 */
export function saveText(text: string, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** The same, for bytes: a backup zip (src/lib/backup.ts). */
export function saveBytes(bytes: Uint8Array, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
