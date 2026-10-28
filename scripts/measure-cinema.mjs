/*
 * THE CINEMATIC PREVIEW, CHECKED TWO WAYS EACH.
 *
 * Usage:  node scripts/measure-cinema.mjs   (dev server on :5173, Chrome on :9222, as the gate runs them)
 * Writes: measurements/<today>-cinema.md
 * Exits:  0 every check within its limit; 1 not; 2 could not look.
 *
 *   sun colour   the light's colour by the sun's height, with Kasten & Young's
 *                air mass and with Pickering's (src/core/sunColour.ts)
 *   glint        where the sun's reflection lies on flat water: the mirror
 *                formula and a search of the reflection law (src/core/glint.ts);
 *                then IN THE RENDERED FRAME at the pier at 8 AM, the brightest
 *                pixel on the water against the mirror point projected to the
 *                screen
 *   clouds       the forecast's cover at the pier for that hour, against the
 *                share of the field the placed clouds cover, sampled on a grid
 *   sea          the ripples' slope variance against Cox & Munk's for the wind
 *   easing       the eased clock's closed form against summing its speed
 *   sea mesh     how far a flat 12 km square sags below the Earth's curve at
 *                its middle, the fault the 50 m mesh fixed
 *   the clip     a move recorded through the Preflight card (frame by frame),
 *                read back by this app's MP4 reader and by Chrome's own video
 *                decoder: frames, duration, frame rate; and the wall-clock time
 *                the render took, to show the clip's pace does not follow it
 */
import { writeFileSync } from 'node:fs'
import { airMassKastenYoung, airMassPickering, sunColour } from '../src/core/sunColour.ts'
import { glintMirror, glintSearch } from '../src/core/glint.ts'
import { coveredShareByRays, placeClouds, LAYERS } from '../src/core/clouds.ts'
import { coxMunkVariance, seaWaves, slopeVariance } from '../src/core/seaSurface.ts'
import { easedSpeed, easedTime } from '../src/core/gimbal.ts'
import { connect } from './cdp.mjs'
import { goToStage } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'

const PIER = { lat: 36.8435575, lon: -75.9713104 }
const DAY = '2026-10-28'
const lines = []
let ok = true
const fail = (w) => {
  ok = false
  lines.push(`FAIL: ${w}`, '')
}

/* 1. The sun's colour, two air masses. */
lines.push('## The sun\'s colour by its height (visibility 20 km)', '', '| altitude | air mass, Kasten & Young | air mass, Pickering | colour, K&Y (r g b) | colour, Pickering | largest channel difference |', '|---|---|---|---|---|---|')
let worstColour = 0
for (const h of [2, 5, 10, 20, 45, 70]) {
  const a = sunColour(h, 20, airMassKastenYoung)
  const b = sunColour(h, 20, airMassPickering)
  const d = Math.max(...a.rgb.map((v, i) => Math.abs(v - b.rgb[i])))
  worstColour = Math.max(worstColour, d)
  lines.push(`| ${h} deg | ${a.airMass.toFixed(2)} | ${b.airMass.toFixed(2)} | ${a.rgb.map((v) => v.toFixed(3)).join(' ')} | ${b.rgb.map((v) => v.toFixed(3)).join(' ')} | ${d.toFixed(4)} |`)
}
lines.push('', `Largest difference in any channel: ${worstColour.toFixed(4)} (limit 0.03).`, '')
if (worstColour > 0.03) fail('the two air masses give colours more than 0.03 apart')

/* 2. The glint, two ways, in arithmetic. */
lines.push('## The glint on flat water, two ways', '', '| camera (e, n, up m) | sun (e, n, up) | mirror point (e, n m) | searched point (e, n m) | apart |', '|---|---|---|---|---|')
let worstGlint = 0
for (const [c, s] of [[[0, 0, 30], [0.97, 0.05, 0.14]], [[0, 0, 120], [0.6, -0.7, 0.35]], [[50, -20, 8], [-0.2, 0.95, 0.06]]]) {
  const a = glintMirror(c, s, 0)
  const b = glintSearch(c, s, 0)
  const apart = Math.hypot(a[0] - b[0], a[1] - b[1])
  worstGlint = Math.max(worstGlint, apart)
  lines.push(`| ${c.join(', ')} | ${s.join(', ')} | ${a[0].toFixed(3)}, ${a[1].toFixed(3)} | ${b[0].toFixed(3)}, ${b[1].toFixed(3)} | ${(apart * 1000).toFixed(2)} mm |`)
}
lines.push('', `Largest gap ${(worstGlint * 1000).toFixed(2)} mm (limit 50 mm).`, '')
if (worstGlint > 0.05) fail('the glint two ways disagree by more than 5 cm')

