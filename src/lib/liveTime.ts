/*
 * THE TIME UNDER THE NEEDLE, AS THE FINGER MOVES IT: published by the time
 * bar every time the ruler moves, read by what has to follow in the same
 * frame (the shadows on the map) without waiting for the whole plan to
 * render the new time. The plan still renders it, a beat later, as a
 * transition (TimeBar.tsx); this is the fast path beside it, not a second
 * source for the time: it carries the same number, sooner.
 */
type Listener = (at: number) => void

const listeners = new Set<Listener>()

export function publishLiveTime(at: number): void {
  for (const listener of listeners) listener(at)
}

export function onLiveTime(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
