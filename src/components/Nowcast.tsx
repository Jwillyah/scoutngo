import type { LatLon } from '../core/geo.ts'
import { cellCalls, cellLine, CELL_REACH_KM } from '../core/stormCells.ts'
import { lightningLine, stormOnMap, STRIKE_REACH_KM } from '../core/lightning.ts'
import { formatClock } from '../core/timezone.ts'
import { useNowcast } from '../lib/stormData.ts'
import { showGuide } from '../lib/useBestView.ts'
import type { Units } from '../lib/units.ts'

/*
 * THE NEXT 3 HOURS (Batch K, Section 2): storm cells on radar and where
 * they go, lightning, and the NWS alerts in force here. Facts with their
 * source and time; never what to do about them (ux-rules 28).
 */
export function Nowcast({ venue, timeZone, units }: { venue: LatLon; timeZone: string; units: Units }) {
  const now = useNowcast(venue, true)
  const dist = units.distance === 'ft' ? 'mi' : 'km'
  const reach = (km: number) => `${Math.round(dist === 'mi' ? km / 1.609344 : km)} ${dist}`
  const clock = (d: Date) => formatClock(d, timeZone)
  if (now === null) return <p className="fire__note">Reading the radar and lightning…</p>
  const calls = now.radar === null ? [] : cellCalls(venue, now.radar.tracks, now.radar.scanAt)
  const shown = calls.slice(0, 3)
  const bolt = now.strikes === null ? null : lightningLine(venue, now.strikes, dist, clock)
  return (
    <section className="wx__nowcast" aria-label="Next 3 hours">
      {now.alerts === null || now.alerts.length === 0 ? null : (
        <ul className="wx__alerts">
          {now.alerts.map((a) => (
            <li key={a.event + a.headline}>
              <details className="frow wx__alert">
                <summary>
                  <span className={/warning/i.test(a.event) ? 'wx__alert-ev wx__alert-ev--warn' : 'wx__alert-ev'}>{a.event}</span>
                  {a.ends === null ? null : <span className="num"> until {clock(a.ends)}</span>}
                </summary>
                <p className="fire__note">{a.headline}</p>
                <p className="fire__note wx__alert-text">{a.description}</p>
                <p className="fire__note">{a.sender}, as issued.</p>
              </details>
            </li>
          ))}
        </ul>
      )}
      <p className="wx__head">Next 3 hours{now.radar === null ? '' : <span className="num"> · radar {clock(now.radar.scanAt)}</span>}</p>
      {now.radar === null ? (
        <p className="fire__note">Radar did not answer: no cells said.</p>
      ) : shown.length === 0 ? (
        <p className="fire__note">No storm cells (40 dBZ or more) within {reach(CELL_REACH_KM)} on the {clock(now.radar.scanAt)} radar.</p>
      ) : (
        <ul className="wx__cells">
          {shown.map((c, i) => (
            <li key={i} className="wx__line num">{cellLine(c, { dist, clock })}</li>
          ))}
        </ul>
      )}
      <p className="wx__line">{now.strikes === null ? 'Lightning map did not answer.' : bolt ?? `No lightning within ${reach(STRIKE_REACH_KM)} on the last hour’s maps.`}</p>
      {(now.strikes?.length ?? 0) + calls.length === 0 ? null : (
        <button type="button" className="btn btn--small wx__map" onClick={() => showGuide(stormOnMap(now.strikes ?? [], calls, now.at))}>
          Show on map
        </button>
      )}
    </section>
  )
}
