import { useState } from 'react'
import { compassPoint } from '../core/field.ts'
import { CRUISE_MPS, turnBack } from '../core/dronePlan.ts'
import { RESERVE_SHARE } from '../core/flight.ts'

/*
 * THE DRONE PAGE'S PLAN TAB (Batch DRONE, Section 2.4; board Drone_P4).
 * Renders, and holds the two inputs of the turn-back card; the arithmetic is
 * src/core/dronePlan.ts's, and its inputs are written on the card.
 *
 * Birds: no card. BirdCast's migration forecast is the only free public one,
 * and this app cannot check it here, so the card is left out rather than
 * made up (Batch DRONE, Section 2.4).
 */
export interface DronePlanData {
  /** The wind at 400 ft, or null when the forecast does not say. */
  wind: { fromDeg: number; mps: number } | null
  ratedMin: number
  tempC: number | null
  /** "47°F", for the cold-trim line. */
  tempWords: string | null
  speed: (mps: number) => string
  distanceUnit: 'ft' | 'm'
  sunAtHeight: { big: string; line: string }
  lens: { big: string; line: string }
  lensAir: { big: string; line: string }
  lastFlight: { big: string; line: string } | null
  /** Why there is no flight shown, or how to add one. */
  lastFlightNone: string
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
  const out = outDeg ?? Math.round(toward / 22.5) * 22.5
  const point = compassPoint
  const POINTS = Array.from({ length: 16 }, (_, i) => compassPoint(i * 22.5))
  const distWords = (m: number) => (data.distanceUnit === 'ft' ? `${Math.round((m / MI) * 100) / 100} mi` : `${Math.round(m / 100) / 10} km`)
  const t = data.wind === null ? null : turnBack({ distM, outDeg: out, windFromDeg: data.wind.fromDeg, windMps: data.wind.mps, ratedMin: data.ratedMin, tempC: data.tempC })
  const trimWords = (trim: number) => (trim <= 0 ? (data.tempC === null ? 'no temperature, no cold trim' : `${data.tempWords ?? ''} no cold trim`.trim()) : `${data.tempWords ?? ''} cold trims ${Math.round(trim * 100)}%`.trim())
  const headWords = (h: number) => (Math.abs(h) < 0.5 ? 'little wind along the line' : h > 0 ? `${data.speed(h)} headwind back` : `${data.speed(-h)} tailwind back`)
  const choices = (data.distanceUnit === 'ft' ? MILES.map((x) => x * MI) : KMS.map((x) => x * 1000))

  return (
    <>
      <section className="dcard drp__turn" aria-label="Turn back by">
        <p className="dcard__label">Turn back by · headwind home</p>
        {t === null ? (
          <p className="drp__none">The forecast did not give the wind at 400 ft, so there is nothing to work the way home from.</p>
        ) : t.kind === 'ok' ? (
          <>
            <p className="drp__turnbig">
              <span className="drp__pct num" data-turn={Math.round(t.turnPct)}>{Math.round(t.turnPct)}%</span>
              <span className="drp__turnwhy">battery, if you fly {distWords(distM)} {point(out)}</span>
            </p>
            <div className="drp__turnbar" aria-hidden="true">
              <i className="drp__turnout" style={{ flexBasis: `${t.outPct}%` }} />
              <i className="drp__turnback" style={{ flexBasis: `${t.turnPct - RESERVE_SHARE * 100}%` }} />
              <i className="drp__turnres" style={{ flexBasis: `${RESERVE_SHARE * 100}%` }} />
            </div>
            <p className="drp__turnline">
              {headWords(t.headBackMps)} · {trimWords(t.trim)} · {Math.floor(t.usableMin)} of {data.ratedMin} min
            </p>
          </>
        ) : t.kind === 'short' ? (
          <p className="drp__turnline" data-turn="short">
            Out {distWords(distM)} {point(out)} and back needs {Math.round(t.needPct)}% of the pack in this wind ({headWords(t.headBackMps)} · {trimWords(t.trim)}).
          </p>
        ) : (
          <p className="drp__turnline" data-turn="no-headway">
            At {data.speed(CRUISE_MPS)} cruise the drone makes no headway {t.leg === 'back' ? 'home' : 'out'} against {data.speed(data.wind?.mps ?? 0)} at 400 ft.
          </p>
        )}
        <div className="drp__inputs">
          <label className="drp__input">
            <span>Out</span>
            <select value={String(Math.round(distM))} onChange={(e) => setDistM(Number(e.target.value))}>
              {choices.map((m) => (
                <option key={m} value={String(Math.round(m))}>
                  {distWords(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="drp__input">
            <span>Toward</span>
            <select value={String(out)} onChange={(e) => setOutDeg(Number(e.target.value))}>
              {POINTS.map((p, i) => (
                <option key={p} value={String(i * 22.5)}>
                  {p}
                  {data.wind !== null && Math.abs(((i * 22.5 - toward + 540) % 360) - 180) < 11.25 ? ' (downwind)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="drp__inputsline">
          At {data.speed(CRUISE_MPS)} cruise, landing with {Math.round(RESERVE_SHARE * 100)}% left; climb, hover and descent not counted.
        </p>
      </section>

      <ul className="wtiles drp__tiles drp__plancards">
        <li className="wtile drp__tile">
          <span className="wtile__label">Sun at 400 ft</span>
          <span className="wtile__big num">{data.sunAtHeight.big}</span>
          <span className="wtile__line">{data.sunAtHeight.line}</span>
        </li>
        <li className="wtile drp__tile">
          <span className="wtile__label">Sun in the lens</span>
          <span className="wtile__big num">{data.lens.big}</span>
          <span className="wtile__line">{data.lens.line}</span>
        </li>
        <li className="wtile drp__tile">
          <span className="wtile__label">Lens and ice</span>
          <span className="wtile__big">{data.lensAir.big}</span>
          <span className="wtile__line">{data.lensAir.line}</span>
        </li>
      </ul>

      <section className="dcard drp__flight" aria-label="Your last flight here">
        <p className="dcard__label">Your last flight here · from your log, on this phone</p>
        {data.lastFlight === null ? (
          <p className="drp__none">{data.lastFlightNone}</p>
        ) : (
          <>
            <p className="drp__flightbig num">{data.lastFlight.big}</p>
            <p className="drp__flightline">{data.lastFlight.line}</p>
          </>
        )}
        {data.lastFlightError === null ? null : <p className="drp__flighterr">{data.lastFlightError}</p>}
        <div className="drp__flightbtns">
          <label className="btn drp__import">
            Import a flight log (CSV)
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
          {data.lastFlight === null ? null : (
            <button type="button" className="btn drp__forget" onClick={data.onForget}>
              Forget it
            </button>
          )}
        </div>
      </section>
    </>
  )
}
