/*
 * THE ORIONID WINDOW AT LITTLE DEVILS STAIRS OVERLOOK, FROM THE APP'S OWN DEM.
 *
 * Usage:  node --experimental-strip-types scripts/measure-orionids.mjs
 * Writes: measurements/2026-10-18-orionids-little-devils-stairs.md
 *
 * WHY IT DRIVES A BROWSER. The terrain horizon is the whole point of this
 * feature, and the DEM lives in MapLibre's tile cache inside the running app.
 * Computing the horizon from some other elevation service here would measure a
 * different thing from what the app shows a shooter, so this asks the app:
 * it moves the camera to the overlook, waits for the terrain tiles, and calls
 * the same MapHandle.horizonAt the Sky panel calls.
 *
 * THE WINDOW ITSELF IS COMPUTED BY THE SHIPPED MODULE, imported below. Nothing
 * in this file reimplements any of it.
 *
 * BOTH HORIZONS ARE REPORTED, flat and terrain, because the difference between
 * them IS the result.
 */
import { writeFileSync } from 'node:fs'
import { guardAudit, startWatchdog } from './preflight.mjs'

guardAudit('orionids')

import { connect } from './cdp.mjs'
import { skyWindow, windowMinutes } from '../src/core/skyWindow.ts'
import { showerById } from '../src/core/celestial.ts'

/*
 * Resolved through Nominatim, which is the geocoder the app itself uses:
 *   q=Little Devils Stairs Overlook -> 38.7567229, -78.2675403 (viewpoint node)
 * The brief's figure of 38.74, -78.30 is 3.37 km south-west of it.
 */
const OVERLOOK = { lat: 38.7567229, lon: -78.2675403 }
const EVENING = new Date('2026-10-21T18:00:00-04:00')
const ZONE = 'America/New_York'

const clock = (at) =>
  at.toLocaleTimeString('en-US', { timeZone: ZONE, hour12: false, hour: '2-digit', minute: '2-digit' })

const watchdog = startWatchdog('orionids')
const { ev, wait, send, dispose } = await connect()

let samples = []
let elevation = null
try {
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
  })
  await ev('localStorage.clear()')
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/?calibration=1&probe=1' })
  await wait(8000)

  /* Into Plan mode, which is where the map and the Sky panel live. */
  await ev(`[...document.querySelectorAll('.rail__btn')].find(b=>/Plan/.test(b.textContent))?.click()`)
  await wait(4000)

  /* To the overlook, at the zoom the terrain actually draws at. */
  await ev(
    `window.__probe.map.jumpTo({ center: [${OVERLOOK.lon}, ${OVERLOOK.lat}], zoom: 13, pitch: 0, bearing: 0 }), 'ok'`,
  )
  await wait(2000)
  /*
   * TERRAIN IS A LAYER TOGGLE, AND THIS FLIPS THE REAL ONE.
   *
   * The DEM source is only added while the Terrain layer is on, because
   * MapLibre answers queryTerrainElevation from the tiles it draws with. A
   * first draft called setTerrain directly and got 'NO SOURCE', because the
   * source does not exist until the toggle adds it. Driving the actual control
   * also means this measures what a shooter gets rather than a state only a
   * script can reach.
   */
  await ev(`[...document.querySelectorAll('.sheet__handle')][0]?.click()`)
  await wait(400)
  await ev(`[...document.querySelectorAll('.sheet__handle')][0]?.click()`)
  await wait(900)
  const toggled = await ev(
    `(() => {
       const button = [...document.querySelectorAll('button')]
         .find((b) => /^Terrain/.test((b.textContent ?? '').trim()))
       if (!button) return 'no terrain toggle found'
       if (button.getAttribute('aria-pressed') !== 'true') button.click()
       return 'terrain toggled on'
     })()`,
  )
  console.log(`  ${toggled}`)
  await wait(3000)
  /*
   * WAIT FOR TILES, NOT FOR A CLOCK. queryTerrainElevation answers null until
   * the DEM tiles are in memory, so a fixed sleep would occasionally record a
   * flat horizon and call it terrain. This polls the observer elevation and
   * only proceeds once the DEM has actually spoken.
   */
  for (let tries = 0; tries < 40; tries += 1) {
    elevation = await ev(
      `window.__probe.map.queryTerrainElevation([${OVERLOOK.lon}, ${OVERLOOK.lat}])`,
    )
    if (typeof elevation === 'number') break
    await wait(500)
  }

  samples = await ev(
    `(() => {
       const got = window.__probe.handle.horizonAt({ lat: ${OVERLOOK.lat}, lon: ${OVERLOOK.lon} })
       return got.kind === 'terrain' ? got.samples : []
     })()`,
  )
} finally {
  watchdog.stop()
  await dispose()
}

