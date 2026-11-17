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

/*
 * FETCHED WHILE THERE IS SIGNAL (Batch DRONE, Section 6.1). A page's code
 * was asked for the first time the page opened, which in a car is often
 * mid-drive: the offline walk's car profile (one request in ten dropped) and
 * switch profile showed "This page needs a signal" on the Tide, Surf and map
 * pages, and WebKit keeps a failed module load for the session. Now, once
 * the app has opened with signal, every page's code is asked for in the
 * background, one at a time (preloadPages, called by App), so opening a page
 * later asks nothing. A preload that fails is forgotten, not kept: the page
 * asks again when it opens. The 3D view is left out (three.js, asked only
 * when 3D is opened; { preload: false }).
 */
const PRELOADS: (() => Promise<unknown>)[] = []

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the same bound as React's own lazy()
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>, opts: { preload?: boolean } = {}) {
  let got: Promise<{ default: T }> | null = null
  const once = () => {
    got ??= load().catch((e: unknown) => {
      got = null
      throw e
    })
    return got
  }
  if (opts.preload !== false) PRELOADS.push(once)
  return lazy(() => orNotLoaded(once))
}

/** Asks for every page's code, one after another; resolves with how many arrived. */
export async function preloadPages(): Promise<number> {
  let n = 0
  for (const one of PRELOADS) {
    try {
      await one()
      n += 1
    } catch {
      /* Forgotten: that page asks again when it opens. */
    }
  }
  return n
}

/** How many pages are preloaded (tests). */
export const preloadCount = (): number => PRELOADS.length
