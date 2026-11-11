/*
 * ACCESSIBILITY (Batch QA, Section 6), IN WEBKIT.
 *
 * Usage:  node scripts/audit-a11y.mjs [screenshot-dir]
 *
 *   names     every button and link on the home, the menu, the Surf, Wind,
 *             Tide, Weather, Sky and Drone pages has a name VoiceOver and
 *             TalkBack can say (its text, aria-label or aria-labelledby)
 *   contrast  every word on the home, in each of its skies (day, cloud,
 *             rain, fog, golden, night, storm), against the pixels behind it
 *             in a screenshot: 4.5:1, or 3:1 for large text (24 px, or 18.7
 *             px bold); the worst of the box's four corners is its ground
 *   text size the home and the pages at the largest text size (the root at
 *             150%): nothing runs past the screen's width
 *   motion    with "reduce motion" on, no animation keeps running
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from './gate/playwright.mjs'
import { decodePng } from '../src/lib/png.ts'
import { ensureApp, goToStage, guardAudit, startWatchdog, APP_ORIGIN, openMenu } from './preflight.mjs'

/* Batch Polish, Section 2: the menu is the home's (and setup's and field's); on the map its Back goes home first (scripts/preflight.mjs openMenu). */
const menuOn = (pg) => openMenu((x) => pg.evaluate(x), (ms) => pg.waitForTimeout(ms))
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'

guardAudit('a11y')
const watchdog = startWatchdog('a11y', 600_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'a11y')
mkdirSync(OUT, { recursive: true })
let problems = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

const PIER = { lat: 36.8435575, lon: -75.9713104 }
await ensureApp()
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-11-02', startTime: '09:00', endTime: '11:00' }
const url = await shareLink(`${APP_ORIGIN}/`, { id: 'a11y', name: 'A11y', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: ['dji-air-3s'], styleNotes: '' }, positions: [] })

const UNNAMED = `JSON.stringify([...document.querySelectorAll('button, a[href], [role="button"], [role="tab"], [role="switch"]')].filter((e) => {
  const b = e.getBoundingClientRect()
  if (b.width === 0 || b.height === 0 || getComputedStyle(e).visibility === 'hidden') return false
  const name = (e.getAttribute('aria-label') ?? '').trim() || (e.getAttribute('aria-labelledby') ? (document.getElementById(e.getAttribute('aria-labelledby'))?.textContent ?? '').trim() : '') || (e.textContent ?? '').trim() || (e.getAttribute('title') ?? '').trim()
  return name === ''
}).map((e) => (String(e.className?.baseVal ?? e.className).split(' ')[0] || e.tagName) + (e.querySelector('svg') ? ' (an icon)' : '')))`

const TEXTS = `JSON.stringify([...document.querySelectorAll('body *')].filter((e) => {
  if (![...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')) return false
  const b = e.getBoundingClientRect()
  const st = getComputedStyle(e)
  if (b.width < 2 || b.height < 2 || st.visibility === 'hidden' || Number(st.opacity) === 0 || b.bottom < 0 || b.top > innerHeight || b.right < 0 || b.left > innerWidth) return false
  const top = document.elementFromPoint(Math.min(innerWidth - 1, b.left + b.width / 2), Math.min(innerHeight - 1, b.top + b.height / 2))
  return top !== null && (top === e || e.contains(top) || top.contains(e))
}).map((e) => {
  const b = e.getBoundingClientRect()
  const st = getComputedStyle(e)
  return { k: (String(e.className?.baseVal ?? e.className).split(' ')[0] || e.tagName) + ': ' + (e.textContent ?? '').trim().slice(0, 24), x: b.left, y: b.top, w: b.width, h: b.height, color: e instanceof SVGElement ? st.fill : st.color, px: parseFloat(st.fontSize), bold: Number(st.fontWeight) >= 700 }
}))`

