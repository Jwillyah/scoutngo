/*
 * NO AUDIT'S OWN NODE PROCESS REACHES ANOTHER HOST EITHER.
 *
 * Loaded into every audit the gate runs (node --import). The browsers are
 * behind the fixture proxy; this covers the other way out, a fetch from the
 * audit script itself. Loopback is allowed (the app, the browser's debugging
 * port, the proxy's ledger). Anything else is refused with an error naming
 * the host, and reported to the gate server's ledger so the network guard
 * fails the gate on it even if the audit swallowed the error.
 */
const realFetch = globalThis.fetch
const LOCAL = /^(127\.0\.0\.1|localhost|\[::1\])$/
const APP = process.env.SCOUTNGO_APP ?? 'http://127.0.0.1:5180'

globalThis.fetch = async (input, init) => {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  let host = ''
  try {
    host = new URL(href).hostname
  } catch {
    return realFetch(input, init)
  }
  if (LOCAL.test(host)) return realFetch(input, init)
  const who = (process.argv[1] ?? '?').split('/').pop()
  await realFetch(`${APP}/__gate/direct`, { method: 'POST', body: `${who} → ${href}` }).catch(() => {})
  throw new Error(`network guard: ${who} tried to reach ${host} from Node; the gate allows no live host`)
}