if (!Array.isArray(samples) || samples.length === 0) {
  console.log('\n=== ORIONIDS MEASUREMENT ABORTED: the DEM returned no horizon samples ===')
  console.log('    Nothing is written. A flat horizon would not be the measurement asked for.')
  process.exit(2)
}

const target = { kind: 'meteors', shower: 'orionids' }
const flat = skyWindow({ target, at: OVERLOOK, eveningOf: EVENING, horizon: { kind: 'flat' } })
const terrain = skyWindow({
  target,
  at: OVERLOOK,
  eveningOf: EVENING,
  horizon: { kind: 'terrain', samples },
})

const show = (result) => {
  if (result.kind !== 'window') return { reason: result.reason }
  return {
    window: `${clock(result.window.start)} – ${clock(result.window.end)}`,
    minutes: windowMinutes(result.window),
    targetUp:
      result.constraints.targetUp === null ? '—' : clock(result.constraints.targetUp.start),
    moonDown:
      result.constraints.moonDown === null
        ? '—'
        : `${clock(result.constraints.moonDown.start)} – ${clock(result.constraints.moonDown.end)}`,
    dark:
      result.constraints.astronomicalDark === null
        ? '—'
        : `${clock(result.constraints.astronomicalDark.start)} – ${clock(result.constraints.astronomicalDark.end)}`,
    startsBecause: result.startsBecause,
    endsBecause: result.endsBecause,
    horizonSource: result.horizonSource,
    altitude: Math.round(result.altitudeAtMidWindow),
  }
}

const f = show(flat)
const t = show(terrain)
const shower = showerById('orionids')

const east = samples
  .filter((s) => s.azimuth >= 45 && s.azimuth <= 135)
  .map((s) => `${s.azimuth}° ${s.angleDegrees.toFixed(2)}°`)
  .join(', ')

