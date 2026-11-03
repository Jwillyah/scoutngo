import type { LatLon } from '../core/geo.ts'
import { cellCalls, cellLine } from '../core/stormCells.ts'
import { shooterLines } from '../core/shooterStorm.ts'
import { stormLine } from '../core/stormRisk.ts'
import { formatClock, formatShortHour } from '../core/timezone.ts'
import { useNowcast } from '../lib/stormData.ts'
import { noteStorm, useStormRisk } from '../lib/stormRiskData.ts'
import type { Units } from '../lib/units.ts'

/*
 * STORMS ON TODAY AND TOMORROW (Batch K, Section 4): at most two lines,
 * the one that matters most first, as a row that opens Sky › Weather. Today:
 * a shooter line (clearing light, a rainbow, a shelf, lightning after dark),
 * else the nearest arriving cell, else the models' storm line; tomorrow: the
 * storm line and the rain odds. Nothing at all when there is nothing: never
 * "no storms", which reads as a promise.
 */
export function StormBrief({ venue, timeZone, units, which, onOpen }: { venue: LatLon; timeZone: string; units: Units; which: 'today' | 'tomorrow'; onOpen?: () => void }) {
  const risk = useStormRisk(venue, timeZone, true)
  const now = useNowcast(venue, which === 'today')
  const clock = (d: Date) => formatClock(d, timeZone)
  const hour = (d: Date) => formatShortHour(d, timeZone)
  const dist = units.distance === 'ft' ? 'mi' : 'km'
  const day = risk?.days.find((d) => d.word === which) ?? null
  const lines: string[] = []
  if (which === 'today' && now?.radar != null) {
    const calls = cellCalls(venue, now.radar.tracks, now.radar.scanAt)
    lines.push(...shooterLines(venue, calls, now.strikes ?? [], now.radar.scanAt, clock, dist))
    const coming = calls.find((c) => c.over || c.arrives !== null)
    if (coming !== undefined) lines.push(cellLine(coming, { dist, clock }))
  }
  const storm = day === null ? null : stormLine(day.storm, hour, which)
  if (storm !== null) lines.push(storm)
  if (which === 'today') noteStorm(lines[0] ?? null)
  if (lines.length === 0) return null
  return (
    <button type="button" className="bview bstorm" onClick={onOpen}>
      {lines.slice(0, 2).map((l) => (
        <span key={l} className="bstorm__line">{l}</span>
      ))}
    </button>
  )
}
