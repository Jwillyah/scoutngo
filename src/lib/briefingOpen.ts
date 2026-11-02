/*
 * WHEN THE TODAY BRIEFING OPENS BY ITSELF (Batch H, Section 2: "opens when
 * the app opens"). Batch I: on every launch, the home-screen app and a
 * Safari tab alike; the briefing is the app's front door. Only on a plain
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
  if (w.location.pathname !== '/' && w.location.pathname !== '') return false
  if (w.location.hash.length > 1) return false
  /* A bare front door only: any query (a shared link's, ?probe=1, ?calibration=1, ?brief=0) is someone asking for something else. */
  return w.location.search.length <= 1
}