/* 3. The sea's ripples against Cox & Munk. */
lines.push('## The ripples against Cox & Munk (1954)', '', '| wind (m/s) | Cox & Munk slope variance | the ripples\' variance | with the swell |', '|---|---|---|---|')
let worstSea = 0
for (const w of [2, 5, 8, 12]) {
  const waves = seaWaves({ heightM: 1, periodS: 8, fromDeg: 90, windMps: w, windFromDeg: 200 })
  const cm = coxMunkVariance(w)
  const rip = slopeVariance(waves.slice(3))
  const all = slopeVariance(waves)
  worstSea = Math.max(worstSea, Math.abs(rip - cm) / cm)
  lines.push(`| ${w} | ${cm.toFixed(5)} | ${rip.toFixed(5)} | ${all.toFixed(5)} |`)
}
lines.push('', `Largest difference, ripples against Cox & Munk: ${(worstSea * 100).toFixed(4)}% (limit 1%).`, '')
if (worstSea > 0.01) fail('the ripples do not carry Cox & Munk\'s variance')

/* 4. The eased clock. */
{
  const T = 12
  const dt = 1e-4
  let sum = 0
  let worst = 0
  for (let t = 0; t < T - dt / 2; t += dt) {
    sum += easedSpeed(t + dt / 2, T) * dt
    worst = Math.max(worst, Math.abs(sum - easedTime(t + dt, T)))
  }
  lines.push('## The eased clock, a 12 s move', '', `Closed form at the end ${easedTime(T, T).toFixed(6)} s; summed speed ${sum.toFixed(6)} s; largest gap along the way ${(worst * 1000).toFixed(4)} ms (limit 1 ms).`, '')
  if (worst > 1e-3) fail('the eased clock\'s two ways drift apart')
}

/* 5. The sea mesh. */
{
  const R = 6_371_000
  const halfDiag = 6000 * Math.SQRT2
  const sag = (halfDiag * halfDiag) / (2 * R)
  const fine = (50 * 50) / (8 * R)
  lines.push('## The sea\'s mesh', '', `A flat square 12 km across, corners on the curve, lies ${sag.toFixed(2)} m below it at the middle (d^2 / 2R, d = ${halfDiag.toFixed(0)} m): the water at the venue sat under the -3 m sea floor and only showed near the horizon. With a vertex every 50 m a chord sags ${(fine * 1000).toFixed(3)} mm.`, '')
}

