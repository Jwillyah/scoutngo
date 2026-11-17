import { useState } from 'react'
import { compassPoint } from '../core/field.ts'
import { CRUISE_MPS, turnBack } from '../core/dronePlan.ts'
import { RESERVE_SHARE } from '../core/flight.ts'
import { DroneRows, type DroneRow } from './DroneNow.tsx'

/*
 * THE DRONE PAGE'S PLAN TAB (Batch DRONE, Section 2.4; Batch FIX, Section 6.5:
 * board Drone_Slim_4). Renders, and holds the two inputs of the turn-back
 * card; the arithmetic is src/core/dronePlan.ts's.
 *
 *   Turn back at   "34%", one line ("flying 0.8 mi SSW · 7 kt headwind
 *                  home"), the two pickers; how it is worked out behind ⓘ.
 *                  No three-part bar (it could not be read).
 *   four rows      Sun at 400 ft · Sun in lens · Lens fog · Last flight
 *
 * Birds: no row. BirdCast's migration forecast is the only free public one,
 * and this app cannot check it here, so it is left out rather than made up.
 */
export interface DronePlanData {
  /** The wind at 400 ft, or null when the forecast does not say. */
  wind: { fromDeg: number; mps: number } | null
  ratedMin: number
  tempC: number | null
  /** "47°F", for the cold-trim words. */
  tempWords: string | null
  speed: (mps: number) => string
  distanceUnit: 'ft' | 'm'
  sunAtHeight: { big: string; small: string }
  lens: { big: string; small: string }
  /** The lens fog word (src/core/dronePlan.ts lensFog), "Possible" in amber. */
  lensFog: { big: string; small: string | null; notice: boolean }
  /** Your last flight here, from your log, or null. */
  lastFlight: { big: string; small: string } | null
  /** Why no flight is shown when one is kept (it was elsewhere), or null. */
  lastFlightNone: string | null
  lastFlightError: string | null
  onImport: (file: File) => void
  onForget: () => void
}

const MI = 1609.344
/* The distances offered, metres: in miles for feet, in km for metres. */
const MILES = [0.25, 0.5, 0.8, 1, 1.5, 2]
const KMS = [0.4, 0.8, 1.2, 1.6, 2.4, 3.2]

