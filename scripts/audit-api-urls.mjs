/*
 * THE API URL AUDIT: NO VENUE IN A LOGGED URL.
 *
 * Usage:  node scripts/audit-api-urls.mjs
 * Exits:  0 when every /api request the running app made was a POST to a bare
 *         path, and both endpoints were actually seen. 1 on a problem found,
 *         2 when it could not look.
 *
 * WHY. Vercel keeps the request path of every function call, query string
 * included. Search used to send ?q=&lat=&lon= and Street View ?lat=&lon=, so
 * venue locations sat in those logs. tests/apiBodies.test.ts reads the source;
 * this watches what the browser actually sends, which is the thing that lands
 * in a log.
 *
 * SHAPE B GUARD. Seeing no /api request at all is not a pass: the run drives a
 * venue search and opens a position card, and fails unless it saw both
 * endpoints called.
 */
import { connect } from './cdp.mjs'
import { goToStage, guardAudit, startWatchdog } from './preflight.mjs'

guardAudit('api url')
const watchdog = startWatchdog('api url', 300_000)
const { send, ev, wait, ws, dispose } = await connect()

const seen = []
ws.addEventListener('message', (event) => {
  const m = JSON.parse(event.data)
  if (m.method !== 'Network.requestWillBeSent') return
  const url = new URL(m.params.request.url)
  /*
   * THE APP'S OWN /api ONLY. NOAA and Photon have /api/ paths too, and the
   * first run flagged them: they are other services' URLs, never Vercel's logs.
   */
  if (url.origin !== 'http://127.0.0.1:5173' || !url.pathname.startsWith('/api/')) return
  seen.push({ path: url.pathname, query: url.search, method: m.params.request.method, hasBody: m.params.request.hasPostData === true })
})

await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
await wait(3000)
await ev(`localStorage.clear(); localStorage.setItem('scoutngo.landing.v1','true')`)
await send('Page.navigate', { url: 'http://127.0.0.1:5173/?calibration=1&probe=1' })
await wait(8000)
watchdog.note('loaded')

/* A venue search, typed the way a person types it. */
const typed = await ev(`(() => {
  const input = document.querySelector('.search__input')
  if (!input) return 'no search input'
  input.focus()
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'atlantic park virginia beach')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  return 'typed'
})()`)
if (typed !== 'typed') {
  console.log(`=== API URL AUDIT ABORTED: ${typed} ===`)
  process.exit(2)
}
await wait(5000)
watchdog.note('searched')

/* A position, whose card asks for its ground view. */
await goToStage(ev, wait, 'plan')
await ev(`document.querySelector('.shootc__add')?.click()`)
await wait(500)
await ev(`(() => {
  const map = window.__probe.map
  const c = map.getCanvas()
  const point = { x: c.clientWidth / 2, y: c.clientHeight / 3 }
  map.fire('click', { lngLat: map.unproject([point.x, point.y]), point, originalEvent: { target: c } })
})()`)
await wait(5000)
watchdog.note('position placed')

let problems = 0
for (const request of seen) {
  const line = `${request.method} ${request.path}${request.query}`
  const ok = request.method === 'POST' && request.query === '' && request.hasBody
  console.log(`  ${ok ? 'ok     ' : 'PROBLEM'} ${line}${request.hasBody ? '  (body)' : ''}`)
  if (!ok) problems += 1
}
for (const path of ['/api/search', '/api/streetview']) {
  if (!seen.some((r) => r.path === path)) {
    console.log(`=== API URL AUDIT ABORTED: never saw ${path} called, so it was not checked ===`)
    process.exit(2)
  }
}

watchdog.stop()
await dispose()
console.log(`\n=== API URL PROBLEMS: ${problems} across ${seen.length} requests ===`)
process.exit(problems === 0 ? 0 : 1)
