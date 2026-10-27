/* How long a toast (src/components/Toast.tsx) stays, and the timer that closes it. */
export const TOAST_MS = 4000

/** Calls `done` after `ms`; returns the cancel. A function of its own so the timing is tested without a DOM. */
export function dismissAfter(done: () => void, ms: number = TOAST_MS, timers: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'> = globalThis): () => void {
  const id = timers.setTimeout(done, ms)
  return () => timers.clearTimeout(id)
}
