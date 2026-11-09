import { describe, expect, it } from 'vitest'
import { COPY_N, netCopyText, noteNet } from '../src/lib/netLog.ts'

/* Batch MAP2, Section 4: "Copy debug": the last 30 requests, host, status and time; no path, no coordinates. */
describe('copy debug', () => {
  it('gives host, status and ms for the last 30, newest first, and never a path', () => {
    const now = Date.parse('2026-11-09T20:00:00Z')
    for (let i = 0; i < 40; i += 1) noteNet({ at: now - (40 - i) * 1000, host: i % 2 ? 'this app' : 'api.open-meteo.com', path: `/14/4734/${6380 + i}.pbf`, status: i === 39 ? 'TypeError' : 200, ms: 100 + i })
    const text = netCopyText(now, 'device online · app online')
    const lines = text.split('\n')
    expect(lines[0]).toBe('device online · app online')
    expect(lines).toHaveLength(1 + COPY_N)
    expect(lines[1]).toBe('1s ago · this app · TypeError · 139 ms')
    expect(text).not.toMatch(/\/14\/|\.pbf|latitude|longitude|\d+\.\d{2,}/)
  })
})
