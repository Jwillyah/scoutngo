import { onConnectivity } from './offlineCache.ts'

/*
 * ASK AGAIN AFTER A FAILURE, BY ITSELF.
 *
 * Wind, cloud and the tide asked once. At Virginia Beach on 27 Oct one
 * answer that did not come could leave Wind and Cloud saying "no data" for
 * the rest of the hour, on five bars of 5G. Each source now retries on its
 * own, whatever the others are doing: after RETRY_AFTER_MS, and at once when
 * the network comes back (src/lib/connectivity.ts).
 */
export const RETRY_AFTER_MS: readonly number[] = [5_000, 20_000, 60_000]

/** When to try again after `failures` failures in a row, or null to stop. */
export const retryDelay = (failures: number): number | null =>
  failures < 1 ? null : (RETRY_AFTER_MS[failures - 1] ?? null)

/**
 * Runs `attempt` now and again after each failure. `attempt` resolves true
 * when it is finished (an answer, or a failure that asking again will not
 * change) and false to be retried. Returns the stop, for an effect's cleanup.
 */
export function retrying(attempt: () => Promise<boolean>, schedule: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout } = globalThis): () => void {
  let stopped = false
  let failures = 0
  let busy = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let off: () => void = () => {}
  const go = async () => {
    if (stopped || busy) return
    if (timer !== null) schedule.clearTimeout(timer)
    timer = null
    busy = true
    const done = await attempt()
    busy = false
    if (stopped) return
    if (done) {
      off()
      return
    }
    failures += 1
    const delay = retryDelay(failures)
    if (delay !== null) timer = schedule.setTimeout(() => void go(), delay)
  }
  off = onConnectivity((online) => {
    if (online && failures > 0) void go()
  })
  void go()
  return () => {
    stopped = true
    if (timer !== null) schedule.clearTimeout(timer)
    off()
  }
}
