import type { LatLon } from '../core/geo.ts'
import { waterHead, waterSource, wetsuitWords, type WaterReading } from '../core/waterTemp.ts'
import { formatTemperature } from '../lib/units.ts'
import { useWaterTemp, type WaterState } from '../lib/waterTemp.ts'
import '../styles/water-line.css'

/*
 * "Water 58° · 4/3", and under it where from, how far, how old (Batch FIX,
 * Section 4). One reading for every screen (src/lib/waterTemp.ts); the words
 * are src/core/waterTemp.ts. Nothing while it is being asked: no
 * placeholder; "No water temp here" when nothing measured is near.
 */
interface Props {
  at: LatLon | null
  unit: 'F' | 'C'
  /** Distances in miles, else km. */
  miles: boolean
  /** The element's class (the screen's own line style). */
  className: string
  /** The source line too ("Sewells Point · 9 km · 20 min ago"); a card has room for the head alone. */
  source?: boolean
  /** A reading already in hand (the tests'); else the spot's is asked. */
  state?: WaterState
  /** Words before it when it rides on another line (" · " on the home card). */
  lead?: string
}

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const sourceOf = (r: WaterReading, kept: boolean, miles: boolean) => {
  const now = new Date()
  return `${waterSource(r, now, miles, localDay(now))}${kept ? ' · saved' : ''}`
}

export function WaterLine({ at, unit, miles, className, source = false, state, lead = '' }: Props) {
  const asked = useWaterTemp(state === undefined ? at : null)
  const s = state ?? asked
  if (s.status === 'loading') return null
  return (
    <span className={className} data-water={s.status === 'ok' ? s.reading.site.kind : 'none'}>
      {lead}
      {waterHead(s.status === 'ok' ? s.reading.c : null, unit)}
      {source && s.status === 'ok' ? <span className="waterline__from">{sourceOf(s.reading, s.kept, miles)}</span> : null}
    </span>
  )
}

/** The Tide page's Water tile: the number big, the suit and the source under it. */
export function WaterTile({ at, unit, miles, bigClass, lineClass, state }: { at: LatLon; unit: 'F' | 'C'; miles: boolean; bigClass: string; lineClass: string; state?: WaterState }) {
  const asked = useWaterTemp(state === undefined ? at : null)
  const s = state ?? asked
  const suit = s.status === 'ok' ? wetsuitWords(s.reading.c) : null
  return (
    <>
      <p className={bigClass} data-water={s.status === 'ok' ? s.reading.site.kind : s.status}>
        {s.status === 'ok' ? formatTemperature(s.reading.c, unit) : '—'}
      </p>
      <p className={lineClass}>
        {s.status === 'loading' ? 'asking the nearest stations' : s.status === 'none' ? 'No water temp here' : `${suit === null ? '' : `${suit} typical · `}${sourceOf(s.reading, s.kept, miles)}`}
      </p>
    </>
  )
}
