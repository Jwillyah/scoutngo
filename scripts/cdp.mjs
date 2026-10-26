import { ensureApp, ensureBrowser, PreflightError } from './preflight.mjs'

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

  const response = await fetch('http://127.0.0.1:9222/json/list')
  if (!response.ok) {
    throw new PreflightError(`the browser's target list answered HTTP ${response.status}`)
  }
  const list = await response.json()
  const target = list.find((x) => x.type === 'page')
  if (target === undefined) {
    throw new PreflightError('the browser has no page target to attach to')
  }
  if (typeof target.webSocketDebuggerUrl !== 'string') {
    throw new PreflightError('the page target has no debugger URL')
  }
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
  const send = (m, q = {}) => new Promise((res) => { const i = ++id; p.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: q })) })
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
  const load = async (url = 'http://127.0.0.1:5173/?calibration=1') => { await send('Page.navigate', { url }); await wait(7000) }

  /*
   * Stop only what WE started. An audit run inside the commit hook finds the
   * app the hook started and leaves it for the next audit; an audit run on its
   * own starts one and takes it away again.
   */
  const dispose = async () => {
    try { ws.close() } catch { /* already closed */ }
    await browser.stop()
    await app.stop()
  }

  return { ws, send, ev, wait, shot, load, errs, onEvent, dispose, startedApp: app.started, startedBrowser: browser.started }
}
