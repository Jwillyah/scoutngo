import { ensureApp, ensureBrowser, PreflightError, APP_ORIGIN, CDP_ORIGIN } from './preflight.mjs'

/*
 * ONE WAY IN FOR EVERY BROWSER AUDIT, AND IT CHECKS IT CAN LOOK FIRST.
 *
 * This used to fetch the target list and read .webSocketDebuggerUrl straight
 * off the first page target. With no browser running that is a TypeError on
 * undefined, and with no app running every selector comes back empty, so an
 * audit reported nothing and the gate refused a clean commit with one red
 * line and no reason.
 *
 * ensureApp and ensureBrowser now start whatever is missing and throw a
 * sentence when they cannot, and guardAudit turns any throw into a stated
 * exit. See scripts/preflight.mjs.
 */
export async function connect() {
  const app = await ensureApp()
  const browser = await ensureBrowser()

  /*
   * A TAB OF ITS OWN, EVERY TIME, closed by dispose.
   *
   * This attached to the first page in the browser's list, which is whatever
   * tab the last script left behind. On 28 Oct a run of synthetic pinches
   * wedged that tab's touch input (dispatches succeeded, no touch event ever
   * arrived; mouse input still did, and a new tab took touches fine), and
   * the gate's sheet audit, run next in the same browser, reported 13 of 20
   * drags as moving the wrong thing in a build where none did. A check that
   * inherits another script's tab is pointed at that script's leftovers
   * (shape C in docs/failure-modes.md).
   */
  /*
   * AND A PROFILE OF ITS OWN (29 Oct 2026, Batch C2). The gate now runs audits
   * side by side in one Chrome, and tabs in one profile share localStorage:
   * the clock audit's 24 hour setting would be read by whichever audit ran
   * beside it. Each connection gets a fresh browser context, disposed with it.
   */
  const version = await fetch(`${CDP_ORIGIN}/json/version`).then((r) => r.json()).catch(() => null)
  if (typeof version?.webSocketDebuggerUrl !== 'string') throw new PreflightError('the browser gave no browser-level debugger URL')
  const bws = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise((r, j) => ((bws.onopen = r), (bws.onerror = () => j(new PreflightError('could not reach the browser target')))))
  let bid = 0
  const bp = new Map()
  bws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && bp.has(m.id)) {
      bp.get(m.id)(m)
      bp.delete(m.id)
    }
  }
  const bsend = (method, params = {}) => new Promise((res) => { const i = ++bid; bp.set(i, res); bws.send(JSON.stringify({ id: i, method, params })) })
  const browserContextId = (await bsend('Target.createBrowserContext', {})).result?.browserContextId
  if (typeof browserContextId !== 'string') throw new PreflightError('the browser would not make a fresh context')
  const created = await bsend('Target.createTarget', { url: 'about:blank', browserContextId })
  const targetId = created.result?.targetId
  if (typeof targetId !== 'string') {
    throw new PreflightError(`the browser would not open a tab: ${created.error?.message ?? 'no target id'}`)
  }
  const target = { id: targetId, type: 'page', webSocketDebuggerUrl: `${CDP_ORIGIN.replace(/^http/, 'ws')}/devtools/page/${targetId}` }
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 0; const p = new Map(); const errs = []
  /* Protocol events, for an audit that has to watch rather than ask (audit-3d-network.mjs). */
  const listeners = new Map()
  const onEvent = (method, fn) => listeners.set(method, [...(listeners.get(method) ?? []), fn])
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.method === 'Runtime.exceptionThrown') errs.push('EXC: ' + m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || '').split('\n')[0])
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 180))
    if (m.method && listeners.has(m.method)) for (const fn of listeners.get(m.method)) fn(m.params)
    if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id) }
  }
  /*
   * A DROPPED CONNECTION FAILS LOUDLY. It used to leave every pending send
   * unanswered, so Node exited on an "unsettled top-level await" with no
   * reason in the audit's output: the gate refused a commit and said nothing
   * about why (29 Oct, the gesture audit, a tab that went away mid-run).
   */
  let closed = null
  let disposing = false
  const dropAll = (why) => {
    if (disposing) return
    closed = why
    for (const [i, res] of p) {
      p.delete(i)
      res({ error: { message: why }, dropped: true })
    }
    console.log(`=== CDP CONNECTION LOST: ${why} ===`)
  }
  ws.onclose = (e) => dropAll(`the browser tab's connection closed (code ${e.code})`)
  ws.onerror = () => dropAll("the browser tab's connection failed")
  const send = (m, q = {}) => new Promise((res, rej) => {
    if (closed !== null) return rej(new PreflightError(`no browser connection: ${closed}`))
    const i = ++id
    p.set(i, (msg) => (msg.dropped ? rej(new PreflightError(`no browser connection: ${closed}`)) : res(msg)))
    ws.send(JSON.stringify({ id: i, method: m, params: q }))
  })
  const ev = async (x) => {
    const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })
    if (r.result?.exceptionDetails) return { ERR: (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text).split('\n')[0] }
    return r.result?.result?.value
  }
  const wait = (ms) => new Promise(r => setTimeout(r, ms))
  const shot = async (dir, n) => { const s = await send('Page.captureScreenshot', { format: 'png' }); const { writeFileSync } = await import('node:fs'); writeFileSync(`${dir}/${n}.png`, Buffer.from(s.result.data, 'base64')) }
  await send('Page.enable'); await send('Runtime.enable')
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  const load = async (url = `${APP_ORIGIN}/?calibration=1`) => { await send('Page.navigate', { url }); await wait(7000) }

  /*
   * Stop only what WE started. An audit run inside the commit hook finds the
   * app the hook started and leaves it for the next audit; an audit run on its
   * own starts one and takes it away again.
   */
  const dispose = async () => {
    disposing = true
    try { ws.close() } catch { /* already closed */ }
    try { await bsend('Target.disposeBrowserContext', { browserContextId }) } catch { /* the browser is going anyway */ }
    try { bws.close() } catch { /* already closed */ }
    await browser.stop()
    await app.stop()
  }

  return { ws, send, ev, wait, shot, load, errs, onEvent, dispose, startedApp: app.started, startedBrowser: browser.started }
}
