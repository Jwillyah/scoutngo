import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

/*
 * THE 3D VIEW NEVER WAITS FOREVER (Batch LIVE, Section 5.2; 14 Nov the 3D
 * view stood at "Loading the 3D view…" on an iPhone). The scene is built
 * once the kept scan is read (src/components/Clay3D.tsx); the read went
 * through an IndexedDB open with no timeout and a transaction with no catch
 * (src/lib/lidar/store.ts). WebKit can leave an open with no answer: the
 * scene was never built and nothing said so. Here both are replayed.
 */
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.resetModules()
})

describe('the kept scan read', () => {
  it('an IndexedDB open that never answers: "no scan" after IDB_OPEN_MS, not a promise left open', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('indexedDB', { open: () => ({}) })
    const { loadScan, IDB_OPEN_MS } = await import('../src/lib/lidar/store.ts')
    let got: unknown = 'waiting'
    void loadScan('x').then((v) => (got = v))
    await vi.advanceTimersByTimeAsync(IDB_OPEN_MS - 1)
    expect(got).toBe('waiting')
    await vi.advanceTimersByTimeAsync(2)
    expect(got).toBeNull()
  })
  it('a transaction that throws: "no scan", and scanContextAt answers null', async () => {
    const req: { result?: unknown; onsuccess?: () => void } = {}
    vi.stubGlobal('indexedDB', {
      open: () => {
        req.result = { transaction: () => { throw new Error('InvalidStateError') } }
        setTimeout(() => req.onsuccess?.(), 0)
        return req
      },
    })
    const { loadScan } = await import('../src/lib/lidar/store.ts')
    expect(await loadScan('x')).toBeNull()
    const { scanContextAt } = await import('../src/lib/lidar/useScan.ts')
    expect(await scanContextAt(36.84, -75.97)).toBeNull()
  })
})

describe('never a blank map', () => {
  it('the 3D view says "3D didn\'t load · Back to 2D" when not shown in 10 s, and builds without a scan that has not come in 4 s', async () => {
    const { CLAY_LOAD_MS } = await import('../src/lib/clayStatus.ts')
    expect(CLAY_LOAD_MS).toBe(10_000)
    const src = readFileSync('src/components/Clay3D.tsx', 'utf8')
    expect(src).toMatch(/setTimeout\(\(\) => setLate\(true\), CLAY_LOAD_MS\)/)
    expect(src).toMatch(/3D didn&rsquo;t load/)
    expect(src).toMatch(/Back to 2D/)
    expect(src).toMatch(/const SCAN_WAIT_MS = 4000/)
    expect(readFileSync('src/components/PlanMode.tsx', 'utf8')).toMatch(/onBack2D=\{\(\) => \{[\s\S]{0,400}setThreeD\(false\)/)
  })
})
