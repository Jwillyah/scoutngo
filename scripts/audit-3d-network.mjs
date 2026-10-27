/*
 * THE 3D VIEW TALKS ONLY TO THE HOSTS THE APP ALREADY USES.
 *
 * Usage:  node scripts/audit-3d-network.mjs   (app on :5173, Chrome on :9222)
 * Exits:  0 clean; 1 a request went somewhere else, or 3D failed offline; 2 could not look.
 *
 * Opens the 3D clay model at the calibration venue, waits for the globe to
 * finish loading, and records every request made from the moment the 3D
 * button was pressed. The allowed hosts are this app, Esri's imagery, AWS's
 * Terrarium elevation, OpenFreeMap's map tiles (the buildings and the sea,
 * src/lib/vectorTiles.ts) and Overpass, on any of the three servers the
 * app's one Overpass client asks in turn (src/lib/overpassClient.ts), for
 * the trees. Cesium ion, Bing, Google or anything else fails the gate, by
 * name.
 *
 * THEN OFFLINE: the network cut, 3D reopened, and it must load with the
 * venue's ground at the height it had online (src/lib/offline3d.ts).
 *
 * IT MUST HAVE LOOKED (docs/failure-modes.md, B). Tiles can come from the
 * phone's own cache with no network at all, so "no bad requests" proves
 * nothing by itself: the model must report that it drew imagery and
 * elevation tiles, and the globe must say it finished loading.
 */
import { connect } from './cdp.mjs'
import { goToStage, guardAudit, startWatchdog } from './preflight.mjs'

guardAudit('3d network')
const watchdog = startWatchdog('3d network', 240_000)
const ALLOWED = new Set([
  '127.0.0.1:5173',
  'localhost:5173',
  'server.arcgisonline.com',
  's3.amazonaws.com',
  'tiles.openfreemap.org',
  'overpass-api.de',
  'overpass.kumi.systems',
  'overpass.private.coffee',
])

const { send, ev, wait, dispose, onEvent } = await connect()
let problems = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

let armed = false
const seen = new Map()
const record = (url) => {
  if (!armed) return
  let host
  try {
    const u = new URL(url)
    if (u.protocol === 'data:' || u.protocol === 'blob:') return
    host = u.host
  } catch {
    return
  }
  seen.set(host, (seen.get(host) ?? 0) + 1)
}

try {
  await send('Network.enable', {})
  if (typeof onEvent !== 'function') throw new Error('cdp.mjs gives no event hook; cannot watch requests')
  onEvent('Network.requestWillBeSent', (p) => record(p.request.url))
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
  await wait(2500)
  await ev(`localStorage.setItem('scoutngo.landing.v1', 'true')`)
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/?calibration=1' })
  await wait(8000)
  await goToStage(ev, wait, 'plan')
  await wait(1500)

  armed = true
  const pressed = await ev(`(() => { const b = document.querySelector('button[aria-label="Open the 3D clay model"]'); if (!b) return 'no 3D button in the rail'; b.click(); return 'pressed' })()`)
  if (pressed !== 'pressed') throw new Error(pressed)

  let state = null
  for (let i = 0; i < 60; i += 1) {
    await wait(1000)
    state = await ev(`JSON.stringify((() => { const c = window.__clay; if (!c) return { ready: false }; return { ready: true, loaded: c.widget.scene.globe.tilesLoaded, ...c.counts } })())`)
    state = JSON.parse(state)
    if (state.ready && state.loaded && state.imagery > 0 && state.terrain > 0) break
  }
  await wait(3000)
  console.log(`### the 3D view, from the press of the button`)
  console.log(`  model ${state?.ready ? 'up' : 'NOT UP'}, globe ${state?.loaded ? 'loaded' : 'still loading'}, ${state?.imagery ?? 0} imagery and ${state?.terrain ?? 0} elevation tiles drawn`)
  if (!state?.ready) fail('the 3D model never came up, so nothing was looked at')
  else if (!(state.imagery > 0 && state.terrain > 0)) fail('the model drew no imagery or no elevation: nothing was looked at')
  else if (!state.loaded) fail('the globe never finished loading in 60 s')

  /*
   * OFFLINE. The same place with no signal: the overview area saved on the
   * first open, then the network cut and 3D reopened. It must load, and the
   * ground under the venue must stand at the height it had online.
   */
  const onlineGround = await ev(`window.__clay.groundAt({ lat: 38.364236, lon: -75.605912 })`)
  let saved = false
  for (let i = 0; i < 60 && !saved; i += 1) {
    await wait(1000)
    saved = await ev(`(JSON.parse(localStorage.getItem('scoutngo.offline.areas.v1') ?? '[]')).some((a) => a.kind === '3d')`)
  }
  console.log(`### offline`)
  console.log(`  3D overview saved: ${saved ? 'yes' : 'NO'}; ground at the venue online ${typeof onlineGround === 'number' ? onlineGround.toFixed(1) + ' m' : String(onlineGround)}`)
  if (!saved) fail('the 3D overview area was never saved, so 3D cannot open offline')
  armed = false
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await ev(`document.querySelector('button[aria-label="Back to the 2D map"]')?.click()`)
  await wait(1500)
  await ev(`document.querySelector('button[aria-label="Open the 3D clay model"]')?.click()`)
  let off = null
  for (let i = 0; i < 60; i += 1) {
    await wait(1000)
    off = JSON.parse(await ev(`JSON.stringify((() => { const c = window.__clay; return c ? { loaded: c.widget.scene.globe.tilesLoaded, online: navigator.onLine } : null })())`))
    if (off?.loaded) break
  }
  const offlineGround = await ev(`window.__clay.groundAt({ lat: 38.364236, lon: -75.605912 })`)
  const flatNote = await ev(`!!document.querySelector('.clay__legend')?.textContent.includes('drawn flat')`)
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  console.log(`  offline (navigator.onLine ${off?.online}): globe ${off?.loaded ? 'loaded' : 'NOT loaded'}, ground at the venue ${typeof offlineGround === 'number' ? offlineGround.toFixed(1) + ' m' : String(offlineGround)}${flatNote ? ', some distant ground drawn flat (said on screen)' : ''}`)
  if (off?.online !== false) fail('could not take the page offline, so offline was not tested')
  else if (!off?.loaded) fail('with no signal the 3D globe never finished loading')
  if (typeof onlineGround !== 'number' || typeof offlineGround !== 'number') fail('no ground height to compare at the venue')
  else if (Math.abs(onlineGround - offlineGround) > 0.5) fail(`offline the venue's ground is ${offlineGround.toFixed(1)} m against ${onlineGround.toFixed(1)} m online: the saved elevation was not used`)

  console.log('  hosts contacted while online:')
  for (const [host, n] of [...seen].sort()) {
    const ok = ALLOWED.has(host)
    console.log(`    ${ok ? 'ok ' : 'BAD'} ${host}  ${n}`)
    if (!ok) fail(`the 3D view contacted ${host}, which is not one of the app's hosts`)
  }
} catch (error) {
  fail(`could not run: ${error instanceof Error ? error.message : String(error)}`)
} finally {
  watchdog.stop()
  await dispose()
}

console.log(`\n=== 3D NETWORK PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
