import type { GroundView } from './groundView.ts'

/**
 * WITHOUT A PICTURE, ONE LINE: what to say, and whether Retry could help. Null
 * while there is, or may yet be, a picture. On 27 Oct a failed ground view left
 * the whole picture slot standing empty around one sentence.
 */
export function groundLine(view: GroundView, air: boolean, borrowed: boolean): { text: string; retry: boolean } | null {
  if (air && !borrowed) return { text: 'Flown, not walked: no venue pin to aim a ground view at.', retry: false }
  if (view.status !== 'no-key' && view.status !== 'no-coverage' && view.status !== 'error') return null
  const text = view.status === 'error' ? "Ground view didn't load" : view.message
  /* WHERE "HERE" WAS: a borrowed view is street level near the position, and nothing from another spot is shown instead. */
  return { text: borrowed ? `${text} (street level near this position)` : text, retry: view.status === 'error' }
}

