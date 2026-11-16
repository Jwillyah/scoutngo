/*
 * /credits is a real address, opened from every "How we got this" and Settings
 * (Batch DRONE, Section 0.4; CORE's 0.4, reverted). As /privacy: opening it is a
 * history entry, so Back closes it; App listens to popstate.
 */
export const CREDITS_PATH = '/credits'

export const atCredits = (): boolean => typeof window !== 'undefined' && window.location.pathname === CREDITS_PATH

export function openCredits(): void {
  window.history.pushState({}, '', CREDITS_PATH)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function closeCredits(): void {
  if (window.history.length > 1 && atCredits()) window.history.back()
  else {
    window.history.replaceState({}, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
}
