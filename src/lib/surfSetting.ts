import { useEffect, useState } from 'react'

/*
 * SETTINGS, SURF: Auto (the default: shown where the venue is within
 * SURF_COAST_M of the ocean), Always, or Off. Kept on this phone. Inland, on
 * Auto, the surf row never appears.
 */
export type SurfSetting = 'auto' | 'always' | 'off'
export const SURF_OPTIONS: readonly { id: SurfSetting; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'always', label: 'Always' },
  { id: 'off', label: 'Off' },
]
export const SURF_COAST_M = 2000
const KEY = 'scoutngo.surf.v1'
const EVENT = 'scoutngo:surf'

export function readSurfSetting(): SurfSetting {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'always' || v === 'off' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function writeSurfSetting(next: SurfSetting): void {
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* Not kept; this session still follows it. */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }))
}

export function useSurfSetting(): [SurfSetting, (next: SurfSetting) => void] {
  const [value, setValue] = useState<SurfSetting>(readSurfSetting)
  useEffect(() => {
    const on = (e: Event) => setValue((e as CustomEvent<SurfSetting>).detail)
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  return [value, writeSurfSetting]
}

/** Whether the surf row shows, given the setting and how far the sea is (null: not known yet or none in reach). */
export const showSurf = (setting: SurfSetting, metresToSea: number | null): boolean =>
  setting === 'always' || (setting === 'auto' && metresToSea !== null && metresToSea <= SURF_COAST_M)
