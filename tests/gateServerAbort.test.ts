/*
 * The gate's one server outlives a dropped request (scripts/gate/server.mjs).
 *
 * On 24 Nov a page aborted a request while the server was still reading its
 * body; the "aborted" error escaped the async handler, Node exited, and every
 * audit after it failed on ERR_CONNECTION_REFUSED (46 of 52, twice). This
 * starts the real server on ports of its own, drops a POST half-way through
 * its body, and asks the server for its ledger afterwards.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'

const APP = 5190
const PROXY = 5191
let server: ChildProcess | null = null
let log = ''

const up = async (): Promise<boolean> => {
  for (let i = 0; i < 100; i += 1) {
    const ok = await fetch(`http://127.0.0.1:${APP}/__gate/ledger`).then((r) => r.ok, () => false)
    if (ok) return true
    await new Promise((r) => setTimeout(r, 100))
  }
  return false
}

beforeAll(async () => {
  const dist = mkdtempSync(join(tmpdir(), 'gate-dist-'))
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>gate</title>')
  server = spawn(process.execPath, ['scripts/gate/server.mjs'], {
    env: { ...process.env, SCOUTNGO_GATE_APP_PORT: String(APP), SCOUTNGO_GATE_PROXY_PORT: String(PROXY), SCOUTNGO_GATE_DIST: dist },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout?.on('data', (d) => (log += String(d)))
  server.stderr?.on('data', (d) => (log += String(d)))
  expect(await up(), log).toBe(true)
}, 20_000)

afterAll(() => {
  server?.kill()
})

test('a POST dropped half-way through its body does not take the server down', async () => {
  await new Promise<void>((resolve) => {
    const s = connect(APP, '127.0.0.1', () => {
      s.write(`POST /__gate/direct HTTP/1.1\r\nHost: 127.0.0.1:${APP}\r\nContent-Type: text/plain\r\nContent-Length: 10000\r\n\r\nhalf a body`)
      setTimeout(() => {
        s.destroy()
        resolve()
      }, 100)
    })
  })
  await new Promise((r) => setTimeout(r, 400))
  expect(server?.exitCode, log).toBeNull()
  const res = await fetch(`http://127.0.0.1:${APP}/__gate/ledger`)
  expect(res.status).toBe(200)
  /* The drop is written down, not swallowed. */
  expect(log).toMatch(/gate app: POST \/__gate\/direct/)
})
