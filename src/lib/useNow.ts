import { useEffect, useState } from 'react'

/**
 * The current time, ticking.
 *
 * FIELD computes its light and its tide from NOW, not from where the scrubber
 * was left, so it needs a clock that moves. Thirty seconds is the interval: the
 * sun travels a quarter of a degree in that time, which cannot change a lighting
 * class on its own, and a faster tick would re-render the whole card for nothing
 * while the phone is trying to hold a GPS fix.
 *
 * Returns a Date, not a number, because everything downstream, getSunPosition
 * and tideStateAt, takes an instant.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs)
    /*
     * A phone in the background pauses the timer: back in front, the clock is
     * put right at once, not at the next tick (Batch FIX, Section 2.1: the
     * map's bar compared itself with last night's "now" after a resume).
     */
    const wake = () => {
      if (document.visibilityState === 'visible') setNow(new Date())
    }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('pageshow', wake)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('pageshow', wake)
    }
  }, [intervalMs])

  return now
}
