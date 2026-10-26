/*
 * THE APP ICON, EVERYWHERE IT IS ASKED FOR: favicon, Home Screen, manifest.
 *
 * Usage:  node scripts/make-icons.mjs   (Chrome on :9222)
 * Writes: public/favicon.svg, public/icons/apple-touch-icon.png (180),
 *         public/icons/icon-192.png, public/icons/icon-512.png,
 *         public/icons/icon-maskable-512.png
 *
 * ONE MARK, FROM THE APP'S OWN SOURCES. The glyph is the <Icon glyph="app">
 * the home page draws (src/components/Icon.tsx, rendered here through Vite),
 * and the tile's colours are shippedTile('app') from src/lib/iconPalette.ts.
 * Nothing about the mark is written down twice: change either file and run
 * this, and the favicon follows.
 *
 * TWO SHAPES. The favicon and the "any" manifest icons are the rounded tile
 * with its gloss, on transparent corners. The Home Screen icon and the
 * maskable one are FULL BLEED, no corner and no glow: iOS and Android cut
 * their own shape, and a pre-rounded tile on a black corner looks like a
 * mistake. The maskable glyph keeps inside the 80% safe zone.
 *
 * PNGs are rendered by headless Chrome from the SVG, the same mechanism the
 * audits use, so there is no image toolchain to install.
 */
import { writeFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { connect } from './cdp.mjs'
import { shippedTile } from '../src/lib/iconPalette.ts'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const { Icon } = await vite.ssrLoadModule('/src/components/Icon.tsx')
const markup = renderToStaticMarkup(createElement(Icon, { glyph: 'app', size: 76 }))
await vite.close()
const glyph = /<svg[^>]*>([^]*)<\/svg>/.exec(markup)?.[1]
if (!glyph) throw new Error('could not read the app glyph out of Icon.tsx')

const t = shippedTile('app')
const defs = `<defs>
  <linearGradient id="tile" x1="0.07" y1="0" x2="0.93" y2="1">
    <stop offset="0" stop-color="${t.light}"/><stop offset="0.5" stop-color="${t.middle}"/><stop offset="1" stop-color="${t.dark}"/>
  </linearGradient>
  <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
</defs>`

/* A 100-unit square. `rounded` is the tile; otherwise full bleed. `glyphShare` is the glyph's side over the tile's. */
const iconSvg = ({ rounded, glyphShare }) => {
  const g = 100 * glyphShare
  const at = (100 - g) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${defs}
  <rect width="100" height="100" ${rounded ? 'rx="30.6"' : ''} fill="url(#tile)"/>
  <rect x="10" y="4" width="80" height="44" rx="24" fill="url(#gloss)"/>
  <svg x="${at}" y="${at}" width="${g}" height="${g}" viewBox="0 0 24 24">${glyph}</svg>
</svg>`
}

const tile = iconSvg({ rounded: true, glyphShare: 0.555 })
const bleed = iconSvg({ rounded: false, glyphShare: 0.6 })
const maskable = iconSvg({ rounded: false, glyphShare: 0.5 })
writeFileSync('public/favicon.svg', tile + '\n')

const { send, wait, dispose } = await connect()
const render = async (svg, size, out) => {
  await send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false })
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
  const html = `<!doctype html><html><body style="margin:0;background:transparent"><img style="display:block;width:${size}px;height:${size}px" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`
  await send('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from(html).toString('base64') })
  await wait(600)
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 } })
  writeFileSync(out, Buffer.from(shot.result?.data ?? shot.data, 'base64'))
  console.log(`  ${out}  ${size} px`)
}
try {
  await render(bleed, 180, 'public/icons/apple-touch-icon.png')
  await render(tile, 192, 'public/icons/icon-192.png')
  await render(tile, 512, 'public/icons/icon-512.png')
  await render(maskable, 512, 'public/icons/icon-maskable-512.png')
} finally {
  await send('Emulation.setDefaultBackgroundColorOverride', {})
  await dispose()
}
console.log('  public/favicon.svg')
