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

/*
 * WHICH MODEL WRITES THE CALL SHEET. Sonnet by default: it is the shooter's
 * own key and their own bill, and a call sheet is a short, tool-led job.
 * Opus is one tap away for whoever wants it. Kept on this phone.
 */
export const CALL_SHEET_MODELS = {
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
} as const
export type CallSheetModelChoice = keyof typeof CALL_SHEET_MODELS
export const DEFAULT_CALL_SHEET_MODEL: CallSheetModelChoice = 'sonnet'
export const MODEL_STORAGE = 'scoutngo.callSheetModel.v1'

export function readModelChoice(): CallSheetModelChoice {
  try {
    const stored = localStorage.getItem(MODEL_STORAGE)
    return stored === 'opus' || stored === 'sonnet' ? stored : DEFAULT_CALL_SHEET_MODEL
  } catch {
    return DEFAULT_CALL_SHEET_MODEL
  }
}

export function saveModelChoice(choice: CallSheetModelChoice): void {
  try {
    localStorage.setItem(MODEL_STORAGE, choice)
  } catch {
    /* Not stored: the default stands next time. */
  }
}