export function DronePlanView({ data }: { data: DronePlanData }) {
  const toward = data.wind === null ? 0 : (data.wind.fromDeg + 180) % 360
  const [outDeg, setOutDeg] = useState<number | null>(null)
  const [distM, setDistM] = useState(0.8 * MI)
  const [why, setWhy] = useState(false)
  const out = outDeg ?? Math.round(toward / 22.5) * 22.5
  const point = compassPoint
  const POINTS = Array.from({ length: 16 }, (_, i) => compassPoint(i * 22.5))
  const distWords = (m: number) => (data.distanceUnit === 'ft' ? `${Math.round((m / MI) * 100) / 100} mi` : `${Math.round(m / 100) / 10} km`)
  const t = data.wind === null ? null : turnBack({ distM, outDeg: out, windFromDeg: data.wind.fromDeg, windMps: data.wind.mps, ratedMin: data.ratedMin, tempC: data.tempC })
  const trimWords = (trim: number) => (trim <= 0 ? (data.tempC === null ? 'no temperature, no cold trim' : `${data.tempWords ?? ''} no cold trim`.trim()) : `${data.tempWords ?? ''} cold trims ${Math.round(trim * 100)}%`.trim())
  const homeWords = (h: number) => (Math.abs(h) < 0.5 ? 'little wind home' : h > 0 ? `${data.speed(h)} headwind home` : `${data.speed(-h)} tailwind home`)
  const choices = data.distanceUnit === 'ft' ? MILES.map((x) => x * MI) : KMS.map((x) => x * 1000)

  const flightImport = (
    <label className="drp__rval drp__import">
      <b>{data.lastFlight === null ? 'Import a log ›' : 'Import another ›'}</b>
      <span className="drp__rsmall">on this phone</span>
      <input
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        className="drp__file"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f !== undefined) data.onImport(f)
          e.target.value = ''
        }}
      />
    </label>
  )
  const rows: DroneRow[] = [
    { key: 'sun400', label: 'Sun at 400 ft', big: data.sunAtHeight.big, small: data.sunAtHeight.small },
    { key: 'lens', label: 'Sun in lens', big: data.lens.big, small: data.lens.small },
    { key: 'fog', label: 'Lens fog', big: data.lensFog.big, small: data.lensFog.small, tone: data.lensFog.notice ? 'caution' : undefined },
    data.lastFlight === null
      ? { key: 'flight', label: 'Last flight', big: '', small: null, value: flightImport }
      : { key: 'flight', label: 'Last flight', big: data.lastFlight.big, small: data.lastFlight.small },
  ]

  return (
    <>
      <section className="dcard drp__turn" aria-label="Turn back at">
        <p className="dcard__label">Turn back at</p>
        {t === null ? (
          <p className="drp__none">The forecast did not give the wind at 400 ft, so there is nothing to work the way home from.</p>
        ) : t.kind === 'ok' ? (
          <p className="drp__turnbig">
            <span className="drp__pct num" data-turn={Math.round(t.turnPct)}>{Math.round(t.turnPct)}%</span>
            <span className="drp__turnwhy">
              flying {distWords(distM)} {point(out)} · {homeWords(t.headBackMps)}
            </span>
          </p>
        ) : t.kind === 'short' ? (
          <p className="drp__turnline" data-turn="short">
            Out {distWords(distM)} {point(out)} and back needs {Math.round(t.needPct)}% of the pack in this wind.
          </p>
        ) : (
          <p className="drp__turnline" data-turn="no-headway">
            At {data.speed(CRUISE_MPS)} cruise the drone makes no headway {t.leg === 'back' ? 'home' : 'out'} against {data.speed(data.wind?.mps ?? 0)} at 400 ft.
          </p>
        )}
        <div className="drp__inputs">
          <label className="drp__pick">
            <select value={String(Math.round(distM))} onChange={(e) => setDistM(Number(e.target.value))} aria-label="How far out">
              {choices.map((m) => (
                <option key={m} value={String(Math.round(m))}>
                  {distWords(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="drp__pick">
            <select value={String(out)} onChange={(e) => setOutDeg(Number(e.target.value))} aria-label="Toward">
              {POINTS.map((p, i) => (
                <option key={p} value={String(i * 22.5)}>
                  {p}
                  {data.wind !== null && Math.abs(((i * 22.5 - toward + 540) % 360) - 180) < 11.25 ? ' (downwind)' : ''}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="drp__info" aria-label="How the turn-back is worked out" aria-expanded={why} onClick={() => setWhy((w) => !w)}>
            i
          </button>
        </div>
        {why ? (
          <p className="drp__turnline" data-turn-why>
            {t !== null && t.kind !== 'no-headway' ? `${trimWords(t.trim)} · ` : ''}
            {t !== null && t.kind === 'ok' ? `${Math.floor(t.usableMin)} of ${data.ratedMin} min · ` : ''}
            out and straight back at {data.speed(CRUISE_MPS)} cruise in the wind at 400 ft, landing with {Math.round(RESERVE_SHARE * 100)}% left; climb, hover and descent not counted.
          </p>
        ) : null}
      </section>

      <DroneRows rows={rows} label="Sun, lens and your last flight" />
      {data.lastFlight === null ? null : (
        <div className="drp__flightbtns">
          {flightImport}
          <button type="button" className="btn drp__forget" onClick={data.onForget}>
            Forget it
          </button>
        </div>
      )}
      {data.lastFlightNone === null ? null : <p className="drp__flightline">{data.lastFlightNone}</p>}
      {data.lastFlightError === null ? null : <p className="drp__flighterr">{data.lastFlightError}</p>}
    </>
  )
}
