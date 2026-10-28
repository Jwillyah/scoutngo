/*
 * THE 3D VIEW'S GROUND AND SEA, AT SIX PLACES: WHICH IMAGERY WINS, WHAT IT
 * ASKED FOR, AND WHAT IT LOOKS LIKE.
 *
 * Usage:  node scripts/measure-3d-look.mjs [label]   (app on :5173, Chrome on :9222)
 * Writes: measurements/<today>-3d-look[-label].md, and a screenshot per place
 *         to $SCOUTNGO_OUT (or the scratch folder given) when set
 * Exits:  0 every place drew from its source and asked one zoom near the view; 1 not; 2 could not look.
 *
 * At each place: opens it by a share link, opens 3D, waits for the globe,
 * and records every imagery request: the host, and the zoom (from {z} in a
 * tile address, or from the box's width for a drawn-on-request one). Near
 * the view (NEAR_M, src/three/clayScene.ts) one zoom is asked; the source
 * the app picks (src/data/imagerySources.ts pickImagery) must be the one
 * asked. Whether the sea is drawn: the plain view's water primitive.
 */
import { writeFileSync } from 'node:fs'
import { connect } from './cdp.mjs'
import { guardAudit } from './preflight.mjs'
import { openShared } from './openShared.mjs'
import { pickImagery } from '../src/data/imagerySources.ts'

guardAudit('3d look')
const label = process.argv[2] ?? ''
const OUT = process.env.SCOUTNGO_OUT ?? null
const ALL = [
  { key: 'pier', name: 'Virginia Beach Fishing Pier', lat: 36.8435575, lon: -75.9713104 },
  { key: 'ocmd', name: 'Ocean City Pier, Ocean City MD', lat: 38.3292, lon: -75.0848 },
  { key: 'obx', name: 'Jennette’s Pier, Nags Head NC', lat: 35.9095, lon: -75.5953 },
  { key: 'inland', name: 'Harpers Ferry WV, inland', lat: 39.3254, lon: -77.7286 },
  { key: 'rehoboth', name: 'Rehoboth Beach DE', lat: 38.7167, lon: -75.0763 },
  { key: 'myrtle', name: 'Myrtle Beach SC', lat: 33.6891, lon: -78.8867 },
]
const only = (process.env.PLACES ?? '').split(',').filter(Boolean)
const PLACES = only.length === 0 ? ALL : ALL.filter((p) => only.includes(p.key))
const IMAGERY_HOSTS = ['server.arcgisonline.com', 'vginmaps.vdem.virginia.gov', 'services.nconemap.gov', 'mdgeodata.md.gov', 'enterprise.firstmap.delaware.gov', 'tiles.arcgis.com', 'imagery.nationalmap.gov']

const zoomOf = (url) => {
  const t = /\/tile\/(\d+)\/\d+\/\d+/.exec(url)
  if (t !== null) return Number(t[1])
  const b = /bbox=(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),/.exec(url)
  if (b !== null) return Math.round(Math.log2((2 * 20037508.342789244) / (Number(b[3]) - Number(b[1]))))
  return null
}

const c = await connect()
const { send, ev, wait, dispose, onEvent } = c
const rows = []
let ok = true
let current = null
onEvent('Network.requestWillBeSent', (p) => {
  if (current === null) return
  let host
  try {
    host = new URL(p.request.url).host
  } catch {
    return
  }
  if (!IMAGERY_HOSTS.includes(host)) return
  const z = zoomOf(p.request.url)
  const k = `${host} z${z}`
  current.set(k, (current.get(k) ?? 0) + 1)
})
try {
  await send('Network.enable', {})
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  for (const place of PLACES) {
    await openShared(c, { ...place, date: '2026-10-27', start: '15:00', end: '16:30' })
    current = new Map()
    const t0 = Date.now()
    await ev(`document.querySelector('button[aria-label="Open the 3D clay model"]')?.click()`)
    let state = null
    for (let i = 0; i < 150; i += 1) {
      await wait(1000)
      state = JSON.parse(await ev(`JSON.stringify((() => { const c = window.__clay; if (!c) return { ready: false }; const s = c.widget.scene; return { ready: true, loaded: s.globe.tilesLoaded, imagery: c.counts.imagery, sea: s.primitives._primitives.some((p) => p.appearance?.material?.type === 'ScoutSea' && p.show) } })())`))
      if (state.ready && state.loaded && state.imagery > 0 && (i > 20 || state.sea)) break
    }
    await wait(4000)
    const secs = Math.round((Date.now() - t0) / 1000)
    const want = pickImagery(place)
    const asked = [...current].sort()
    const fromSource = want === null ? 0 : asked.filter(([k]) => k.startsWith(want.host)).reduce((n, [, v]) => n + v, 0)
    const nearZooms = new Set(asked.filter(([k]) => want === null || k.startsWith(want.host)).map(([k]) => k.split(' z')[1]))
    if (OUT !== null) await c.shot(OUT, `3d-${place.key}${label ? '-' + label : ''}`)
    const problems = []
    if (!state?.ready) problems.push('3D never came up')
    if (want !== null && fromSource === 0) problems.push(`nothing asked of ${want.host}`)
    rows.push(
      `## ${place.name}`,
      '',
      `${place.lat}, ${place.lon}. Imagery: ${want === null ? "Esri's World Imagery (no listed source covers it)" : `${want.name}, ${want.year} (${want.host})`}. ${secs} s from the press to settled; globe ${state?.loaded ? 'loaded' : 'still loading'}; the sea ${state?.sea ? 'drawn' : 'NOT drawn'}; ${state?.imagery ?? 0} imagery tiles drawn.`,
      '',
      'Imagery requests, by host and zoom:',
      '',
      ...asked.map(([k, n]) => `- ${k}: ${n}`),
      '',
      `Zooms asked of ${want === null ? 'Esri' : want.host}: ${[...nearZooms].sort().join(', ') || 'none'}.${problems.length > 0 ? ` PROBLEMS: ${problems.join('; ')}.` : ''}`,
      '',
    )
    if (problems.length > 0) ok = false
    current = null
    await ev(`document.querySelector('button[aria-label="Back to the 2D map"]')?.click()`)
    await wait(1500)
  }
} catch (error) {
  console.log(`could not look: ${error instanceof Error ? error.message : String(error)}`)
  await dispose()
  process.exit(2)
}
await dispose()
const date = new Date().toISOString().slice(0, 10)
const out = ['# The 3D view: imagery and sea', '', `Run: ${new Date().toISOString()} · node scripts/measure-3d-look.mjs ${label} · Chrome headless (software WebGL), 390 x 844 at 2x, 27 Oct 2026 15:00 at each place`, '', ...rows, ok ? 'Pass.' : 'FAIL.', '']
writeFileSync(`measurements/${date}-3d-look${label ? '-' + label : ''}.md`, out.join('\n'))
console.log(out.join('\n'))
process.exit(ok ? 0 : 1)
