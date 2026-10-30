/*
 * ELEVATION READ IN WEBKIT: THE FILE'S OWN NUMBERS, OR NOISE?
 *
 * Usage:  node scripts/audit-terrain-decode.mjs
 * Exits:  0 when, in WebKit with its fingerprinting noise on, the app's
 *         elevation decoder (src/lib/png.ts) returns every byte of two real
 *         terrarium tiles exactly as Node reads them, and the known heights
 *         at two places. 1 on a problem. 2 when it could not look.
 *
 * WHAT WAS SUSPECTED, AND WHAT THIS FOUND (29 Oct). The clouds' rainbow
 * speckle was WebKit's canvas noise (docs/failure-modes.md), and the terrain
 * read its heights through a canvas too, so it was the next suspect. Run
 * here, WebKit's noise lands on pixels drawn by script (text, paths,
 * gradients), not on an image drawn onto the canvas: the old canvas path read
 * these tiles exactly. The decoder no longer depends on that: it reads the
 * PNG's bytes (src/lib/png.ts) and never draws or reads a canvas, so a
 * WebKit that noised images too could not reach the heights.
 *
 * THE CHECK CAN FAIL, and is shown failing on every run: the same comparison
 * is made against a canvas that has one letter of text on it, which WebKit
 * does noise, and it must find the difference. And the noise itself must be
 * on in this browser (a gradient read back with its channels disagreeing),
 * or the run says it could not look.
 */
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { webkit } from 'playwright'
import { decodePng, terrariumMetres } from '../src/lib/png.ts'
import { guardAudit, startWatchdog } from './preflight.mjs'

guardAudit('terrain decode')
const watchdog = startWatchdog('terrain decode', 120_000)

/* Two tiles, two places whose height is known: Big Meadow on Skyline Drive, and Badwater, Death Valley. */
const TILES = [
  { file: 'tests/data/terrarium-12-1155-1572.png', px: 123, py: 106, place: 'Big Meadow, Shenandoah', low: 950, high: 1100 },
  { file: 'tests/data/terrarium-12-719-1605.png', px: 115, py: 52, place: 'Badwater, Death Valley', low: -90, high: -60 },
]

let problems = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

const source = ts.transpileModule(readFileSync('src/lib/png.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/^export /gm, '')

const browser = await webkit.launch()
let looked = 0
try {
  const page = await browser.newPage()
  await page.route('http://decode.test/', (r) => r.fulfill({ body: '<!doctype html><title>decode</title>', contentType: 'text/html' }))
  await page.goto('http://decode.test/')
  await page.evaluate(`${source}\nwindow.__png = { decodePng, terrariumMetres }`)

  /* IS THE NOISE ON? A grey gradient's three channels are equal unless something was added. */
  const noise = await page.evaluate(() => {
    const c = new OffscreenCanvas(256, 1).getContext('2d')
    const g = c.createLinearGradient(0, 0, 256, 0)
    g.addColorStop(0, '#000')
    g.addColorStop(1, '#fff')
    c.fillStyle = g
    c.fillRect(0, 0, 256, 1)
    const d = c.getImageData(0, 0, 256, 1).data
    let n = 0
    for (let x = 0; x < 256; x += 1) if (d[x * 4] !== d[x * 4 + 1] || d[x * 4] !== d[x * 4 + 2]) n += 1
    return n
  })
  console.log(`  WebKit's canvas noise: a grey gradient comes back with ${noise} of 256 pixels off grey`)
  if (noise === 0) {
    console.log('=== TERRAIN DECODE AUDIT ABORTED: this WebKit adds no canvas noise, so nothing here could show it ===')
    process.exit(2)
  }

  for (const t of TILES) {
    const bytes = readFileSync(t.file)
    const truth = await decodePng(bytes)
    const r = await page.evaluate(async ({ b64, px, py }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const P = window.__png
      const mine = await P.decodePng(bytes)
      const bitmap = await createImageBitmap(new Blob([bytes]), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
      const read = (mark) => {
        const c = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d', { willReadFrequently: true })
        c.drawImage(bitmap, 0, 0)
        if (mark) c.fillText('x', 0, 10)
        return c.getImageData(0, 0, bitmap.width, bitmap.height).data
      }
      return { mine: Array.from(mine.data), canvas: Array.from(read(false)), marked: Array.from(read(true)), at: P.terrariumMetres(mine.data, py * mine.width + px) }
    }, { b64: bytes.toString('base64'), px: t.px, py: t.py })
    looked += 1
    const differ = (a) => a.reduce((n, v, i) => n + (v !== truth.data[i] ? 1 : 0), 0)
    const worst = (a) => {
      let m = 0
      for (let p = 0; p < truth.width * truth.height; p += 1) m = Math.max(m, Math.abs(terrariumMetres(Uint8ClampedArray.from(a.slice(p * 4, p * 4 + 4)), 0) - terrariumMetres(truth.data, p)))
      return m
    }
    const d = { mine: differ(r.mine), canvas: differ(r.canvas), marked: differ(r.marked) }
    console.log(`  ${t.place}: ${r.at.toFixed(1)} m · bytes off the file: decoder ${d.mine}, canvas ${d.canvas}, canvas with one letter ${d.marked} (worst ${worst(r.marked).toFixed(0)} m)`)
    if (r.mine.length !== truth.data.length || d.mine !== 0) fail(`${t.place}: the decoder in WebKit differs from the file in ${d.mine} bytes`)
    if (d.marked === 0) fail(`${t.place}: a canvas WebKit noises read back exact, so this comparison cannot see noise`)
    if (!(r.at >= t.low && r.at <= t.high)) fail(`${t.place}: ${r.at.toFixed(1)} m, outside ${t.low} to ${t.high}`)
  }
} finally {
  await browser.close()
}
watchdog.stop()
if (looked !== TILES.length) {
  console.log(`=== TERRAIN DECODE AUDIT ABORTED: ${looked} of ${TILES.length} tiles looked at ===`)
  process.exit(2)
}
console.log(`\n=== TERRAIN DECODE PROBLEMS: ${problems} across ${looked} tiles ===`)
process.exit(problems === 0 ? 0 : 1)
