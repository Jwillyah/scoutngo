/*
 * THIS PHONE'S 3D QUALITY AND MEMORY (Batch FIX, Section 0). The rules are
 * src/core/lite3d.ts and src/core/gpuBudget.ts; this keeps what is per device
 * (the earned step up, in localStorage) and the last count the 3D view made
 * (in memory, for Settings › Debug). No three.js here: Settings imports it.
 */
import { BUDGET_IOS_BYTES, keptStepped, QUALITY_KEY, quality3D, type Quality3D } from '../core/lite3d.ts'
import { isIOSDevice } from '../core/groundAtlas.ts'
import { memoryLine } from '../core/gpuBudget.ts'

export const onIOS = (): boolean => typeof navigator !== 'undefined' && isIOSDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0)

function stored(): string | null {
  try {
    return localStorage.getItem(QUALITY_KEY)
  } catch {
    return null
  }
}

/** The quality a 3D view opened now gets on this device. */
export const currentQuality = (): Quality3D => quality3D(onIOS(), keptStepped(stored()))

/** Kept on this phone: 'stepped' when a view earned it, 'lite' after a context loss while stepped. */
export function keepQuality(level: 'stepped' | 'lite'): void {
  try {
    localStorage.setItem(QUALITY_KEY, level)
  } catch {
    /* Storage blocked: lite next time, which is the safe side of memory. */
  }
}

/** The GPU cap on this device, or null (not an iPhone: no cap). */
export const gpuCap = (): number | null => (onIOS() ? BUDGET_IOS_BYTES : null)

export interface MemoryReading {
  bytes: number
  cap: number | null
  level: Quality3D['level']
  at: number
}

let last: MemoryReading | null = null
/** The largest count seen since the page loaded, for the five-and-ten-opens audit. */
let peak = 0

export function noteMemory(r: MemoryReading): void {
  last = r
  peak = Math.max(peak, r.bytes)
  const probe = globalThis as unknown as { __gpuMemory?: { bytes: number; peak: number; cap: number | null; level: string } }
  probe.__gpuMemory = { bytes: r.bytes, peak, cap: r.cap, level: r.level }
}

export const lastMemory = (): MemoryReading | null => last

/** Settings › Debug: "3D memory 82 MB of 150 · lite", or that 3D has not been opened since the app started. */
export function debugMemoryLine(r: MemoryReading | null = last): string {
  if (r === null) return '3D memory: not opened since the app started'
  return `${memoryLine(r.bytes, r.cap)} · ${r.level}`
}