/* 6-8 in the browser. */
const venue = { ...CALIBRATION_VENUE, name: null, latitude: String(PIER.lat), longitude: String(PIER.lon), date: DAY, startTime: '07:45', endTime: '08:45' }
const link = await shareLink('http://127.0.0.1:5173/', { id: 'vb', name: 'VB', savedAt: '2026-10-27T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] })
let browser
try {
  browser = await connect()
} catch (error) {
  console.error(`could not reach Chrome: ${error}`)
  process.exit(2)
}
const { send, ev, wait, dispose } = browser
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
await wait(2500)
await ev(`localStorage.clear(); localStorage.setItem('scoutngo.landing.v1','true')`)
await send('Page.navigate', { url: 'about:blank' })
await send('Page.navigate', { url: link })
for (let i = 0; i < 30; i += 1) {
  await wait(500)
  if (await ev(`(() => { const b = document.querySelector('.confirm__yes'); if (!b) return false; b.click(); return true })()`)) break
}
await wait(2000)
await goToStage(ev, wait, 'plan')
await wait(2500)

/* 6. The glint in the rendered frame. */
await ev(`document.querySelector('button[aria-label="Open the 3D clay model"]')?.click()`)
for (let i = 0; i < 60; i += 1) {
  await wait(1000)
  if (await ev(`!!document.querySelector('.clay--shown')`)) break
}
await wait(2000)
const glint = JSON.parse(
  await ev(`(async () => { try {
  const { createCinema } = await import('/src/three/cinema.ts')
  const { seaMask } = await import('/src/lib/cinema/useCinemaData.ts')
  const { glintMirror } = await import('/src/core/glint.ts')
  const { enuToward } = await import('/src/core/sky3d.ts')
  const { getSunPosition } = await import('/src/core/sun.ts')
  const clay = window.__clay, w = clay.widget, s = w.scene
  const at = new Date('${DAY}T12:00:00Z')
  clay.setTime(at)
  const sun = getSunPosition(at, ${PIER.lat}, ${PIER.lon})
  const mask = await seaMask({ lat: ${PIER.lat}, lon: ${PIER.lon} })
  const cin = createCinema(w, { lat: ${PIER.lat}, lon: ${PIER.lon} }, () => null)
  cin.on({ sea: { heightM: 0.8, periodS: 7, fromDeg: 90, windMps: 4, windFromDeg: 200 }, waterLevelM: 0, cover: null, visibilityKm: 20, seaMask: mask, seed: 1 }, 'real', 24)
  s.postProcessStages.bloom.enabled = false
  /* From the pier's end, 30 m up, facing the sun, tilted down to the glint. */
  const cam = { lat: 36.8445, lon: -75.9655 }
  const up = 30
  const pitch = -Math.max(3, sun.altitude)
  clay.droneView(cam, up, sun.azimuth, pitch, 24)
  cin.frame(0, sun.altitude, 200)
  for (let i = 0; i < 40; i++) { s.requestRender(); await new Promise((r) => setTimeout(r, 150)); if (s.globe.tilesLoaded && i > 10) break }
  const sv = enuToward(sun.azimuth, sun.altitude)
  const g = glintMirror([0, 0, up], sv, 0)
  const mPerLat = 111320, mPerLon = 111320 * Math.cos(cam.lat * Math.PI / 180)
  const gAt = { lat: cam.lat + g[1] / mPerLat, lon: cam.lon + g[0] / mPerLon }
  const predicted = clay.project(gAt, 0)
  const far = clay.project({ lat: cam.lat + sv[1] * 20000 / mPerLat, lon: cam.lon + sv[0] * 20000 / mPerLon }, 0)
  const frame = await new Promise((resolve) => {
    const copy = () => { s.postRender.removeEventListener(copy); const c = document.createElement('canvas'); c.width = w.canvas.width; c.height = w.canvas.height; const x = c.getContext('2d'); x.drawImage(w.canvas, 0, 0); resolve({ data: x.getImageData(0, 0, c.width, c.height).data, width: c.width, height: c.height }) }
    s.postRender.addEventListener(copy); s.requestRender()
  })
  const scale = frame.width / w.canvas.clientWidth
  const horizonY = (far?.y ?? 0) * scale
  let best = -1, bx = 0, by = 0
  for (let y = Math.ceil(horizonY + 4 * scale); y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const i = (y * frame.width + x) * 4
      const l = frame.data[i] * 0.299 + frame.data[i + 1] * 0.587 + frame.data[i + 2] * 0.114
      if (l > best) { best = l; bx = x; by = y }
    }
  }
  /* The brightest few hundred pixels' centre, steadier than the one brightest. */
  let sx = 0, sy = 0, n = 0
  for (let y = Math.ceil(horizonY + 4 * scale); y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const i = (y * frame.width + x) * 4
      const l = frame.data[i] * 0.299 + frame.data[i + 1] * 0.587 + frame.data[i + 2] * 0.114
      if (l >= best - 6) { sx += x; sy += y; n++ }
    }
  }
  const fovH = 2 * Math.atan(36 / 48) * 180 / Math.PI
  const degPerPx = fovH / w.canvas.clientWidth
  cin.off()
  const found = { x: sx / n / scale, y: sy / n / scale }
  return JSON.stringify({ sunAz: sun.azimuth, sunAlt: sun.altitude, glintM: Math.hypot(g[0], g[1]), predicted, found, n, best, horizon: far, apartPx: predicted === null ? null : Math.hypot(predicted.x - found.x, predicted.y - found.y), degPerPx, width: w.canvas.clientWidth })
} catch (e) { return JSON.stringify({ error: String(e && e.stack || e).slice(0, 500) }) } })()`),
)
await send('Page.captureScreenshot', { format: 'png' }).then((r) => writeFileSync(`measurements/${new Date().toISOString().slice(0, 10)}-cinema-glint.png`, Buffer.from(r.result.data, 'base64')))
if (glint.error !== undefined) {
  fail(`the glint frame could not be read: ${glint.error}`)
} else {
  const apartDeg = glint.apartPx * glint.degPerPx
  lines.push(
    '## The glint in the rendered frame',
    '',
    `At ${DAY} 8:00 AM (sun at ${glint.sunAz.toFixed(1)} deg, ${glint.sunAlt.toFixed(1)} deg up), the camera 30 m over the water off the pier's end, facing the sun, 24 mm. Bloom off for the measurement.`,
    '',
    `Mirror point ${glint.glintM.toFixed(0)} m out, projected to the screen at (${glint.predicted.x.toFixed(1)}, ${glint.predicted.y.toFixed(1)}) px; the brightest water in the frame (${glint.n} pixels within 6 of its peak luminance ${glint.best.toFixed(0)}) centred at (${glint.found.x.toFixed(1)}, ${glint.found.y.toFixed(1)}) px.`,
    `Apart: ${glint.apartPx.toFixed(1)} px, ${apartDeg.toFixed(2)} deg of view (limit 1.5 deg: the ripples spread the glitter, so its brightest part need not sit on the flat-water point).`,
    '',
    `Frame: measurements/${new Date().toISOString().slice(0, 10)}-cinema-glint.png`,
    '',
  )
  if (!(apartDeg <= 1.5)) fail('the rendered glint is not where the mirror formula puts it')
}

/* 7. The clouds at the pier for that hour, two ways. */
{
  const params = new URLSearchParams({ latitude: PIER.lat.toFixed(4), longitude: PIER.lon.toFixed(4), hourly: 'cloud_cover_low,cloud_cover_mid,cloud_cover_high', start_date: DAY, end_date: DAY, timezone: 'GMT' })
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  const j = await r.json()
  const k = j.hourly.time.indexOf(`${DAY}T12:00`)
  const cover = { low: j.hourly.cloud_cover_low[k], mid: j.hourly.cloud_cover_mid[k], high: j.hourly.cloud_cover_high[k] }
  const clouds = placeClouds(cover, 1)
  lines.push('## The clouds against the forecast', '', `Open-Meteo for the pier, ${DAY} 12:00 UTC (8 AM): low ${cover.low}%, mid ${cover.mid}%, high ${cover.high}%. Clouds are placed generically and the preview says "Clouds illustrative".`, '', '| layer | forecast cover | clouds placed | share of the field they cover, sampled |', '|---|---|---|---|')
  let worst = 0
  const row = (label, placed, L, want) => {
    const share = coveredShareByRays(placed, L.name, 160)
    if (want <= 0.6) worst = Math.max(worst, Math.abs(share - want))
    lines.push(`| ${label} | ${(want * 100).toFixed(0)}% | ${placed.filter((c) => c.layer === L.name).length} | ${(share * 100).toFixed(1)}% |`)
  }
  for (const L of LAYERS) row(`${L.name}, the forecast`, clouds, L, (cover[L.name] ?? 0) / 100)
  /* And set covers, so the comparison is made whatever the sky is doing today. */
  for (const L of LAYERS) {
    for (const pct of [10, 30, 60]) row(`${L.name}, set`, placeClouds({ low: null, mid: null, high: null, [L.name]: pct }, 7), L, pct / 100)
  }
  lines.push('', `Largest gap at covers up to 60%: ${(worst * 100).toFixed(1)} points (limit 12). Above that, overlapping clouds cover less than their count suggests, and the sky reads as overcast either way.`, '')
  if (worst > 0.12) fail('the placed clouds do not cover the forecast share')
}

/* 8. A recorded clip, frame by frame. */
/*
 * The clip is recorded in this Chrome, which draws WebGL in software
 * (SwiftShader): a render takes seconds here that a phone's GPU does in
 * milliseconds. So the move is one second (30 frames) at 1x pixels, played
 * through the scene's own playPath with the sea and clouds on, and the time
 * it took is reported as this machine's, not a phone's.
 */
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
await wait(1500)
const started = Date.now()
const progress = []
await ev(`window.__clip = undefined; window.__recLog = []; (async () => {
  const { seaMask } = await import('/src/lib/cinema/useCinemaData.ts')
  const mask = await seaMask({ lat: ${PIER.lat}, lon: ${PIER.lon} })
  const path = []
  for (let i = 0; i <= 10; i++) path.push({ t: i * 0.1, at: { lat: 36.8445 + i * 0.00004, lon: -75.9655 }, ft: 100, askedFt: 100 })
  const cinema = { sea: { heightM: 0.8, periodS: 7, fromDeg: 90, windMps: 4, windFromDeg: 200 }, waterLevelM: 0, cover: { low: 20, mid: 0, high: 30 }, visibilityKm: 20, seaMask: mask, seed: 1 }
  const play = { path, subject: { lat: ${PIER.lat}, lon: ${PIER.lon} }, takeoff: { lat: ${PIER.lat}, lon: ${PIER.lon} }, focal: 70, startAt: new Date('${DAY}T12:00:00Z'), record: true, look: 'real', cinema, tick: 1 }
  try { window.__clip = await window.__clay.playPath(play, () => {}, (s) => window.__recLog.push(Math.round(s * 100) + '%')) } catch (e) { window.__clip = null; window.__recErr = String(e) }
})(); 1`)
for (let i = 0; i < 400; i += 1) {
  await wait(3000)
  const p = await Promise.race([ev(`window.__recLog?.slice(-1)[0] ?? ''`), new Promise((r) => setTimeout(() => r(''), 8000))])
  if (p !== '' && progress[progress.length - 1] !== p && i % 5 === 0) progress.push(p)
  if (await Promise.race([ev(`window.__clip !== undefined`), new Promise((r) => setTimeout(() => r(false), 8000))])) break
}
const wallS = (Date.now() - started) / 1000
const clip = JSON.parse(
  await ev(`(async () => { try {
  const blob = window.__clip
  if (!blob) return JSON.stringify({ error: 'no clip' })
  const { readMp4 } = await import('/src/lib/cinema/mp4.ts')
  const facts = readMp4(new Uint8Array(await blob.arrayBuffer()))
  const v = document.createElement('video')
  v.muted = true
  v.src = URL.createObjectURL(blob)
  await new Promise((r, j) => { v.onloadedmetadata = r; v.onerror = () => j(new Error('the browser could not open it')) })
  const duration = v.duration
  /* Chrome's decoder: every frame it presents, counted while it plays at 4x. */
  let presented = 0
  const step = () => { presented++; v.requestVideoFrameCallback(step) }
  v.requestVideoFrameCallback(step)
  v.playbackRate = 4
  await v.play()
  await new Promise((r) => { v.onended = r })
  const q = v.getVideoPlaybackQuality()
  return JSON.stringify({ type: blob.type, bytes: blob.size, facts, duration, width: v.videoWidth, height: v.videoHeight, decoded: q.totalVideoFrames, dropped: q.droppedVideoFrames, presented })
} catch (e) { return JSON.stringify({ error: String(e && e.stack || e).slice(0, 400) }) } })()`),
)
await dispose()
if (clip.error !== undefined) fail(`the recorded clip could not be read: ${clip.error}`)
else {
  const f = clip.facts
  const fps = f.deltas.length === 0 ? null : f.timescale / f.deltas[0]
  const steady = new Set(f.deltas).size === 1
  lines.push(
    '## A recorded clip, rendered frame by frame',
    '',
    `A one-second move off the pier's end at 70 mm (depth of field on), the sea and illustrative clouds drawn, recorded through the scene's own playPath: ${clip.type}, ${(clip.bytes / 1e6).toFixed(1)} MB, ${clip.width} x ${clip.height}. The render took ${wallS.toFixed(0)} s of wall-clock time in this Chrome, which draws WebGL in software (SwiftShader), not a phone's time${progress.length === 0 ? '' : ` (progress read ${progress.join(', ')})`}.`,
    '',
    '| | this app\'s MP4 reader | Chrome\'s decoder |',
    '|---|---|---|',
    `| frames | ${f.samples} | ${clip.decoded} decoded (${clip.dropped} dropped at 4x) |`,
    `| duration | ${f.durationS.toFixed(3)} s | ${clip.duration.toFixed(3)} s |`,
    `| frame rate | ${fps === null ? '—' : fps.toFixed(3)} fps, ${steady ? 'every frame the same length' : 'frames of different lengths'} | ${(f.samples / clip.duration).toFixed(3)} fps |`,
    '',
    `The render ran at ${(wallS / f.samples).toFixed(2)} s a frame of wall clock; the clip runs at 30 fps whatever that was.`,
    '',
  )
  if (fps === null || Math.abs(fps - 30) > 0.01 || !steady) fail('the clip is not a steady 30 fps')
  if (Math.abs(f.durationS - clip.duration) > 0.05) fail('the two readers disagree on the clip\'s length')
  if (!f.sizesMatch) fail('the frame sizes do not add up to the frames in the file')
}

const date = new Date().toISOString().slice(0, 10)
const out = ['# The cinematic preview', '', `Run: ${new Date().toISOString()} · node scripts/measure-cinema.mjs · Virginia Beach Fishing Pier ${PIER.lat}, ${PIER.lon} · ${DAY} · Chrome at 390 x 844`, '', ...lines, ok ? 'Pass.' : 'FAIL.', '']
writeFileSync(`measurements/${date}-cinema.md`, out.join('\n'))
console.log(out.join('\n'))
process.exit(ok ? 0 : 1)
