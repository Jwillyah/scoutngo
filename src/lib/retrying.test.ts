import { afterEach, describe, expect, it, vi } from 'vitest'
import { RETRY_AFTER_MS, retrying } from './retrying.ts'

describe('retrying', () => {
  afterEach(() => vi.useRealTimers())

  it('asks again after a failure, and stops once answered', async () => {
    vi.useFakeTimers()
    const results = [false, false, true]
    const attempt = vi.fn(async () => results.shift() ?? true)
    retrying(attempt)
    await vi.advanceTimersByTimeAsync(0)
    expect(attempt).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(RETRY_AFTER_MS[0])
    expect(attempt).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(RETRY_AFTER_MS[1])
    expect(attempt).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(600_000)
    expect(attempt).toHaveBeenCalledTimes(3)
  })

  it('gives up after the last delay', async () => {
    vi.useFakeTimers()
    const attempt = vi.fn(async () => false)
    retrying(attempt)
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(attempt).toHaveBeenCalledTimes(1 + RETRY_AFTER_MS.length)
  })

  it('stopped, it never asks again', async () => {
    vi.useFakeTimers()
    const attempt = vi.fn(async () => false)
    const stop = retrying(attempt)
    await vi.advanceTimersByTimeAsync(0)
    stop()
    await vi.advanceTimersByTimeAsync(600_000)
    expect(attempt).toHaveBeenCalledTimes(1)
  })
})
