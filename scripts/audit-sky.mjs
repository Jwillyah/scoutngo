/*
 * THE SKY PAGE ON THE TAP-IN SKELETON (Batch SIMPLE-2, Section 4; mockups
 * docs/mockups/simple2/Sky_Now.png, Sky_Tonight.png, Sky_Night.png,
 * Sky_Viewfinder.png), IN WEBKIT.
 *
 * Usage:  node scripts/audit-sky.mjs [screenshot-dir]
 *
 * Chic's Beach, Thu 19 Nov 2026, 10:30 AM EST, at 390 x 844, 390 x 664 (a
 * Safari tab), 412 x 915 and 390 x 844 standalone (insets 47 / 34). The
 * nearest station (KNTU) reports a broken deck at 5,500 ft twelve minutes
 * before; the models are the gate's fake Open-Meteo.
 *
 *   opens     on Now at 10:30 AM (src/core/skyTabs.ts skyOpenTab)
 *   tabs      Now · Tonight · Sunrise · Night, in that order, each a tap
 *   Now       the cams: a big card and links, every one a link out to its
 *             owner (target _blank, noopener), no <img>, <video> or <iframe>
 *             of a cam anywhere (nothing fetched or kept by us); rows Clouds
 *             (the station and its age) · Moving · Rare light · Next, then
 *             More details
 *   Tonight   the call (Color likely / possible / unlikely, or No call yet),
 *             the drawn sky (an SVG, never an image), rows Golden · Color ·
 *             Blue hour · Moon, "Best spot near me ›" and "Viewfinder ›"
 *   Sunrise   the same, the rows in the morning's order
 *   Night     "N% lit", the moon drawn, 14 nights with FULL on the 24th,
 *             rows Next full · Next new · Darkest nights · Milky Way · Next
 *             shower
 *   every tab nothing covered (header, first row, foot each on top at its
 *             centre), the foot inside the window and above the home bar,
 *             nothing under the status bar, every button 44 px, no sideways
 *             scroll, never "safe" or "clear"
 *   Viewfinder from Tonight: the compass strip, the chips Sun · Moon · Milky
 *             Way and the event's line, with the camera; refused, the
 *             compass-only view with its one line and Retry
 *
 * AND IT CAN FAIL: it counts the tabs it looked at and fails on none
 * (docs/failure-modes.md, B), and it checks the page it measured is the Sky
 * page's (.tipage.spage) before reading it (C).
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from './gate/playwright.mjs'
import { ensureApp, goToStage, guardAudit, startWatchdog, APP_ORIGIN, setSheet } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'
import { getPosition, getTimes } from 'suncalc'
import { OPEN_METEO, fakeAnswer } from './openMeteoFake.mjs'

guardAudit('sky page')
const watchdog = startWatchdog('sky page', 540_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'sky')
mkdirSync(OUT, { recursive: true })
await ensureApp()

const SPOT = { lat: 36.92, lon: -76.1 }
const NOW = new Date('2026-11-19T15:30:00Z')
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(SPOT.lat), String(SPOT.lon)), name: "Chic's Beach" }, latitude: String(SPOT.lat), longitude: String(SPOT.lon), date: '2026-11-19', startTime: '16:00', endTime: '17:30' }
const kit = { bodyIds: ['a7iv'], lensIds: ['sigma-28-75'], droneIds: [], styleNotes: '' }
const url = new URL(await shareLink(`${APP_ORIGIN}/`, { id: 'sky', name: 'Sky check', savedAt: '2026-11-19T00:00:00Z', venue, kit, positions: [] }))
const NWS = 'https://api.weather.gov'
const OBS = { properties: { rawMessage: 'KNTU 191518Z 20008KT 10SM BKN055 BKN250 15/12 A3001', timestamp: '2026-11-19T15:18:00Z' } }

const LOOKS = [
  { key: '390x844', w: 390, h: 844, top: 0, bottom: 0 },
  { key: '390x664', w: 390, h: 664, top: 0, bottom: 0 },
  { key: '412x915', w: 412, h: 915, top: 0, bottom: 0 },
  { key: 'standalone', w: 390, h: 844, top: 47, bottom: 34 },
]
const TABS = [
  { id: 'now', pill: /^Now$/, rows: ['Clouds', 'Moving', 'Rare light', 'Next', 'More details'] },
  { id: 'tonight', pill: /^Tonight$/, rows: ['Golden', 'Color', 'Blue hour', 'Moon', 'More details'] },
  { id: 'tmrw-am', pill: /^Sunrise$/, rows: ['Blue hour', 'Color', 'Golden', 'Moon', 'More details'] },
  { id: 'night', pill: /^Night$/, rows: ['Next full', 'Next new', 'Darkest nights', 'Milky Way', 'Next shower'] },
]

let problems = 0
let looked = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

/* In the page: what the Sky page shows, and whether each part is on top at its own centre. */
const LOOK = `(() => {
  const root = document.querySelector('.tipage.spage')
  if (!root) return null
  const onTop = (el) => {
    if (!el) return false
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return false
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2))
    const y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))
    const t = document.elementFromPoint(x, y)
    return t !== null && (el.contains(t) || t.contains(el))
  }
  const box = (el) => { const r = el?.getBoundingClientRect(); return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) } : null }
  const foot = root.querySelector('.dpage__foot')
  const small = [...root.querySelectorAll('button, a')].filter((b) => { const r = b.getBoundingClientRect(); return r.height > 0 && r.height < 43.5 && !b.closest('.dhow') }).map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 30) + ' ' + Math.round(b.getBoundingClientRect().height))
  const rows = [...root.querySelectorAll('.tipage__row')]
  const snow = root.querySelector('.snow')
  const links = snow ? [...snow.querySelectorAll('a')] : []
  return {
    title: root.querySelector('.ppage__title')?.textContent ?? null,
    sub: root.querySelector('.ppage__sub')?.textContent ?? null,
    tabs: [...root.querySelectorAll('.tipage__tabs [role="tab"]')].map((b) => ({ t: b.textContent, on: b.getAttribute('aria-selected') === 'true' })),
    kind: root.className,
    eyebrow: root.querySelector('.tipage__eyebrow')?.textContent ?? null,
    value: root.querySelector('.tipage__value')?.textContent ?? null,
    shared: root.querySelector('.tipage__value')?.getAttribute('data-shared') ?? null,
    line: root.querySelector('.tipage__sub')?.textContent ?? null,
    labels: rows.map((r) => r.querySelector('.tipage__label')?.textContent ?? r.querySelector('.tipage__morelabel')?.textContent),
    values: rows.map((r) => r.querySelector('.tipage__val')?.textContent?.trim() ?? null),
    actions: [...root.querySelectorAll('.tipage__btn')].map((b) => b.textContent),
    picture: !!root.querySelector('svg[data-sky-picture], .skypic__none'),
    camLinks: links.length,
    camLinksOut: links.every((a) => a.target === '_blank' && /noopener/.test(a.rel) && /^https:/.test(a.href)),
    camMedia: root.querySelectorAll('.snow img, .snow video, .snow iframe, .snow picture').length,
    camText: snow?.innerText ?? null,
    strip: root.querySelectorAll('.snight__day').length,
    full: [...root.querySelectorAll('.snight__day--full .snight__num')].map((e) => e.textContent),
    moon: !!root.querySelector('.snight__moon svg'),
    how: foot?.querySelector('.dpage__link')?.textContent ?? null,
    safety: foot?.querySelector('.dpage__safety')?.textContent ?? null,
    top: { back: onTop(root.querySelector('.ppage__back')), title: onTop(root.querySelector('.ppage__title')), firstRow: rows.length === 0 || rows[0].getBoundingClientRect().bottom > innerHeight - 60 || onTop(rows[0]), foot: onTop(foot?.querySelector('.dpage__link')) },
    boxes: { back: box(root.querySelector('.ppage__back')), foot: box(foot), body: box(root.querySelector('.ppage__body')), hero: box(root.querySelector('.tipage__hero')), moon: box(root.querySelector('.snight__moon')), value: box(root.querySelector('.tipage__value')), heroSub: box(root.querySelector('.tipage__sub')) },
    small,
    text: root.innerText,
    vh: innerHeight,
    docScrolls: document.documentElement.scrollWidth > innerWidth + 1,
    bodyWide: [...root.querySelectorAll('.ppage__body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('[data-sideways]')).map((e) => e.className).slice(0, 3),
  }
})()`

