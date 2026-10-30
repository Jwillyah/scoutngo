#!/usr/bin/env node
/*
 * One picture of every touched screen (docs/ux-rules.md, rule 26).
 *
 *   node scripts/contact-sheet.mjs out.png "label=a.png" "label=b.png" ...
 *
 * Lays the screenshots out side by side, captioned, at their own size scaled
 * to a common height, and photographs the result with Playwright's WebKit.
 * Refuses an empty sheet and a missing file: a contact sheet of nothing is
 * not a contact sheet (docs/failure-modes.md, B).
 */
import { readFileSync, existsSync } from 'node:fs'
import { webkit } from 'playwright'

const [out, ...pairs] = process.argv.slice(2)
if (!out || pairs.length === 0) {
  console.error('CONTACT SHEET: usage: contact-sheet.mjs out.png label=shot.png ...')
  process.exit(2)
}
const shots = pairs.map((p) => {
  const i = p.indexOf('=')
  const label = i > 0 ? p.slice(0, i) : p
  const file = i > 0 ? p.slice(i + 1) : p
  if (!existsSync(file)) {
    console.error(`CONTACT SHEET: missing ${file}`)
    process.exit(1)
  }
  return { label, src: `data:image/png;base64,${readFileSync(file).toString('base64')}` }
})

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const cols = Math.min(shots.length, 4)
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#111;color:#eee;font:14px -apple-system,system-ui,sans-serif;padding:16px}
.g{display:grid;grid-template-columns:repeat(${cols},auto);gap:16px;justify-content:start}
figure{margin:0}img{height:640px;display:block;border:1px solid #333}
figcaption{padding:6px 0;max-width:300px}
</style><div class="g">${shots
  .map((s) => `<figure><img src="${s.src}"><figcaption>${esc(s.label)}</figcaption></figure>`)
  .join('')}</div>`

const browser = await webkit.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })
  await page.setContent(html)
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0))
  const n = await page.evaluate(() => document.images.length)
  if (n !== shots.length) throw new Error(`CONTACT SHEET: ${n} of ${shots.length} pictures drawn`)
  await page.screenshot({ path: out, fullPage: true })
  console.log(`CONTACT SHEET: ${n} screens → ${out}`)
} finally {
  await browser.close()
}
