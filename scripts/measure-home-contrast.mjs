/*
 * THE HOME PAGE'S TYPE, ON THE PIXELS ACTUALLY BEHIND IT.
 *
 * Usage:  node scripts/measure-home-contrast.mjs   (app on :5173, Chrome on :9222)
 * Writes: measurements/<today>-home-contrast.md
 * Exits:  0 every label at 4.5:1 or better on every pixel behind it; 1 not; 2 could not look.
 *
 * The cover is a photograph now (public/home-hero.webp), so the colour behind
 * a label is whatever the photo has there. At each screen size: reads each
 * label's box and ink, hides the type (the photo, the sky above it and the
 * button stay), takes the screen as an image, and walks every pixel in each
 * box for the worst ratio. Twice: once in the page (WCAG relative luminance
 * written out there) and once here through src/core/contrast.ts on the worst
 * pixel the page found; the two must agree.
 */
import { writeFileSync } from 'node:fs'
import { connect } from './cdp.mjs'
import { guardAudit } from './preflight.mjs'
import { contrastRatio } from '../src/core/contrast.ts'

guardAudit('home contrast')
const SIZES = [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
  { width: 430, height: 932 },
]
const LABELS = '.cover__name, .cover__head, .cover__featlabel, .cover__licence, .cover__more, .cover__attrib'
const { send, ev, wait, dispose } = await connect()
const rows = []
let problems = 0
try {
  for (const size of SIZES) {
    await send('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 2, mobile: true })
    await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
    await wait(1500)
    await ev('localStorage.clear()')
    await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
    await wait(3500)
    await ev(`document.querySelector('.cover__photo')?.decode().then(() => 1)`)
    const labels = await ev(`[...document.querySelectorAll(${JSON.stringify(LABELS)})].map((e) => {
      const r = e.getBoundingClientRect(); const c = getComputedStyle(e).color.match(/\\d+/g).slice(0, 3).map(Number)
      return { what: e.className.replace('cover__', ''), text: e.textContent.trim().slice(0, 32), box: [r.left, r.top, r.right, r.bottom], ink: c }
    })`)
    if (!Array.isArray(labels) || labels.length < 9) throw new Error(`found ${Array.isArray(labels) ? labels.length : 0} labels on the home page, expected 9`)
    await ev(`(() => { const s = document.createElement('style'); s.id = 'hide-type'; s.textContent = '.cover__top, .cover__top * { color: transparent !important; text-decoration-color: transparent !important; text-shadow: none !important }'; document.head.appendChild(s); return 1 })()`)
    await wait(300)
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    await ev(`document.getElementById('hide-type')?.remove()`)
    const worst = await ev(`new Promise(async (ok) => {
      const img = new Image(); img.src = 'data:image/png;base64,${shot.result.data}'; await img.decode()
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height
      const g = cv.getContext('2d'); g.drawImage(img, 0, 0)
      const k = img.width / window.innerWidth
      const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
      const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
      ok(${JSON.stringify(labels)}.map((l) => {
        const [x0, y0, x1, y1] = l.box.map((v) => Math.round(v * k))
        const d = g.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data
        const li = L(l.ink)
        let min = Infinity, at = null
        for (let i = 0; i < d.length; i += 4) {
          const lb = L([d[i], d[i + 1], d[i + 2]])
          const r = (Math.max(li, lb) + 0.05) / (Math.min(li, lb) + 0.05)
          if (r < min) { min = r; at = [d[i], d[i + 1], d[i + 2]] }
        }
        return { ratio: min, bg: at }
      }))
    })`)
    const hex = (c) => '#' + c.map((n) => n.toString(16).padStart(2, '0')).join('')
    labels.forEach((l, i) => {
      const w = worst[i]
      const again = contrastRatio(hex(l.ink), hex(w.bg))
      const ok = w.ratio >= 4.5 && Math.abs(again - w.ratio) < 0.01
      if (!ok) problems += 1
      rows.push(`| ${size.width} x ${size.height} | ${l.what} | ${l.text} | ${Math.round(l.box[1])} to ${Math.round(l.box[3])} | ${hex(l.ink)} | ${hex(w.bg)} | ${w.ratio.toFixed(2)} | ${again.toFixed(2)} | ${ok ? 'ok' : 'FAIL'} |`)
    })
  }
} catch (error) {
  console.log(`could not look: ${error instanceof Error ? error.message : String(error)}`)
  await dispose()
  process.exit(2)
}
await dispose()

const date = new Date().toISOString().slice(0, 10)
const out = [
  "# The home page's type on its photograph",
  '',
  `Run: ${new Date().toISOString()} · node scripts/measure-home-contrast.mjs · Chrome headless at 2x, the type hidden and the screen read pixel by pixel under each label`,
  '',
  `${problems === 0 ? 'Every label passes 4.5:1 on every pixel behind it.' : `${problems} label(s) below 4.5:1 or the two ways disagree.`}`,
  '',
  '| screen | label | text | top to bottom px | ink | worst pixel behind | ratio, in the page | ratio, src/core/contrast.ts | |',
  '|---|---|---|---|---|---|---|---|---|',
  ...rows,
  '',
]
writeFileSync(`measurements/${date}-home-contrast.md`, out.join('\n'))
console.log(out.join('\n'))
process.exit(problems === 0 ? 0 : 1)