const browser = await webkit.launch()
try {
  for (const look of LOOKS) {
    console.log(`### ${look.key}`)
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: look.w, height: look.h }, serviceWorkers: 'block' })
    await ctx.route(OPEN_METEO, (r) => r.fulfill({ json: fakeAnswer(r.request().url(), NOW) }))
    /* The nearest station: KNTU, twelve minutes old, broken at 5,500 ft. */
    await ctx.route(/^https:\/\/api\.weather\.gov\//, (r) => {
      const u = r.request().url()
      if (/\/points\//.test(u)) return r.fulfill({ json: { properties: { observationStations: `${NWS}/gridpoints/AKQ/90,60/stations` } } })
      if (/\/gridpoints\/.*\/stations$/.test(u)) return r.fulfill({ json: { features: [{ properties: { stationIdentifier: 'KNTU' } }] } })
      if (/\/stations\/KNTU\/observations\/latest/.test(u)) return r.fulfill({ json: OBS })
      return r.fulfill({ status: 503, body: 'not in this audit' })
    })
    await ctx.addInitScript(
      ([top, bottom]) => {
        try {
          localStorage.setItem('scoutngo.landing.v1', 'true')
          localStorage.setItem('scoutngo.activities.v1', JSON.stringify(['surf', 'fish', 'shoot']))
        } catch {
          /* about:blank */
        }
        if (top > 0) {
          const add = () => {
            const s = document.createElement('style')
            s.textContent = `:root{--safe-top:${top}px!important;--safe-bottom:${bottom}px!important}`
            document.head.appendChild(s)
          }
          if (document.head) add()
          else document.addEventListener('DOMContentLoaded', add)
        }
        /* The test camera: a still sky gradient, or a refusal (window.__cam). */
        window.__cam = 'sky'
        Object.defineProperty(MediaDevices.prototype, 'getUserMedia', {
          configurable: true,
          writable: true,
          value: async () => {
            if (window.__cam === 'refuse') throw new DOMException('denied', 'NotAllowedError')
            const c = document.createElement('canvas')
            c.width = 480
            c.height = 640
            const g = c.getContext('2d')
            const paint = () => {
              const grad = g.createLinearGradient(0, 0, 0, 640)
              grad.addColorStop(0, '#41598a')
              grad.addColorStop(0.62, '#e0a07a')
              grad.addColorStop(0.62, '#2b3640')
              grad.addColorStop(1, '#202a30')
              g.fillStyle = grad
              g.fillRect(0, 0, 480, 640)
            }
            paint()
            setInterval(paint, 100)
            return c.captureStream(10)
          },
        })
        Object.defineProperty(MediaDevices.prototype, 'enumerateDevices', { configurable: true, writable: true, value: async () => [{ kind: 'videoinput', deviceId: 'back', label: 'Back Camera' }] })
      },
      [look.top, look.bottom],
    )
    const page = await ctx.newPage()
    await page.clock.install({ time: NOW })
    await page.clock.resume()
    const wait = (ms) => page.waitForTimeout(ms)
    const ev = (x) => page.evaluate(x)
    await page.goto(url.href)
    await wait(3000)
    await page.getByRole('button', { name: /^open$/i }).click({ timeout: 3000 }).catch(() => {})
    await page.getByText(/^(Open the map|Open ScoutNGo)$/).click({ timeout: 3000 }).catch(() => {})
    await goToStage(ev, wait, 'plan')
    await wait(2000)
    await setSheet(ev, wait, 'peek')
    await page.locator('.chip2[data-chip="cloud"]').first().tap({ timeout: 5000 }).catch(() => {})
    let l = null
    for (let i = 0; i < 40; i += 1) {
      await wait(500)
      l = await ev(LOOK)
      if (l !== null && l.labels.length > 0 && !/^…$/.test(l.value ?? '…')) break
    }
    if (l === null) {
      fail(`${look.key}: the map's Cloud chip opened no Sky page (.tipage.spage), so nothing was looked at`)
      await ctx.close()
      continue
    }
    /* The rule: 10:30 AM, between sunrise + 30 min and sunset - 90 min, is Now. */
    const day = getTimes(new Date('2026-11-19T17:00:00Z'), SPOT.lat, SPOT.lon)
    console.log(`  sunrise ${day.sunrise.toISOString()} sunset ${day.sunset.toISOString()}; opened on ${JSON.stringify(l.tabs.find((t) => t.on)?.t)}`)
    if (l.tabs.map((t) => t.t).join('|') !== 'Now|Tonight|Sunrise|Night') fail(`${look.key}: the tabs read ${JSON.stringify(l.tabs.map((t) => t.t))}`)
    if (l.tabs[0]?.on !== true) fail(`${look.key}: at 10:30 AM the Sky page opened on ${JSON.stringify(l.tabs.find((t) => t.on)?.t)}, not Now`)

    for (const tab of TABS) {
      if (tab.id !== 'now') {
        await page.locator('.tipage.spage .tipage__tabs [role="tab"]', { hasText: tab.pill }).first().tap({ timeout: 4000 }).catch(() => fail(`${look.key}: no ${tab.id} tab to tap`))
      }
      let t = null
      for (let i = 0; i < 30; i += 1) {
        await wait(400)
        t = await ev(LOOK)
        const ready = t !== null && t.tabs.find((x) => x.on)?.t !== undefined && tab.pill.test(t.tabs.find((x) => x.on).t) && t.value !== '…' && (tab.id !== 'now' || t.camText === null || !/Finding the cams/.test(t.camText))
        if (ready) break
      }
      if (t === null || !tab.pill.test(t.tabs.find((x) => x.on)?.t ?? '')) {
        fail(`${look.key}: the ${tab.id} tab did not open`)
        continue
      }
      looked += 1
      const k = `${look.key} ${tab.id}`
      console.log(`  ${tab.id}: ${JSON.stringify({ eyebrow: t.eyebrow, value: t.value, line: t.line, rows: t.labels, values: t.values, actions: t.actions, safety: t.safety })}`)
      await page.screenshot({ path: join(OUT, `sky-${tab.id}-${look.key}.png`) })
      if (t.title !== 'Sky') fail(`${k}: the title reads ${JSON.stringify(t.title)}`)
      if (!/^Chic.s Beach · now$/.test(t.sub ?? '')) fail(`${k}: the line under the title reads ${JSON.stringify(t.sub)}`)
      if (JSON.stringify(t.labels) !== JSON.stringify(tab.rows)) fail(`${k}: the rows are ${JSON.stringify(t.labels)}, not ${JSON.stringify(tab.rows)}`)
      if (t.how !== 'How we got this ›') fail(`${k}: the foot's left reads ${JSON.stringify(t.how)}`)
      if (t.safety === null || t.safety.trim() === '') fail(`${k}: no safety line at the foot`)
      if (/\bsafe\b|\ball clear\b|\bclear to\b|\bclear of\b/i.test(t.text)) fail(`${k}: the page says safe or clear`)
      for (const [part, on] of Object.entries(t.top)) if (!on) fail(`${k}: the ${part} is covered`)
      for (const s of t.small) fail(`${k}: a target under 44 px: ${s}`)
      if (t.docScrolls || t.bodyWide.length > 0) fail(`${k}: something runs past the right edge ${JSON.stringify(t.bodyWide)}`)
      const b = t.boxes
      if (b.foot !== null && b.foot.bottom > t.vh - look.bottom + 1) fail(`${k}: the foot ends at ${b.foot.bottom}, under the home bar`)
      if (b.back !== null && b.back.top < look.top) fail(`${k}: the back button starts at ${b.back.top}, under the status bar`)
      if (b.body !== null && b.foot !== null && b.body.bottom > b.foot.top + 1) fail(`${k}: the body runs under the foot`)
      if (tab.id === 'now') {
        if (t.value === null || t.value === '—') fail(`${k}: Now's big value is ${JSON.stringify(t.value)} with a fresh station report`)
        if (!/^Broken 5,500 ft KNTU · \d+ min$/.test(t.values[0] ?? '')) fail(`${k}: the Clouds row reads ${JSON.stringify(t.values[0])}, not the station's deck and its age`)
        if (!/^(Sunset|Sunrise) \d{1,2}:\d\d [AP]M/.test(t.values[3] ?? '')) fail(`${k}: the Next row reads ${JSON.stringify(t.values[3])}`)
        if (t.camLinks === 0 && !/No sky cam/.test(t.camText ?? '')) fail(`${k}: no cams and no words saying so`)
        if (!t.camLinksOut) fail(`${k}: a cam opens other than as a link out to its owner`)
        if (t.camMedia !== 0) fail(`${k}: ${t.camMedia} cam picture(s) loaded by the app; every cam today is link-out only`)
        if (look.key === '390x844') {
          const before = t.camLinks
          const toggled = await page.locator('.snow__showall').first().tap({ timeout: 2000 }).then(() => true, () => false)
          if (toggled) {
            await wait(400)
            const after = await ev(LOOK)
            console.log(`  Show all: ${before} links, then ${after.camLinks}`)
            if (after.camLinks <= before) fail(`${k}: "Show all" showed no road-only cams`)
            await page.screenshot({ path: join(OUT, `sky-now-all-${look.key}.png`) })
            await page.locator('.snow__showall').first().tap()
          }
        }
      }
      if (tab.id === 'tonight' || tab.id === 'tmrw-am') {
        if (!/^(Color (likely|possible|unlikely)|No call yet)$/.test(t.value ?? '')) fail(`${k}: the call reads ${JSON.stringify(t.value)}`)
        if (!t.picture) fail(`${k}: no drawn sky and no words saying why`)
        if (!/^(Golden|Blue hour)/.test(t.values[0] ?? '') && !/\d:\d\d [AP]M–\d/.test(t.values[0] ?? '')) fail(`${k}: the first light row reads ${JSON.stringify(t.values[0])}`)
        if (!/^\d+% · (up|down)/.test(t.values[3] ?? '')) fail(`${k}: the Moon row reads ${JSON.stringify(t.values[3])}`)
        if (JSON.stringify(t.actions) !== JSON.stringify(['Best spot near me ›', 'Viewfinder ›'])) fail(`${k}: the buttons are ${JSON.stringify(t.actions)}`)
      }
      if (tab.id === 'night') {
        if (!/^\d{1,3}% lit$/.test(t.value ?? '')) fail(`${k}: Night's value reads ${JSON.stringify(t.value)}`)
        if (!t.moon) fail(`${k}: tonight's moon is not drawn`)
        if (t.strip !== 14) fail(`${k}: ${t.strip} nights in the strip, not 14`)
        if (!t.full.includes('24')) fail(`${k}: FULL is not on the 24th (${JSON.stringify(t.full)})`)
        const m = b.moon
        if (m !== null && b.value !== null && m.left < b.value.right - 2 && m.top < b.value.bottom && m.bottom > b.value.top) fail(`${k}: the moon drawing sits over the big value`)
        if (m !== null && b.heroSub !== null && m.left < b.heroSub.right - 2 && m.top < b.heroSub.bottom && m.bottom > b.heroSub.top) fail(`${k}: the moon drawing sits over the line under the value`)
      }
    }

    /* The Viewfinder, from Tonight: the camera with the guides, then refused: the compass-only view. */
    await page.locator('.tipage.spage .tipage__tabs [role="tab"]', { hasText: /^Tonight$/ }).first().tap().catch(() => {})
    await wait(600)
    const vfOpened = await page.locator('.tipage.spage .tipage__btn', { hasText: 'Viewfinder' }).first().tap({ timeout: 4000 }).then(() => true, () => false)
    if (!vfOpened) fail(`${look.key}: no Viewfinder button on Tonight`)
    else {
      await wait(800)
      await page.getByRole('button', { name: /Open the camera/ }).tap({ timeout: 4000 }).catch(() => fail(`${look.key}: the Viewfinder did not offer to open the camera`))
      await wait(800)
      /* Upright, facing the sunset. */
      const az = getPosition(day.sunset, SPOT.lat, SPOT.lon).azimuth
      await ev(`window.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: 0, beta: 92, gamma: 0, webkitCompassHeading: ${az} }))`)
      await wait(800)
      const VF = `(() => { const v = document.querySelector('.vf'); if (!v) return null; const r = (e) => { const b = e?.getBoundingClientRect(); return b ? { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) } : null }; return { compass: v.querySelector('.vf__cnow')?.textContent ?? null, chips: [...v.querySelectorAll('.vf__pick')].map((b) => b.textContent), head: v.querySelector('.vf__head')?.textContent ?? null, dots: v.querySelectorAll('[data-sun-dot]').length, compassOnly: !!v.querySelector('[data-compass-only]'), video: !!v.querySelector('video'), retry: [...v.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Retry').length, strip: r(v.querySelector('.vf__compass')), bar: r(v.querySelector('.vf__bar')), text: v.innerText } })()`
      const live = await ev(VF)
      console.log(`  viewfinder: ${JSON.stringify({ ...live, text: undefined })}`)
      await page.screenshot({ path: join(OUT, `vf-live-${look.key}.png`) })
      if (live === null) fail(`${look.key}: the Viewfinder did not open`)
      else {
        looked += 1
        if (!/^▼ \d{1,3}° [NESW]{1,3}$/.test(live.compass ?? '')) fail(`${look.key}: the compass strip reads ${JSON.stringify(live.compass)}`)
        if (live.chips.join('|') !== 'Sun|Moon|Milky Way') fail(`${look.key}: the chips are ${JSON.stringify(live.chips)}`)
        if (!/^(Sun sets|Sun rises|Moon rises) (right there )?at \d{1,2}:\d\d [AP]M/.test(live.head ?? '')) fail(`${look.key}: the event's line reads ${JSON.stringify(live.head)}`)
        if (live.dots === 0) fail(`${look.key}: no sun dots on the picture facing the sunset`)
        if (live.strip !== null && live.strip.top < look.top) fail(`${look.key}: the compass strip is under the status bar`)
        if (live.bar !== null && live.bar.h > look.h / 4 + 40) fail(`${look.key}: the controls take ${live.bar.h} px`)
      }
      await page.locator('button[aria-label="Close the viewfinder"]').tap().catch(() => {})
      await wait(500)
      await ev(`window.__cam = 'refuse'`)
      await page.locator('.tipage.spage .tipage__btn', { hasText: 'Viewfinder' }).first().tap({ timeout: 4000 }).catch(() => {})
      await wait(600)
      await page.getByRole('button', { name: /Open the camera/ }).tap({ timeout: 4000 }).catch(() => {})
      await wait(800)
      const refused = await ev(VF)
      console.log(`  refused: ${JSON.stringify({ ...refused, text: undefined })}`)
      await page.screenshot({ path: join(OUT, `vf-compass-${look.key}.png`) })
      if (refused === null || !refused.compassOnly) fail(`${look.key}: a refused camera is not the compass-only view`)
      else {
        if (refused.video) fail(`${look.key}: the compass-only view still has a video element`)
        if (!/Camera access was not allowed/.test(refused.text) || refused.retry !== 1) fail(`${look.key}: the refusal is not one line with Retry`)
        if (refused.compass === null) fail(`${look.key}: the compass-only view has no compass strip`)
      }
      await page.locator('button[aria-label="Close the viewfinder"]').tap().catch(() => {})
      await wait(400)
    }
    /* More details on Tonight: the Sky color page, unchanged. */
    if (look.key === '390x844') {
      await page.locator('.tipage.spage .tipage__more').first().tap({ timeout: 4000 }).catch(() => fail('no More details on Tonight'))
      await wait(2500)
      if (!(await ev(`!!document.querySelector('.fire')`))) fail('More details on Tonight did not open the Sky color page (.fire)')
    }
    await ctx.close()
    watchdog.note(look.key)
  }
} finally {
  await browser.close()
}
watchdog.stop()
if (looked === 0) {
  console.log('=== SKY PAGE AUDIT ABORTED: nothing was looked at ===')
  process.exit(2)
}
console.log(`  looked at ${looked} tabs and viewfinders in ${LOOKS.length} sizes; screenshots: ${OUT}`)
console.log(`\n=== SKY PAGE PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
