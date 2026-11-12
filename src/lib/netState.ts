import { connectivity } from './connectivity.ts'

/*
 * IS THERE A NETWORK? The names the rest of the app calls, answered in
 * src/lib/connectivity.ts. A file of their own (Batch Polish 2, Section 4):
 * the home's data needs these four lines and not the offline tile store
 * (src/lib/offlineCache.ts, which re-exports them).
 */
export const isOnline = (): boolean => connectivity.isOnline()

/** Every network call that can tell success from failure reports it here. */
export const reportNetwork = (ok: boolean): void => connectivity.report(ok)

export const onConnectivity = (listener: (online: boolean) => void): (() => void) => connectivity.onChange(listener)

/** For tests: forget what the network did. */
export const resetConnectivity = (): void => connectivity.reset()

/**
 * How long one tile may take before it is given up on: long enough for a slow
 * but working line to answer a 20 KB tile, short enough that a dead one costs
 * seconds rather than the browser's own timeout, which is minutes.
 */
export const TILE_TIMEOUT_MS = 8000
