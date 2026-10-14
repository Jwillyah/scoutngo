export async function connect() {
  const list = await (await fetch('http://127.0.0.1:9222/json/list')).json()
  const target = list.find((x) => x.type === 'page')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 0; const p = new Map(); const errs = []
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.method === 'Runtime.exceptionThrown') errs.push('EXC: ' + m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || '').split('\n')[0])
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 180))
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
  return { ws, send, ev, wait, shot, load, errs }
}
