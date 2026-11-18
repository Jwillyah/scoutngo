import type { LatLon } from '../core/geo.ts'
import { tfrLine } from '../core/tfrLine.ts'
import { useTfrToday } from '../lib/useTfrToday.ts'

/*
 * THE ONE TFR LINE, AS A COMPONENT (Batch SIMPLE-1, Section 1): the same words
 * the Drone page says (src/core/tfrLine.ts), for screens that have a place and
 * no TFR data of their own. The venue's time zone; the phone's when none.
 */
export function TfrToday({ at, timeZone, now, className }: { at: LatLon | null; timeZone?: string; now?: Date; className?: string }) {
  const zone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const clock = now ?? new Date()
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(clock)
  const read = useTfrToday(at, iso, typeof navigator === 'undefined' ? true : navigator.onLine)
  return (
    <span className={className} data-tfr-line>
      {tfrLine(read, zone, clock)}
    </span>
  )
}
