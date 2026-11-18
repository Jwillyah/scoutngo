import { BUILD_ID } from './build.ts'

/*
 * THE LAST 20 ERRORS, ON THIS PHONE ONLY (Batch CORE, Section 2; Jwilly, 16
 * Nov: "so I can screenshot the real error next time"). Drone Fly failed on
 * the iPhone on 14 Nov and nothing on the Mac reproduced it; the message the
 * phone had was gone with the page. Every uncaught error, unhandled promise
 * rejection, screen crash (src/components/ScreenBoundary.tsx), lost graphics
 * context and load timeout is written here, in localStorage, so it survives
 * the page reloading. Settings › Debug › Last errors shows them. Nothing is
 * sent anywhere.
 *
 * A SCREEN IN USE WHEN THE PAGE DIED. iOS reloads a tab that ran out of
 * memory, and the app came back on the home (15 Nov, 3D). While 3D or Fly is
 * open a marker sits in sessionStorage (it survives that reload, not a closed
 * tab); found at start-up, it is logged and the app reopens on the map.
 */
export const ERROR_LOG_KEY = 'scoutngo.errors.v1'
export const ERROR_LOG_MAX = 20
const MSG_MAX = 300
/** Batch 3D, Section 0.4: the stack too, for Copy all; the top of it is what says where. */
const STACK_MAX = 1500
const OPEN_KEY = 'scoutngo.screenOpen.v1'
const EVENT = 'scoutngo:errors'

export interface LoggedError {
  /** ISO time. */
  at: string
  /** Which screen or source: "Fly", "3D", "Map", "Planner", "window", "promise". */
  where: string
  message: string
  build: string
  /** The error's stack when it had one (Batch 3D, Section 0.4); entries kept before then have none. */
  stack?: string
}

export function readErrors(): LoggedError[] {
  try {
    const v = JSON.parse(localStorage.getItem(ERROR_LOG_KEY) ?? '[]') as unknown
    return Array.isArray(v) ? (v.filter((e) => typeof e === 'object' && e !== null && typeof (e as LoggedError).message === 'string') as LoggedError[]) : []
  } catch {
    return []
  }
}

export function recordError(where: string, message: string, at: Date = new Date(), stack?: string): void {
  const entry: LoggedError = { at: at.toISOString(), where, message: message.slice(0, MSG_MAX), build: BUILD_ID, ...(stack === undefined || stack === '' ? {} : { stack: stack.slice(0, STACK_MAX) }) }
  try {
    const list = [...readErrors(), entry].slice(-ERROR_LOG_MAX)
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(list))
  } catch {
    /* Storage full or refused: nothing to keep it in. */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT))
}

export function clearErrors(): void {
  try {
    localStorage.removeItem(ERROR_LOG_KEY)
  } catch {
    /* Nothing kept. */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT))
}

export const onErrors = (f: () => void): (() => void) => {
  window.addEventListener(EVENT, f)
  return () => window.removeEventListener(EVENT, f)
}

export const describe = (e: unknown): string => (e instanceof Error ? `${e.name}: ${e.message}` : typeof e === 'string' ? e : (() => {
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
})())

/** An error's stack, or undefined (a thrown string, an object). */
export const stackOf = (e: unknown): string | undefined => (e instanceof Error && typeof e.stack === 'string' ? e.stack : undefined)

let installed = false
/** Uncaught errors and unhandled rejections, from start-up on (src/main.tsx). */
export function installErrorLog(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', (e) => {
    const where = e.filename ? `${e.filename.split('/').pop() ?? ''}:${e.lineno}` : ''
    recordError('window', `${describe(e.error ?? e.message)}${where === '' ? '' : ` (${where})`}`, new Date(), stackOf(e.error))
  })
  window.addEventListener('unhandledrejection', (e) => recordError('promise', describe(e.reason), new Date(), stackOf(e.reason)))
  /* A reload by hand or leaving the page fires pagehide; a tab iOS kills for memory does not, so its marker stays. */
  window.addEventListener('pagehide', () => markScreenOpen(null))
}

/** 3D or Fly is on screen now (null: neither), for the reload check. */
export function markScreenOpen(screen: '3D' | 'Fly' | null): void {
  try {
    if (screen === null) sessionStorage.removeItem(OPEN_KEY)
    else sessionStorage.setItem(OPEN_KEY, screen)
  } catch {
    /* No session storage: no reload check. */
  }
}

let atStart: '3D' | 'Fly' | null | undefined
/** The screen that was open when the page last died in this tab, read once at start-up and logged; null when none. */
export function diedIn(): '3D' | 'Fly' | null {
  if (atStart !== undefined) return atStart
  let v: string | null = null
  try {
    v = sessionStorage.getItem(OPEN_KEY)
    sessionStorage.removeItem(OPEN_KEY)
  } catch {
    v = null
  }
  atStart = v === '3D' || v === 'Fly' ? v : null
  if (atStart !== null) recordError(atStart, 'The page reloaded while this was open: most likely the phone ran out of memory and iOS reloaded the tab.')
  return atStart
}
