/*
 * /privacy is a real address, opened from About and the home page's footer.
 * Opening it is a history entry, so Back closes it; App listens to popstate.
 */
export const PRIVACY_PATH = '/privacy'

export const atPrivacy = (): boolean => typeof window !== 'undefined' && window.location.pathname === PRIVACY_PATH

export function openPrivacy(): void {
  window.history.pushState({}, '', PRIVACY_PATH)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function closePrivacy(): void {
  if (window.history.length > 1 && atPrivacy()) window.history.back()
  else {
    window.history.replaceState({}, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
}
