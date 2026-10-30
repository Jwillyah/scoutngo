/*
 * /privacy, IN WEBKIT, AS A TAB AND STANDALONE.
 *
 * Usage:  node scripts/audit-privacy.mjs [screenshot-dir]
 *
 * From the home page's footer: "Privacy" opens /privacy. The three zeros, one
 * row per host in src/lib/hosts.ts with ALWAYS / ON PIN / IF YOU TAP, the
 * live check naming the hosts this browser asked (a weather request is made
 * from the page first, so there is one to name), Vercel's log retention,
 * Export and Clear. Nothing runs past 390 px but the table, in its own box;
 * nothing under the status bar. Close goes back to /.
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from 'playwright'
import { ensureApp, guardAudit, startWatchdog } from './preflight.mjs'
import { HOSTS } from '../src/lib/hosts.ts'

guardAudit('privacy')
const watchdog = startWatchdog('privacy', 240_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'privacy')
mkdirSync(OUT, { recursive: true })
await ensureApp()

let problems = 0
let looked = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

const browser = await webkit.launch()
try {
  for (const [label, insets] of [['browser', { top: 0, bottom: 0 }], ['standalone', { top: 47, bottom: 34 }]]) {
    console.log(`\n### ${label}`)
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
    /*
     * ONE REAL REQUEST, to Open-Meteo, left to the network: WebKit records no
     * resource timing for a request Playwright answers itself, so a fixture
     * would leave the live check nothing to see (checked 29 Oct). Everything
     * else outside is refused.
     */
    await ctx.route((u) => !u.href.startsWith('http://127.0.0.1:5173') && !/api\.open-meteo\.com/.test(u.href), (r) => r.abort())
    await ctx.addInitScript(([top, bottom]) => {
      const add = () => {
        const s = document.createElement('style')
        s.textContent = `:root{--safe-top:${top}px!important;--safe-bottom:${bottom}px!important}`
        document.head.appendChild(s)
      }
      if (document.head) add()
      else document.addEventListener('DOMContentLoaded', add)
    }, [insets.top, insets.bottom])
    const page = await ctx.newPage()
    const wait = (ms) => page.waitForTimeout(ms)
    const ev = (x) => page.evaluate(x)
    await page.goto('http://127.0.0.1:5173/')
    await wait(3000)
    /* One request off the phone, so the live check has something to name. */
    await ev(`fetch('https://api.open-meteo.com/v1/forecast?latitude=36.84&longitude=-75.97&hourly=wind_speed_10m&forecast_days=1').catch(() => null)`)
    await wait(800)
    const link = page.getByRole('button', { name: 'Privacy', exact: true })
    if ((await link.count()) === 0) fail(`${label}: no Privacy link in the home page's footer`)
    else await link.first().tap()
    await wait(1200)
    const at = await ev(`location.pathname`)
    const p = await ev(`(() => {
      const root = document.querySelector('.privacy')
      if (!root) return null
      const r = root.getBoundingClientRect()
      const head = root.querySelector('.page__head, header')?.getBoundingClientRect()
      return {
        zeros: [...root.querySelectorAll('.privacy__zeros li')].map((l) => l.textContent.trim()),
        rows: [...root.querySelectorAll('tr[data-host]')].map((t) => t.getAttribute('data-host')),
        whens: [...root.querySelectorAll('.privacy__when')].map((w) => w.textContent),
        seen: [...root.querySelectorAll('.privacy__seen li')].map((l) => l.textContent),
        text: root.textContent,
        pageWide: document.documentElement.scrollWidth > innerWidth + 1,
        outside: [...root.querySelectorAll('*')].filter((e) => !e.closest('.privacy__scroll')).some((e) => e.getBoundingClientRect().right > innerWidth + 1),
        headTop: head?.top ?? r.top,
        /* The table's box as tall as the table: a box squeezed by the page's column shows one cut row of 25. */
        clipped: (() => { const b = root.querySelector('.privacy__scroll'); const t = root.querySelector('.privacy__hosts'); return !b || !t ? true : b.getBoundingClientRect().height + 1 < t.getBoundingClientRect().height })(),
      }
    })()`)
    looked += 1
    console.log(`  at ${at}: ${p === null ? 'no page' : `${p.rows.length} rows, seen ${JSON.stringify(p.seen)}`}`)
    if (at !== '/privacy') fail(`${label}: the address is ${at}, not /privacy`)
    if (p === null) fail(`${label}: the privacy page did not open`)
    else {
      if (p.zeros.join('|') !== '0 accounts|0 trackers or cookies|0 server copies of your spots') fail(`${label}: the zeros read ${JSON.stringify(p.zeros)}`)
      if (p.rows.join('|') !== HOSTS.map((h) => h.host).join('|')) fail(`${label}: the rows are not src/lib/hosts.ts`)
      if (!p.whens.every((w) => ['ALWAYS', 'ON PIN', 'IF YOU TAP'].includes(w))) fail(`${label}: a row's when reads ${JSON.stringify(p.whens.find((w) => !['ALWAYS', 'ON PIN', 'IF YOU TAP'].includes(w)))}`)
      if (p.seen.length === 0) {
        console.log('=== PRIVACY AUDIT ABORTED: the live check saw no request at all (no network for the one real request?), so it could not be judged ===')
        process.exit(2)
      }
      if (!p.seen.some((s) => /^api\.open-meteo\.com · on the list$/.test(s))) fail(`${label}: the live check does not name the weather request it just saw: ${JSON.stringify(p.seen)}`)
      if (!/1 hour on Vercel’s Hobby plan and 1 day on Pro/.test(p.text)) fail(`${label}: no word on Vercel's request logs`)
      if (!/Export my spots/.test(p.text) || !/Clear this phone/.test(p.text)) fail(`${label}: Export or Clear is missing`)
      if (p.pageWide || p.outside) fail(`${label}: something outside the table runs past 390 px`)
      if (p.clipped) fail(`${label}: the hosts table is cut off: its box is shorter than the table`)
      if (p.headTop < insets.top) fail(`${label}: the page's head is under the status bar (${p.headTop})`)
    }
    await page.screenshot({ path: join(OUT, `privacy-${label}.png`) })
    await ev(`document.querySelector('.privacy__seen')?.scrollIntoView({ block: 'center' })`)
    await wait(300)
    await page.screenshot({ path: join(OUT, `privacy-live-${label}.png`) })
    await page.getByRole('button', { name: 'Close' }).first().tap().catch(() => {})
    await wait(800)
    const back = await ev(`location.pathname`)
    if (back === '/privacy' || (await ev(`!!document.querySelector('.privacy')`))) fail(`${label}: Close left the privacy page open (${back})`)
    await ctx.close()
    watchdog.note(label)
  }
} finally {
  await browser.close()
}
watchdog.stop()
if (looked === 0) {
  console.log('=== PRIVACY AUDIT ABORTED: nothing was looked at ===')
  process.exit(2)
}
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== PRIVACY PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
