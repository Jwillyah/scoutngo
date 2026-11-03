import type { LatLon } from '../core/geo.ts'
import { cellCalls, cellLine, CELL_REACH_KM, type CellCall } from '../core/stormCells.ts'
import { lightningLine, nearestStrike, STRIKE_REACH_KM, type Strike } from '../core/lightning.ts'
import { formatClock } from '../core/timezone.ts'
import { useState } from 'react'
import { useNowcast } from '../lib/stormData.ts'
import { showGuide } from '../lib/useBestView.ts'
import { RadarSlider } from './RadarSlider.tsx'
import type { Units } from '../lib/units.ts'

/*
 * THE NEXT 3 HOURS (Batch K, Section 2): storm cells on radar and where
 * they go, lightning, and the NWS alerts in force here. Facts with their
 * source and time; never what to do about them (ux-rules 28).
 */
export function Nowcast({ venue, timeZone, units }: { venue: LatLon; timeZone: string; units: Units }) {
  const now = useNowcast(venue, true)
  const [map, setMap] = useState(false)
  const dist = units.distance === 'ft' ? 'mi' : 'km'
  const reach = (km: number) => `${Math.round(dist === 'mi' ? km / 1.609344 : km)} ${dist}`
  const clock = (d: Date) => formatClock(d, timeZone)
  if (now === null) return <p className="fire__note">Reading the radar and lightning…</p>
  const calls = now.radar === null ? [] : cellCalls(venue, now.radar.tracks, now.radar.scanAt)
  const shown = calls.slice(0, 2)
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
      <div className="wx__nchead">
        <p className="wx__head">Next 3 hours{now.radar === null ? '' : <span className="num"> · radar {clock(now.radar.scanAt)}</span>}</p>
        {now.radar === null ? null : (
          <button type="button" className={`btn btn--small wx__map${map ? ' btn--on' : ''}`} aria-pressed={map} onClick={() => { if (map) showGuide({ type: 'FeatureCollection', features: [] }); setMap(!map) }}>
            Radar map
          </button>
        )}
      </div>
      {/* The bar only when there is something on it: a cell over you, or lightning within 30 km. */}
      {now.radar === null || !(calls.some((c) => c.over || c.arrives !== null) || (nearestStrike(venue, now.strikes ?? [])?.km ?? Infinity) <= 30) ? null : <NowStrip calls={calls} scanAt={now.radar.scanAt} strikes={now.strikes ?? []} venue={venue} />}
      {map && now.radar !== null ? <RadarSlider scanAt={now.radar.scanAt} calls={calls} strikes={now.strikes ?? []} timeZone={timeZone} /> : null}
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
      <p className="wx__line">{now.strikes === null ? 'Lightning map did not answer.' : bolt ?? `No lightning within ${reach(STRIKE_REACH_KM)} in the last hour.`}</p>
    </section>
  )
}

/**
 * The next 3 hours as one bar: a block where a cell is over you (from its
 * arrival, or now, to its end), a tick for the latest lightning within
 * 30 km at its frame's place in the past. Drawn from the same calls as the
 * lines under it.
 */
export function NowStrip({ calls, scanAt, strikes, venue }: { calls: readonly CellCall[]; scanAt: Date; strikes: readonly Strike[]; venue: LatLon }) {
  const span = 3 * 3_600_000
  const x = (t: Date) => Math.max(0, Math.min(100, ((t.getTime() - scanAt.getTime()) / span) * 100))
  const over = calls.filter((c) => c.over || c.arrives !== null)
  const near = nearestStrike(venue, strikes)
  const bolt = near !== null && near.km <= 30
  return (
    <div className="nstrip" role="img" aria-label={`Next 3 hours: ${over.length === 0 ? 'no cell over you on the radar\u2019s track' : `${over.length} cell${over.length === 1 ? '' : 's'} over you`}${bolt ? ', lightning within 30 km' : ''}`}>
      {over.map((c, i) => {
        const a = c.over ? scanAt : (c.arrives as Date)
        const b = c.ends ?? new Date(a.getTime() + 20 * 60_000)
        return <i key={i} className={`nstrip__cell nstrip__cell--${c.sure}`} style={{ left: `${x(a)}%`, width: `${Math.max(2, x(b) - x(a))}%` }} />
      })}
      {bolt ? <i className="nstrip__bolt" style={{ left: '0%' }} /> : null}
      <span className="nstrip__t num" style={{ left: '0%' }}>now</span>
      <span className="nstrip__t num" style={{ left: '33.3%' }}>+1 h</span>
      <span className="nstrip__t num" style={{ left: '66.6%' }}>+2 h</span>
    </div>
  )
}
