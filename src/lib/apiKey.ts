/*
 * THE SHOOTER'S OWN ANTHROPIC KEY. Kept in localStorage on this phone, sent
 * only to api.anthropic.com and only when they press Write, never in a URL,
 * never in a backup file, deleted with one tap.
 */
export const API_KEY_STORAGE = 'scoutngo.anthropicKey.v1'

export function readApiKey(): string | null {
  try {
    const key = localStorage.getItem(API_KEY_STORAGE)
    return key === null || key.trim() === '' ? null : key.trim()
  } catch {
    return null
  }
}

export function saveApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE, key.trim())
}

export function deleteApiKey(): void {
  try {
    localStorage.removeItem(API_KEY_STORAGE)
  } catch {
    /* Nothing stored, nothing to delete. */
  }
}