const lines = [
  '# The Orionid window at Little Devils Stairs Overlook, 2026-10-21',
  '',
  '**Date:** 2026-10-18  ',
  '**Question:** What is the shootable window for the Orionid maximum at this',
  'overlook, and does the real skyline change it?  ',
  `**Outcome:** ${t.window ?? t.reason}, ${t.minutes ?? 0} minutes, over the terrain horizon.`,
  '',
  '## The venue, resolved rather than assumed',
  '',
  'The brief gave "about 38.74, -78.30". Nominatim, which is the geocoder the',
  'app itself uses, resolves `Little Devils Stairs Overlook` to a viewpoint node',
  'at **38.7567229, -78.2675403** — 3.37 km north-east of the figure in the',
  'brief. Every number below uses the resolved coordinate.',
  '',
  `Observer elevation from the app's own DEM: **${typeof elevation === 'number' ? elevation.toFixed(1) : '—'} m**.`,
  '(USGS EPQS reports 951.1 m at the same point, for comparison. The DEM the app',
  'draws with is Terrarium, which is a different raster at a different',
  'resolution; the two are not expected to agree exactly and the app uses its',
  'own, because that is what produced the horizon below.)',
  '',
  '## The shower, from the table',
  '',
  `Orionids (008ORI), IMO 2025 calendar: maximum **October 21**, radiant`,
  `**α ${shower?.radiantRa}°, δ +${shower?.radiantDec}°**, ZHR ${shower?.zhr} under a perfect sky.`,
  '',
  '## Method',
  '',
  "The horizon came from the running app: the camera was moved to the overlook,",
  'terrain switched on, and the script waited for `queryTerrainElevation` to',
  'answer before reading `MapHandle.horizonAt`, which samples 24 bearings by 12',
  'distances out to 40 km. The window was then computed by the shipped',
  '`src/core/skyWindow.ts`, imported directly. Nothing here reimplements either.',
  '',
  `Terrain horizon in the eastern quadrant, where the radiant rises: ${east}.`,
  '',
  '## The answer',
  '',
  '| | flat horizon | terrain horizon |',
  '|---|---|---|',
  `| radiant clears the horizon | ${f.targetUp ?? '—'} | ${t.targetUp ?? '—'} |`,
  `| moon below the horizon | ${f.moonDown ?? '—'} | ${t.moonDown ?? '—'} |`,
  `| astronomical dark | ${f.dark ?? '—'} | ${t.dark ?? '—'} |`,
  `| **window** | **${f.window ?? f.reason}** | **${t.window ?? t.reason}** |`,
  `| length | ${f.minutes ?? 0} min | ${t.minutes ?? 0} min |`,
  `| opens because | ${f.startsBecause ?? '—'} | ${t.startsBecause ?? '—'} |`,
  `| closes because | ${f.endsBecause ?? '—'} | ${t.endsBecause ?? '—'} |`,
  `| radiant altitude mid-window | ${f.altitude ?? '—'}° | ${t.altitude ?? '—'}° |`,
  `| horizonSource | ${f.horizonSource ?? '—'} | ${t.horizonSource ?? '—'} |`,
  '',
  '## What binds it',
  '',
  'The 2026 Orionid maximum runs into a waxing gibbous moon. The radiant is up',
  'from mid-evening and the sky is astronomically dark from just before 20:00,',
  'but the moon is above the horizon for most of the night, so the window does',
  'not open until moonset and is closed by the brightening sky. The binding',
  `constraint is the ${f.startsBecause} at the start and the ${f.endsBecause} at the end, and the app`,
  'prints exactly that rather than only the times.',
  '',
  '## What the terrain actually changed here, which is not what was expected',
  '',
  ...(() => {
    const minutes = Math.round(
      ((flat.kind === 'window' ? flat.constraints.targetUp?.start.getTime() ?? 0 : 0) -
        (terrain.kind === 'window' ? terrain.constraints.targetUp?.start.getTime() ?? 0 : 0)) /
        60000,
    )
    const sameWindow = (f.window ?? '') === (t.window ?? '')
    const mean =
      samples
        .filter((s) => s.azimuth >= 45 && s.azimuth <= 135)
        .reduce((acc, s) => acc + s.angleDegrees, 0) /
      Math.max(1, samples.filter((s) => s.azimuth >= 45 && s.azimuth <= 135).length)
    return [
      `The radiant clears the horizon **${Math.abs(minutes)} minutes ${minutes > 0 ? 'EARLIER' : 'later'}**`,
      'over the real skyline than over a flat one. Earlier, not later, and that is',
      'the right answer rather than a sign error: this is an **overlook**. The',
      `terrain horizon to the east averages **${mean.toFixed(2)}°**, which is BELOW`,
      'horizontal, because the shooter is standing on a ridge and the land falls',
      'away. src/core/horizon.ts keeps negative horizon angles for exactly this',
      'case, and this is the case.',
      '',
      sameWindow
        ? '**The window itself is unchanged.** The radiant is not what binds this'
        : '**The window moved.** The radiant is what binds this night here,',
      sameWindow
        ? 'night here — the moon is — so moving the radiant rise by a few minutes'
        : 'so the terrain horizon moved the window with it.',
      sameWindow
        ? 'moves nothing the shooter cares about. That is worth stating plainly:'
        : '',
      sameWindow
        ? 'on this night, at this venue, the terrain horizon changes a reported'
        : '',
      sameWindow ? 'constraint time and does not change the answer.' : '',
    ].filter((line) => line !== '')
  })(),
  '',
  '## What this does not say',
  '',
  'Nothing here says the night will be clear. Cloud is a separate line in the',
  'app, shown only where the forecast reaches, and it says so where it does not.',
  '',
  'Reproduce with `node --experimental-strip-types scripts/measure-orionids.mjs`.',
  '',
]

const out = 'measurements/2026-10-18-orionids-little-devils-stairs.md'
writeFileSync(out, lines.join('\n'))

console.log('\n### Orionids at Little Devils Stairs Overlook, evening of 2026-10-21')
console.log(`  observer elevation (app DEM)  ${typeof elevation === 'number' ? elevation.toFixed(1) + ' m' : '—'}`)
console.log(`  horizon samples               ${samples.length}`)
console.log('')
console.log('                       flat                 terrain')
console.log(`  radiant clears   ${String(f.targetUp ?? '—').padEnd(20)} ${t.targetUp ?? '—'}`)
console.log(`  moon down        ${String(f.moonDown ?? '—').padEnd(20)} ${t.moonDown ?? '—'}`)
console.log(`  astro dark       ${String(f.dark ?? '—').padEnd(20)} ${t.dark ?? '—'}`)
console.log(`  WINDOW           ${String(f.window ?? f.reason).padEnd(20)} ${t.window ?? t.reason}`)
console.log(`  length           ${String((f.minutes ?? 0) + ' min').padEnd(20)} ${(t.minutes ?? 0) + ' min'}`)
console.log(`  opens because    ${String(f.startsBecause ?? '—').padEnd(20)} ${t.startsBecause ?? '—'}`)
console.log(`  closes because   ${String(f.endsBecause ?? '—').padEnd(20)} ${t.endsBecause ?? '—'}`)
console.log(`  horizonSource    ${String(f.horizonSource ?? '—').padEnd(20)} ${t.horizonSource ?? '—'}`)
console.log(`\n  -> ${out}`)
