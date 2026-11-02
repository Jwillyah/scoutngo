/*
 * WHEN THE TODAY BRIEFING OPENS BY ITSELF (Batch H, Section 2: "opens when
 * the app opens"). When the app is opened from the home screen
 * (display-mode standalone, or iOS's navigator.standalone): that is a launch.
 * A Safari tab is browsing, and there it is Menu › Today. And only on a plain
 * launch: the address is the app's
 * own front door, with no shared plan in it and no deep path (a shared plan
 * or /field means you came for that), and the first-run landing has been
 * seen (it says what the app is first). Not under automation
 * (navigator.webdriver): the gate's browser audits drive the map and the
 * sheets, and their own briefing audit opens it from the menu.
 * Menu › Today opens it any time.
 */
interface Where {
  location: { pathname: string; hash: string; search: string }
  navigator: { webdriver?: boolean; standalone?: boolean }
  matchMedia?: (q: string) => { matches: boolean }
}

export function shouldOpenBriefing(w: Where | null, landingSeen: boolean): boolean {
  if (w === null || !landingSeen) return false
  if (w.navigator.webdriver === true) return false
  const homeScreen = w.navigator.standalone === true || w.matchMedia?.('(display-mode: standalone)').matches === true
  if (!homeScreen) return false
  if (w.location.pathname !== '/' && w.location.pathname !== '') return false
  if (w.location.hash.length > 1) return false
  const q = new URLSearchParams(w.location.search)
  return !q.has('p') && q.get('brief') !== '0'
}
