import { useSyncExternalStore } from 'react'
import type { WindDraw } from '../core/windStreaks.ts'

/*
 * STREAKS OR ARROWS on the wind map (Batch F, Section 3). Arrows draw once
 * and never animate: for a slow phone, and the default when the phone asks
 * for reduced motion. Kept on this phone (Settings › Map), shared by the map
 * and the setting through one small store.
 */
const KEY = 'scoutngo.windDraw.v1'
const listeners = new Set<() => void>()

function reducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function readWindDraw(): WindDraw {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'streaks' || v === 'arrows') return v
  } catch {
    /* Storage blocked: the default. */
  }
  return reducedMotion() ? 'arrows' : 'streaks'
}

export function writeWindDraw(v: WindDraw): void {
  try {
    localStorage.setItem(KEY, v)
  } catch {
    /* Not kept; this session still follows it. */
  }
  for (const l of listeners) l()
}

export function useWindDraw(): WindDraw {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    readWindDraw,
    () => 'streaks',
  )
}