const rgba = (s) => {
  const m = /rgba?\(([^)]+)\)/.exec(s ?? '')
  if (m === null) return null
  const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number)
  return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }
}
const lum = ([r, g, b]) => {
  const f = (c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

const browser = await webkit.launch()
try {
  /* ---------------------------------------------------------------- names */
  {
    console.log('\n### names')
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('scoutngo.landing.v1', 'true')
      } catch {
        /* about:blank */
      }
    })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(new Date('2026-11-02T15:30:00Z'))
    const wait = (ms) => page.waitForTimeout(ms)
    const ev = (x) => page.evaluate(x)
    const tap = (sel, ms = 3000) => page.locator(sel).first().click({ timeout: 5000, noWaitAfter: true }).then(() => wait(ms), () => console.log(`  (no ${sel})`))
    const names = async (screen) => {
      const bad = JSON.parse(await ev(UNNAMED))
      console.log(`  ${screen}: ${bad.length} without a name`)
      for (const b of [...new Set(bad)].slice(0, 6)) fail(`${screen}: a control with no name for a screen reader: ${b}`)
    }
    await page.goto(url)
    /* The shared plan's own question first: other screens wait under it. */
    await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
    await wait(3500)
    await goToStage(ev, wait, 'plan')
    await wait(2000)
    await names('map')
    await menuOn(page)
    await names('menu')
    await tap('.mcard--today', 4000)
    await names('home')
    for (const card of ['surf', 'wind', 'tide']) {
      await tap(`.home__page[aria-label="Today"] .hcard--${card}`, 4000)
      await names(`${card} page`)
      await tap('.dpage__back:visible', 1500)
    }
    for (const [card, screen] of [['sky', 'sky page'], ['drone', 'drone page']]) {
      await tap(`.home__page[aria-label="Today"] .hcard--${card}`, 4000)
      await names(screen)
      await tap('.ppage__back:visible', 1500)
    }
    await tap('.home .hwx__temp', 4000)
    await names('weather page')
    await ctx.close()
    watchdog.note('names')
  }

  /* --------------------------------------------- contrast, every sky look */
  {
    console.log('\n### contrast on the home, in each sky')
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('scoutngo.landing.v1', 'true')
      } catch {
        /* about:blank */
      }
    })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(new Date('2026-11-02T15:30:00Z'))
    const wait = (ms) => page.waitForTimeout(ms)
    const ev = (x) => page.evaluate(x)
    await page.goto(url)
    /* The shared plan's own question first: other screens wait under it. */
    await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
    await wait(3500)
    await goToStage(ev, wait, 'plan')
    await menuOn(page)
    await wait(800)
    await page.locator('.mcard--today').first().click({ noWaitAfter: true }).catch(() => {})
    await wait(5000)
    for (const sky of ['day', 'cloud', 'rain', 'fog', 'golden', 'night', 'storm']) {
      await ev(`(() => { const h = document.querySelector('.home'); if (h) h.className = h.className.replace(/home--[a-z]+/g, '') + ' home--${sky}'; return 1 })()`)
      await wait(600)
      const png = await page.screenshot({ path: join(OUT, `home-${sky}.png`) })
      const px = await decodePng(png)
      const k = px.width / 390
      const at = (x, y) => {
        const i = (Math.round(Math.max(0, Math.min(px.height - 1, y * k))) * px.width + Math.round(Math.max(0, Math.min(px.width - 1, x * k)))) * 4
        return [px.data[i], px.data[i + 1], px.data[i + 2]]
      }
      const texts = JSON.parse(await ev(TEXTS))
      /* Measuring the wrong screen passes (docs/failure-modes.md): the home must be what is on screen. */
      if (!(await ev(`!!document.querySelector('.home')`)) || texts.length < 20) fail(`contrast in ${sky}: the home is not what is on screen (${texts.length} words), so nothing was measured`)
      const low = []
      for (const t of texts) {
        const c = rgba(t.color)
        if (c === null) continue
        /* The ground is the commonest colour inside the box (a grid of 8 by 3, binned): glyphs are the few, a pill's rounded ends and a dial beside a line are not the ground (the corners were). */
        const bins = new Map()
        for (let i = 0; i < 8; i += 1) {
          for (let j = 0; j < 3; j += 1) {
            const p = at(t.x + ((i + 0.5) / 8) * t.w, t.y + ((j + 0.5) / 3) * t.h)
            const key = p.map((v) => v >> 4).join(',')
            const b = bins.get(key) ?? { n: 0, sum: [0, 0, 0] }
            b.n += 1
            b.sum = b.sum.map((v, k) => v + p[k])
            bins.set(key, b)
          }
        }
        /* Not the words' own colour: big glyphs ("59°") fill most of their box. */
        const ink = [c.r, c.g, c.b]
        const ranked = [...bins.values()].sort((a, b) => b.n - a.n).map((x) => x.sum.map((v) => v / x.n))
        const bg = ranked.find((p) => ratio(p, ink) > 1.15) ?? ranked[0]
        const fg = [c.r * c.a + bg[0] * (1 - c.a), c.g * c.a + bg[1] * (1 - c.a), c.b * c.a + bg[2] * (1 - c.a)]
        const worst = ratio(fg, bg)
        const need = t.px >= 24 || (t.bold && t.px >= 18.66) ? 3 : 4.5
        if (worst < need) low.push(`${t.k} ${worst.toFixed(1)}:1`)
      }
      console.log(`  ${sky}: ${texts.length} words, ${low.length} under the contrast`)
      for (const l of [...new Set(low)].slice(0, 6)) fail(`home in ${sky}: ${l}`)
    }
    await ctx.close()
    watchdog.note('contrast')
  }

  /* ------------------------------------------- the largest text, and motion */
  {
    console.log('\n### the largest text, and reduce motion')
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('scoutngo.landing.v1', 'true')
      } catch {
        /* about:blank */
      }
      const add = () => {
        const s = document.createElement('style')
        s.textContent = 'html{font-size:150%!important;-webkit-text-size-adjust:150%!important}'
        document.head.appendChild(s)
      }
      if (document.head) add()
      else document.addEventListener('DOMContentLoaded', add)
    })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(new Date('2026-11-02T15:30:00Z'))
    const wait = (ms) => page.waitForTimeout(ms)
    const ev = (x) => page.evaluate(x)
    await page.goto(url)
    /* The shared plan's own question first: other screens wait under it. */
    await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
    await wait(3500)
    await goToStage(ev, wait, 'plan')
    await menuOn(page)
    await wait(800)
    await page.locator('.mcard--today').first().click({ noWaitAfter: true }).catch(() => {})
    await wait(5000)
    const wide = async (screen) => {
      const out = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('body *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.left < innerWidth && b.right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed' && !e.matches('.home__track, .home__page, .hday') && !e.closest('[data-sideways], .tbar, .hstrip, .dwind__strip, .wweek, table') }).map((e) => String(e.className?.baseVal ?? e.className).split(' ')[0] || e.tagName).slice(0, 5))`))
      console.log(`  ${screen} at 150%: ${out.length} past the edge`)
      for (const o of [...new Set(out)]) fail(`${screen} at the largest text: ${o} runs past the screen`)
    }
    await wide('home')
    await page.screenshot({ path: join(OUT, 'home-150.png') })
    const running = await ev(`document.getAnimations().filter((a) => a.playState === 'running' && (a.effect?.getTiming().iterations === Infinity)).map((a) => (a.effect?.target?.className?.baseVal ?? a.effect?.target?.className ?? '?') + ' ' + (a.animationName ?? a.id ?? '')).slice(0, 8)`)
    console.log(`  reduce motion: ${running.length} animations running for ever`)
    for (const r of running) fail(`reduce motion is on and an animation keeps running: ${r}`)
    await page.locator('.home__page[aria-label="Today"] .hcard--surf').first().click({ noWaitAfter: true }).catch(() => {})
    await wait(4000)
    await wide('surf page')
    await ctx.close()
    watchdog.note('text size and motion')
  }
} catch (error) {
  fail(`ABORTED: ${error instanceof Error ? error.message : String(error)}`)
} finally {
  await browser.close()
  watchdog.stop()
}
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== A11Y PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
