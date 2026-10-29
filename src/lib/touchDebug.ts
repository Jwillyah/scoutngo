import { useEffect, useState, useSyncExternalStore } from 'react'

/*
 * DEBUG TOUCH: what a pinch does, on the phone, in words.
 *
 * WHY. Pinch zoom passed every emulated check and still snapped on a real
 * iPhone (29 Oct). The difference is in what only iOS Safari does, which no
 * desktop browser shows, so the phone has to say it: how many fingers are
 * down, Safari's own gesture events and their scale, the map's zoom every
 * frame, and every camera write the app makes, tagged by who made it.
 *
 * OFF BY DEFAULT. On with ?debug=touch for one load, or Settings › Debug
 * touch, which is kept on this phone like any other setting. The log lives
 * in memory and leaves only by the Copy button, into your own clipboard.
 * Nothing is sent anywhere.
 */
const KEY = 'scoutngo.debugTouch.v1'
const EVENT = 'scoutngo:debug-touch'
const MAX_LINES = 600

function fromAddress(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('debug') === 'touch'
  } catch {
    return false
  }
}

export function readTouchDebug(): boolean {
  if (typeof window === 'undefined') return false
  if (fromAddress()) return true
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function writeTouchDebug(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    /* Not kept; this session still follows it. */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: on }))
}

export function useTouchDebug(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(readTouchDebug)
  useEffect(() => {
    const changed = () => setOn(readTouchDebug())
    window.addEventListener(EVENT, changed)
    return () => window.removeEventListener(EVENT, changed)
  }, [])
  return [on, writeTouchDebug]
}

/* ------------------------------------------------------------------ the log */

export interface TouchDebugState {
  fingers: number
  /** Safari's own pinch scale, from gesturechange; null outside a gesture. */
  scale: number | null
  zoom: number | null
  lines: readonly string[]
}

let state: TouchDebugState = { fingers: 0, scale: null, zoom: null, lines: [] }
const listeners = new Set<() => void>()
const began = typeof performance === 'undefined' ? 0 : performance.now()
let pending = false

function emit(): void {
  /* One React update per frame at most, however many lines a frame logs. */
  if (pending) return
  pending = true
  const flush = () => {
    pending = false
    for (const listener of listeners) listener()
  }
  if (typeof requestAnimationFrame === 'undefined') flush()
  else requestAnimationFrame(flush)
}

export function logTouch(line: string): void {
  const t = ((performance.now() - began) / 1000).toFixed(3)
  const lines = state.lines.length >= MAX_LINES ? state.lines.slice(-(MAX_LINES - 1)) : state.lines.slice()
  lines.push(`${t} ${line}`)
  state = { ...state, lines }
  emit()
}

export function setTouchState(next: Partial<Omit<TouchDebugState, 'lines'>>): void {
  state = { ...state, ...next }
  emit()
}

export function clearTouchLog(): void {
  state = { ...state, lines: [] }
  emit()
}

/** The log as it stands, for the overlay's Copy and for tests. */
export const touchLogLines = (): readonly string[] => state.lines

export function useTouchLog(): TouchDebugState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
    () => state,
  )
}

/* ------------------------------------------------------ who moved the camera */

let caller: string | null = null

/** Runs a camera move with a tag naming who asked for it, so the log can say. */
export function asCaller<T>(tag: string, run: () => T): T {
  const was = caller
  caller = tag
  try {
    return run()
  } finally {
    caller = was
  }
}

/** The camera methods a write can come through. Each is wrapped, when debugging, to log its caller. */
export const CAMERA_METHODS = [
  'jumpTo',
  'easeTo',
  'flyTo',
  'fitBounds',
  'setZoom',
  'setCenter',
  'zoomTo',
  'panBy',
  'panTo',
  'setBearing',
  'setPitch',
  'setPadding',
  'resize',
  'stop',
] as const

interface CameraLike {
  getZoom(): number
  on(type: string, listener: (event: { originalEvent?: unknown }) => void): unknown
  off(type: string, listener: (event: { originalEvent?: unknown }) => void): unknown
}

const fmt = (z: number) => z.toFixed(3)

/**
 * Wraps the map's camera methods and listens to its element, while debugging.
 * Returns the undo. A camera write with no tag says "untagged": that is the
 * finding, a write that does not go through the app's own guard.
 */
export function instrumentMap(map: CameraLike, element: HTMLElement): () => void {
  const target = map as unknown as Record<string, unknown>
  const originals = new Map<string, unknown>()
  for (const name of CAMERA_METHODS) {
    const original = target[name]
    if (typeof original !== 'function') continue
    originals.set(name, original)
    target[name] = function (this: unknown, ...args: unknown[]) {
      const before = map.getZoom()
      const result = (original as (...a: unknown[]) => unknown).apply(this, args)
      logTouch(`${name} by ${caller ?? 'untagged'} · zoom ${fmt(before)} → ${fmt(map.getZoom())} · fingers ${state.fingers}`)
      return result
    }
  }

  /*
   * ON THE WINDOW, CAPTURING, so a touch is logged before the map's own
   * listeners act on it: a camera write released by a lift then reads after
   * the lift that released it. Touches outside the map are not logged.
   */
  const onTouch = (event: TouchEvent) => {
    if (!(event.target instanceof Node) || !element.contains(event.target)) return
    setTouchState({ fingers: event.touches.length })
    logTouch(`${event.type} · fingers ${event.touches.length}`)
  }
  const onGesture = (event: Event) => {
    const scale = (event as Event & { scale?: number }).scale ?? null
    setTouchState({ scale: event.type === 'gestureend' ? null : scale })
    logTouch(`${event.type} · scale ${scale === null ? '—' : scale.toFixed(3)} · default prevented ${event.defaultPrevented}`)
  }
  const onMove = (event: { originalEvent?: unknown }) => {
    const zoom = map.getZoom()
    setTouchState({ zoom })
    logTouch(`zoom ${fmt(zoom)} · ${event.originalEvent === undefined ? 'app' : 'user'}`)
  }
  const viewport = typeof window === 'undefined' ? undefined : window.visualViewport
  const onViewport = () => {
    const v = viewport
    logTouch(`visualViewport resize · ${v ? `${Math.round(v.width)}x${Math.round(v.height)} scale ${v.scale.toFixed(3)}` : '—'}`)
  }

  const touchRoot = typeof window === 'undefined' ? null : window
  for (const type of ['touchstart', 'touchend', 'touchcancel'] as const) touchRoot?.addEventListener(type, onTouch, { capture: true, passive: true })
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) element.addEventListener(type, onGesture, { capture: true, passive: true })
  map.on('move', onMove)
  viewport?.addEventListener('resize', onViewport)
  logTouch('debug touch on')

  return () => {
    for (const [name, original] of originals) target[name] = original
    for (const type of ['touchstart', 'touchend', 'touchcancel'] as const) touchRoot?.removeEventListener(type, onTouch, { capture: true })
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) element.removeEventListener(type, onGesture, { capture: true })
    map.off('move', onMove)
    viewport?.removeEventListener('resize', onViewport)
  }
}
