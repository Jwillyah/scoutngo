/*
 * THE OFFLINE WALK (Batch CORE, Section 7A.1): every main screen under three
 * network profiles, for a saved spot. Steps for the shot harness (a WebKit
 * iPhone at 390 x 844, the built app behind the gate's fixture proxy):
 *
 *   offline  the app opened once with signal, then no network at all
 *   car      every request 400 ms late (the 400 ms round trip of a car on
 *            cellular) and one in ten dropped
 *   switch   Wi-Fi, then no network as a screen loads, then back
 *
 * Per screen: blank (under 20 characters of words), "NaN", dashes (counted,
 * not failed: a dash is this app's "not known"), a spinner or "Reading…"
 * still up after 10 s, and the page's uncaught errors. Prints one JSON line
 * per screen and profile; docs/batches/offline-walk.md is written from them.
 */
const SCREENS = [
  ['home', null],
  ['sky', '.hcard--sky'],
  ['tide', '.hcard--tide'],
  ['surf', '.hcard--surf'],
  ['weather', '.hwx__temp'],
  ['map', 'button[aria-label="Open the map"]'],
  ['best sky', ['.hcard--sky', '.spage__bestsky']],
]
export default async function ({ page, wait, shot, APP, look }) {
  const ctx = page.context()
  const errors = []
  /* WebKit reports a fetch the harness's interception broke ("due to access control checks") as a page error; counted apart, not as the app's. */
  const blocked = []
  page.on('pageerror', (e) => (/due to access control checks/.test(String(e)) ? blocked : errors).push(String(e).slice(0, 160)))
  const read = async () =>
    page.evaluate(() => {
      const t = document.body.innerText || ''
      return { words: t.replace(/\s+/g, ' ').trim().length, nan: (t.match(/\bNaN\b/g) ?? []).length, dashes: (t.match(/—/g) ?? []).length, spinner: /Reading |…$|Loading|Asking for/m.test(t), text: t.replace(/\s+/g, ' ').slice(0, 140) }
    })
  for (const profile of ['offline', 'car', 'switch']) {
    await ctx.setOffline(false)
    await page.unroute('**/*').catch(() => {})
    await page.goto(`${APP}/`)
    await wait(8000)
    if (profile === 'offline') await ctx.setOffline(true)
    if (profile === 'car') {
      let n = 0
      await page.route('**/*', async (r) => {
        n += 1
        await new Promise((d) => setTimeout(d, 400))
        if (n % 10 === 0 && !r.request().url().startsWith(APP)) return r.abort('failed')
        return r.continue()
      })
    }
    for (const [name, sel] of SCREENS) {
      errors.length = 0
      blocked.length = 0
      await page.goto(`${APP}/`).catch(() => {})
      if (profile === 'switch') {
        await ctx.setOffline(true)
        setTimeout(() => void ctx.setOffline(false), 2500)
      }
      await wait(4000)
      for (const one of sel === null ? [] : Array.isArray(sel) ? sel : [sel]) {
        await page.locator(one).first().click({ timeout: 6000 }).catch(() => errors.push(`could not open ${name} (${one})`))
        await wait(2500)
      }
      await wait(10_000)
      const r = await read().catch((e) => ({ words: 0, nan: 0, dashes: 0, spinner: false, text: `READ FAILED ${String(e).slice(0, 80)}` }))
      await shot(`walk-${profile}-${name}`)
      console.log(`WALK ${JSON.stringify({ look, profile, screen: name, ...r, errors: [...errors], blocked: blocked.length })}`)
    }
    await ctx.setOffline(false)
  }
}
