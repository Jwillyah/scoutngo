/*
 * THE 3D VIEW TALKS ONLY TO THE HOSTS THE APP ALREADY USES.
 *
 * Usage:  node scripts/audit-3d-network.mjs   (inside the gate: bash scripts/gate/browser-gate.sh "3d network")
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
 * THEN THE 3D SCAN: its host is allowed only after the Download tap.
 *
 * IT MUST HAVE LOOKED (docs/failure-modes.md, B). Tiles can come from the
 * phone's own cache with no network at all, so "no bad requests" proves
 * nothing by itself: the model must report that it drew imagery and
 * elevation tiles, and the globe must say it finished loading.
 */
import { connect } from './cdp.mjs'
import { getSunPosition } from '../src/core/sun.ts'
import { goToStage, guardAudit, setSheet, startWatchdog, APP_ORIGIN } from './preflight.mjs'

guardAudit('3d network')
const watchdog = startWatchdog('3d network', 240_000)
const ALLOWED = new Set([
  new URL(APP_ORIGIN).host,
  'server.arcgisonline.com',
  /* The free aerial imagery the 3D view picks from, one per region (src/data/imagerySources.ts). */
  'vginmaps.vdem.virginia.gov',
  'services.nconemap.gov',
  'mdgeodata.md.gov',
  'enterprise.firstmap.delaware.gov',
  'tiles.arcgis.com',
  'imagery.nationalmap.gov',
  /* The sea offshore moves with the swell and wind of the forecast (src/lib/cinema/useCinemaData.ts), as in the preview. */
  'api.open-meteo.com',
  'marine-api.open-meteo.com',
  /* The water height offshore: the tide station datums (src/lib/waterline/datums.ts). */
  'api.tidesandcurrents.noaa.gov',
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
  await send('Page.navigate', { url: `${APP_ORIGIN}/` })
  await wait(2500)
  await ev(`localStorage.setItem('scoutngo.landing.v1', 'true')`)
  await send('Page.navigate', { url: `${APP_ORIGIN}/?calibration=1` })
  await wait(8000)
  await goToStage(ev, wait, 'plan')
  await wait(1500)

  armed = true
  const pressed = await ev(`(() => { const b = document.querySelector('button[aria-label="Open the 3D clay model"]'); if (!b) return 'no 3D button in the rail'; b.click(); return 'pressed' })()`)
  if (pressed !== 'pressed') throw new Error(pressed)

  let state = null
  for (let i = 0; i < 60; i += 1) {
    await wait(1000)
    state = await ev(`JSON.stringify((() => { const c = window.__clay; if (!c) return { ready: false }; return { ready: true, loaded: c.loaded(), ...c.counts } })())`)
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
   * THE SKY ON SCREEN AT THREE SUN HEIGHTS (Batch D, Section 1: black at 8 AM
   * with the sun up, 1 Nov). The camera looks 40° up toward the north; the
   * frame is read back from a copy of the drawn canvas and its middle
   * averaged. Day blue at 30°, lit at 2°, a dark blue twilight at -6°.
   */
  const VENUE = { lat: 38.364236, lon: -75.605912 }
  const whenAt = (alt, morning) => {
    let best = null
    for (let m = 0; m < 24 * 60; m += 1) {
      const t = new Date(Date.UTC(2026, 9, 30, 0, 0) + m * 60_000)
      const p = getSunPosition(t, VENUE.lat, VENUE.lon)
      if (morning !== p.azimuth < 180) continue
      if (best === null || Math.abs(p.altitude - alt) < Math.abs(best.p.altitude - alt)) best = { t, p }
    }
    return best.t
  }
  for (const [alt, want] of [[30, 'day'], [2, 'low'], [-6, 'twilight']]) {
    const t = whenAt(alt, true)
    const px = JSON.parse(await ev(`(async () => {
      const c = window.__clay
      c.setTime(new Date('${t.toISOString()}'))
      const g = (await c.groundAt(${JSON.stringify(VENUE)})) ?? 0
      c.droneView(${JSON.stringify(VENUE)}, g + 60, 0, 40, 24)
      await new Promise((r) => setTimeout(r, 400))
      const shot = await c.snapshot()
      const d = shot.getContext('2d').getImageData(Math.floor(shot.width * 0.3), Math.floor(shot.height * 0.1), Math.floor(shot.width * 0.4), Math.floor(shot.height * 0.15)).data
      let r = 0, gg = 0, b = 0
      for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2] }
      const n = d.length / 4
      return JSON.stringify({ r: r / n, g: gg / n, b: b / n })
    })()`))
    const lum = 0.2126 * px.r + 0.7152 * px.g + 0.0722 * px.b
    console.log(`  sky at ${alt}° (${t.toISOString().slice(11, 16)} UTC): rgb ${Math.round(px.r)} ${Math.round(px.g)} ${Math.round(px.b)}, luminance ${Math.round(lum)}`)
    if (want === 'day' && !(lum > 110 && px.b > px.r)) fail(`at ${alt}° the sky is not a blue day sky (luminance ${Math.round(lum)})`)
    if (want === 'low' && !(lum > 60)) fail(`at ${alt}° the sky is dark (luminance ${Math.round(lum)}): never black with the sun up`)
    if (want === 'twilight' && !(lum > 3 && lum < 90 && px.b >= px.r)) fail(`at ${alt}° the sky is not a dark blue twilight (rgb ${Math.round(px.r)} ${Math.round(px.g)} ${Math.round(px.b)})`)
  }
  /*
   * THE CLOUDS ARE IN THE WORLD (Batch D, Section 5): looking up at the
   * forecast's cloud, turning the camera moves them across the frame. A
   * picture stuck to the screen would not move.
   */
  const skyStrip = (yaw) => ev(`(async () => {
    const c = window.__clay
    c.setTime(new Date('${whenAt(30, true).toISOString()}'))
    const g = (await c.groundAt(${JSON.stringify(VENUE)})) ?? 0
    c.droneView(${JSON.stringify(VENUE)}, g + 60, ${yaw}, 25, 24)
    await new Promise((r) => setTimeout(r, 500))
    const shot = await c.snapshot()
    window.__lastSky = shot.toDataURL('image/png')
    return Array.from(shot.getContext('2d').getImageData(0, Math.floor(shot.height * 0.45), shot.width, 1).data)
  })()`)
  /* The calibration venue's day is past the forecast's week: the cover is given (40·20·10, the fixture's). */
  await ev(`window.__clay.setSea({ sea: { heightM: null, periodS: null, fromDeg: null, windMps: 4, windFromDeg: 200 }, waterLevelM: null, cover: { low: 40, mid: 20, high: 10 }, visibilityKm: 20, seaMask: null, seed: 1 })`)
  const drawnClouds = await ev(`window.__clayDebug().names`)
  const cloudMeshes = Object.keys(drawnClouds).filter((k) => k.startsWith('cloud')).length
  const a = await skyStrip(0)
  const b = await skyStrip(25)
  if (process.env.SCOUTNGO_OUT) (await import('node:fs')).writeFileSync(`${process.env.SCOUTNGO_OUT}/clouds-25.png`, Buffer.from((await ev('window.__lastSky')).split(',')[1], 'base64'))
  let moved = 0
  for (let i = 0; i < a.length; i += 4) moved += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
  moved /= a.length / 4
  console.log(`  clouds: ${cloudMeshes} cloud layers in the scene; turning 25° changes the sky row by ${moved.toFixed(1)} a pixel`)
  if (cloudMeshes === 0) fail('no clouds in the scene under the forecast cover')
  else if (!Number.isFinite(moved) || !Array.isArray(a) || a.length === 0) fail(`could not read the sky to see the clouds move (${JSON.stringify(a).slice(0, 80)})`)
  else if (moved < 4) fail(`the clouds did not move when the camera turned (${moved.toFixed(1)}): stuck to the screen`)
  await ev(`window.__clay.orbit()`)

  /*
   * THE OVERLAYS (Batch E, 1 Nov): no engine "Data attribution" over the map
   * (the credits are in the i); the status a short line, "N buildings · M no
   * height"; and with a sheet up, the line and the arcs' hour pills put away.
   */
  const over = JSON.parse(await ev(`JSON.stringify({
    attribution: /Data attribution/.test(document.body.innerText),
    line: document.querySelector('.clay__line--one')?.textContent ?? null,
    sky: window.__skyShown ?? null,
  })`))
  console.log(`### the overlays: ${JSON.stringify(over)}`)
  if (over.attribution) fail('"Data attribution" is on the 3D view; the credits belong in its i')
  if (over.line !== null && !/^\d+ buildings( · \d+ no height)?$/.test(over.line)) fail(`the 3D status is not one short line: "${over.line}"`)
  if (over.sky !== true) fail(`the sun and moon arcs are not shown with the sheet down (${over.sky})`)
  await setSheet(ev, wait, 'half').catch(() => {})
  await wait(800)
  const up = JSON.parse(await ev(`JSON.stringify({ line: document.querySelector('.clay__line--one')?.textContent ?? null, sky: window.__skyShown ?? null })`))
  console.log(`  with a sheet up: ${JSON.stringify(up)}`)
  if (up.line !== null) fail('with a sheet up the 3D status line is still drawn over the map')
  if (up.sky !== false) fail('with a sheet up the arcs and their hour pills are still drawn')
  await setSheet(ev, wait, 'peek').catch(() => {})
  await wait(600)

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
    off = JSON.parse(await ev(`JSON.stringify((() => { const c = window.__clay; return c ? { loaded: c.loaded(), online: navigator.onLine } : null })())`))
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

  /*
   * THE 3D SCAN IS OPT-IN: its host (the USGS lidar bucket) is in no list
   * above, so contacting it before the tap already failed. After the tap it
   * must appear, and nothing else new may (src/lib/lidar/, src/lib/hosts.ts).
   */
  console.log('### the 3D scan, after the tap')
  await ev(`document.querySelector('button[aria-label="Back to the 2D map"]') ? 1 : document.querySelector('button[aria-label="Open the 3D clay model"]')?.click()`)
  for (let i = 0; i < 30; i += 1) {
    await wait(1000)
    if (await ev(`!!document.querySelector('.clay__i')`)) break
  }
  await ev(`document.querySelector('.clay__info') ? 1 : document.querySelector('.clay__i')?.click()`)
  await wait(800)
  const offered = await ev(`[...document.querySelectorAll('.clay__info button')].find((b) => b.textContent.startsWith('Download 3D scan'))?.textContent ?? null`)
  console.log(`  offered: ${offered ?? 'nothing'}`)
  if (offered === null) fail('no 3D scan offered at Brew River, which USGS covers')
  else {
    seen.clear()
    armed = true
    await ev(`[...document.querySelectorAll('.clay__info button')].find((b) => b.textContent.startsWith('Download 3D scan'))?.click()`)
    await wait(12000)
    armed = false
    const LIDAR = 's3-us-west-2.amazonaws.com'
    for (const [host, n] of [...seen].sort()) {
      const ok = ALLOWED.has(host) || host === LIDAR
      console.log(`    ${ok ? 'ok ' : 'BAD'} ${host}  ${n}`)
      if (!ok) fail(`after the tap the 3D view contacted ${host}`)
    }
    if (!seen.has(LIDAR)) fail('the tap asked nothing of the USGS lidar bucket')
    /* Leave nothing behind for the next audit. */
    await send('Page.navigate', { url: `${APP_ORIGIN}/` })
    await wait(1500)
    await ev(`indexedDB.deleteDatabase('scoutngo-lidar'), 1`)
  }
} catch (error) {
  fail(`could not run: ${error instanceof Error ? error.message : String(error)}`)
} finally {
  watchdog.stop()
  await dispose()
}

console.log(`\n=== 3D NETWORK PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
