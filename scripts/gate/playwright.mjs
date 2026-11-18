/*
 * PLAYWRIGHT, BEHIND THE GATE'S FIXTURE PROXY WHEN THE GATE IS RUNNING.
 *
 * Every audit imports its browsers from here instead of from 'playwright'.
 * With SCOUTNGO_PROXY set (the gate sets it; scripts/gate/server.mjs), each
 * WebKit or Chromium launched goes out only through that proxy, which answers
 * from fixtures and never connects anywhere, and accepts the proxy's
 * throwaway certificate. Loopback is left direct. Without the variable this
 * is Playwright unchanged, so an audit run by hand behaves as before.
 *
 * A route an audit installs still answers first: Playwright handles routes in
 * the browser, before anything reaches the proxy.
 */
import * as pw from 'playwright'

export const devices = pw.devices
const PROXY = process.env.SCOUTNGO_PROXY ?? null
const proxied = (options = {}) => (PROXY === null ? options : { ...options, proxy: { server: PROXY, bypass: '127.0.0.1,localhost' } })
const trusting = (options = {}) => (PROXY === null ? options : { ...options, ignoreHTTPSErrors: true })

/*
 * Batch 3D, Section 0.1: 3D and Fly are a Settings › Labs switch, off by
 * default on an iPhone (src/core/lite3d.ts). The audits are the tester who
 * has switched it on: each context starts with it on unless the audit has
 * said otherwise (audit-menu.mjs checks the default).
 */
const labsOn = () => {
  try {
    if (localStorage.getItem('scoutngo.labs3d.v1') === null) localStorage.setItem('scoutngo.labs3d.v1', 'on')
  } catch {
    /* about:blank */
  }
}
async function withLabs(ctx) {
  await ctx.addInitScript(labsOn)
  return ctx
}

function wrapBrowser(browser) {
  const newContext = browser.newContext.bind(browser)
  const newPage = browser.newPage.bind(browser)
  browser.newContext = async (options) => withLabs(await newContext(trusting(options)))
  browser.newPage = async (options) => {
    const page = await newPage(trusting(options))
    await page.addInitScript(labsOn)
    return page
  }
  return browser
}

function wrapType(type) {
  return new Proxy(type, {
    get(target, prop) {
      if (prop === 'launch') return async (options) => wrapBrowser(await target.launch(proxied(options)))
      if (prop === 'launchPersistentContext') return async (dir, options) => withLabs(await target.launchPersistentContext(dir, trusting(proxied(options))))
      const v = target[prop]
      return typeof v === 'function' ? v.bind(target) : v
    },
  })
}

export const webkit = wrapType(pw.webkit)
export const chromium = wrapType(pw.chromium)
