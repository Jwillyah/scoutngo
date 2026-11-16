/*
 * THE SIGNAL CHIP (Batch CORE, Section 7A.6): one small chip at the top, never
 * a stack of banners. "Offline · showing 3:10 PM" with no signal; "Showing
 * 3:10 PM · tap to refresh" when the newest forecast on screen is older than
 * STALE_AFTER_MS. Nothing when the signal is there and the forecast is fresh.
 */
export const STALE_AFTER_MS = 30 * 60_000

export function signalChipWords(online: boolean, shownAt: number | null, now: number, clock: (d: Date) => string): string | null {
  const shown = shownAt === null ? null : clock(new Date(shownAt))
  if (!online) return shown === null ? 'Offline · nothing saved yet' : `Offline · showing ${shown}`
  if (shownAt !== null && now - shownAt > STALE_AFTER_MS) return `Showing ${shown} · tap to refresh`
  return null
}
