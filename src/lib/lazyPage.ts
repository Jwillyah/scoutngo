import { lazy, type ComponentType } from 'react'
import { PageNotLoaded } from '../components/PageNotLoaded.tsx'
import { describe, recordError } from './errorLog.ts'

/**
 * React's lazy(), but a page whose code does not arrive (no signal, before the
 * phone kept it) shows "This page needs a signal · Back" and is logged
 * (Settings › Debug › Last errors), never a blank app. Batch CORE, Section 7A.
 */
/*
 * ASKED AGAIN BEFORE IT GIVES UP (the offline walk after 7A, car profile: one
 * dropped request out of ten made the Tide page "need a signal" for the
 * session, since React keeps a lazy page's first answer). The code is asked
 * again after each of RETRY_MS; only when every try fails is the card shown.
 */
export const RETRY_MS: readonly number[] = [500, 1500, 4000]

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the same bound as React's own lazy()
export async function orNotLoaded<T extends ComponentType<any>>(load: () => Promise<{ default: T }>, waits: readonly number[] = RETRY_MS): Promise<{ default: T }> {
  let last: unknown = null
  for (let i = 0; i <= waits.length; i += 1) {
    try {
      return await load()
    } catch (e) {
      last = e
      if (i < waits.length) await new Promise((done) => setTimeout(done, waits[i]))
    }
  }
  recordError('Page', describe(last))
  return { default: PageNotLoaded as unknown as T }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the same bound as React's own lazy()
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() => orNotLoaded(load))
}
