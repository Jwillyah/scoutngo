import { lazy, type ComponentType } from 'react'
import { PageNotLoaded } from '../components/PageNotLoaded.tsx'
import { describe, recordError } from './errorLog.ts'

/**
 * React's lazy(), but a page whose code does not arrive (no signal, before the
 * phone kept it) shows "This page needs a signal · Back" and is logged
 * (Settings › Debug › Last errors), never a blank app. Batch CORE, Section 7A.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the same bound as React's own lazy()
export function orNotLoaded<T extends ComponentType<any>>(load: () => Promise<{ default: T }>): Promise<{ default: T }> {
  return load().catch((e: unknown) => {
    recordError('Page', describe(e))
    return { default: PageNotLoaded as unknown as T }
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the same bound as React's own lazy()
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() => orNotLoaded(load))
}
