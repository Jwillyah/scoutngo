/*
 * THE CALL SHEET AUDIT: WHAT LEAVES THE PHONE, AND THE INVENTED NUMBER.
 *
 * Usage:  node scripts/audit-callsheet.mjs
 * Exits:  0 clean, 1 on a problem found, 2 when it could not look.
 *
 * The browser's requests are intercepted, so no real key and no real model
 * are used. Anthropic is played by this script: the first answer asks for
 * sun_times, the second writes a sheet with an invented sunset, 7:12 PM.
 *
 *   1  every request the call sheet makes goes to api.anthropic.com, and
 *      only there; the key is in a header, never the URL
 *   2  no request body carries the venue's coordinate
 *   3  the card shows the app's own sunset in place of 7:12 PM, and says so
 *   4  with no choice made, the model asked for is Sonnet
 *
 * SHAPE B GUARD: fails unless at least two Anthropic requests were seen and
 * the card rendered a sheet.
 */
import { connect } from './cdp.mjs'
import { goToStage, guardAudit, startWatchdog } from './preflight.mjs'

guardAudit('call sheet')
const watchdog = startWatchdog('call sheet', 240_000)
const { send, ev, wait, ws, dispose } = await connect()

const seen = []
let turn = 0
await send('Fetch.enable', { patterns: [{ urlPattern: 'https://api.anthropic.com/*' }] })
ws.addEventListener('message', async (event) => {
  const m = JSON.parse(event.data)
  if (m.method !== 'Fetch.requestPaused') return
  const { requestId, request } = m.params
  /* The browser's CORS preflight for the custom headers: answered the way Anthropic does, not counted. */
  if (request.method === 'OPTIONS') {
    await send('Fetch.fulfillRequest', {
      requestId,
      responseCode: 204,
      responseHeaders: [
        { name: 'access-control-allow-origin', value: '*' },
        { name: 'access-control-allow-methods', value: 'POST, OPTIONS' },
        { name: 'access-control-allow-headers', value: 'content-type, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access' },
      ],
      body: '',
    })
    return
  }
  seen.push({ url: request.url, headers: request.headers, body: request.postData ?? '' })
  turn += 1
  const body =
    turn === 1
      ? { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'sun_times', input: {} }] }
      : { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Run of show\nSunset 7:12 PM: last drone push.' }] }
  await send('Fetch.fulfillRequest', {
    requestId,
    responseCode: 200,
    responseHeaders: [
      { name: 'content-type', value: 'application/json' },
      { name: 'access-control-allow-origin', value: '*' },
    ],
    body: Buffer.from(JSON.stringify(body)).toString('base64'),
  })
})

await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
await wait(2500)
await ev(`localStorage.clear(); localStorage.setItem('scoutngo.landing.v1','true'); localStorage.setItem('scoutngo.anthropicKey.v1','sk-ant-audit-key')`)
await send('Page.navigate', { url: 'http://127.0.0.1:5173/?calibration=1&probe=1' })
await wait(8000)
await goToStage(ev, wait, 'plan')
const venue = await ev(`(() => { const c = window.__probe.map.getCenter(); return { lat: c.lat, lon: c.lng } })()`)
watchdog.note('plan')

await ev(`document.querySelector('button[aria-label="Menu"]')?.click()`)
await wait(400)
const opened = await ev(`(() => { const b = [...document.querySelectorAll('.sidemenu__item')].find((x) => x.textContent.includes('Call sheet')); b?.click(); return !!b })()`)
if (!opened) {
  console.log('=== CALL SHEET AUDIT ABORTED: no Call sheet item in the menu ===')
  process.exit(2)
}
await wait(1200)
const typed = await ev(`(() => {
  const box = document.querySelector('.callsheet__box')
  if (!box) return 'no box'
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(box, 'Surf contest, 3 athletes.')
  box.dispatchEvent(new Event('input', { bubbles: true }))
  return 'typed'
})()`)
if (typed !== 'typed') {
  console.log(`=== CALL SHEET AUDIT ABORTED: ${typed} ===`)
  process.exit(2)
}
await wait(400)
await ev(`[...document.querySelectorAll('.callsheet button')].find((b) => b.textContent.includes('Write the call sheet'))?.click()`)
await wait(5000)
watchdog.note('written')

let problems = 0
const check = (ok, line) => {
  console.log(`  ${ok ? 'ok     ' : 'PROBLEM'} ${line}`)
  if (!ok) problems += 1
}
if (seen.length < 2) {
  console.log(`=== CALL SHEET AUDIT ABORTED: saw ${seen.length} Anthropic requests, so the loop was not exercised ===`)
  process.exit(2)
}
check(seen.every((r) => new URL(r.url).origin === 'https://api.anthropic.com'), `all ${seen.length} requests went to api.anthropic.com`)
check(seen.every((r) => !r.url.includes('sk-ant')), 'the key is never in a URL')
check(seen.every((r) => Object.entries(r.headers).some(([k, v]) => k.toLowerCase() === 'x-api-key' && v === 'sk-ant-audit-key')), 'the key travels in the x-api-key header')
const lat = venue.lat.toFixed(3)
const lon = Math.abs(venue.lon).toFixed(3)
check(seen.every((r) => !r.body.includes(lat) && !r.body.includes(lon)), `no request body carries the venue (${lat}, -${lon})`)
const models = [...new Set(seen.map((r) => { try { return JSON.parse(r.body).model } catch { return null } }))]
check(models.length === 1 && models[0] === 'claude-sonnet-5-5', `the default model is Sonnet: ${JSON.stringify(models)}`)

const shown = await ev(`({ text: document.querySelector('.callsheet__text')?.textContent ?? null, fixed: document.querySelector('.callsheet__check--fixed')?.textContent ?? null })`)
if (shown.text === null) {
  console.log('=== CALL SHEET AUDIT ABORTED: no sheet was rendered ===')
  process.exit(2)
}
check(!shown.text.includes('7:12'), `the invented 7:12 PM is gone from the sheet: "${shown.text.replace(/\n/g, ' / ')}"`)
check(/Sunset \d{1,2}:\d{2} [AP]M/.test(shown.text), 'the sheet shows a sunset in the app’s clock, 12 hour, in its place')
check(shown.fixed !== null && shown.fixed.includes("7:12 PM replaced with the app's sunset"), `the card says what it replaced: "${shown.fixed}"`)

await send('Fetch.disable')
watchdog.stop()
await dispose()
console.log(`\n=== CALL SHEET PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
