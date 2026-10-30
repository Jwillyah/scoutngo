import { useEffect, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import { findLineups, lineupLine, LINEUP_TOLERANCE_DEG, sightOf } from '../core/lineup.ts'
import { horizonAngleAt, type HorizonInput } from '../core/skyWindow.ts'
import { compassPoint } from '../core/field.ts'
import { fetchBuildings } from '../lib/buildings.ts'

/*
 * LINE IT UP (src/core/lineup.ts): pick a thing on the map -- a pier end, a
 * lighthouse, a hotel -- and see when the sun or the moon rises or sets
 * behind it from where you stand, in the next twelve months, within half a
 * degree. Its bearing and height from the spot come first; a building's
 * height is read from the map's buildings (with a kept scan's, when there is
 * one) and can be typed over.
 */
interface Props {
  venue: LatLon
  target: LatLon | null
  picking: boolean
  onPickTarget: () => void
  onJump: (at: Date) => void
  clock: (at: Date) => string
  timeZone: string
  /** The visible horizon round the spot: the terrain's, or flat. */
  horizon?: HorizonInput
}

/** Whether the pin is inside a footprint ([lon, lat] ring). */
function inRing(ring: readonly [number, number][], at: LatLon): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i]
    const [bx, by] = ring[j]
    if (ay > at.lat !== by > at.lat && at.lon < ((bx - ax) * (at.lat - ay)) / (by - ay) + ax) inside = !inside
  }
  return inside
}

export function LineUp({ venue, target, picking, onPickTarget, onJump, clock, timeZone, horizon = { kind: 'flat' } }: Props) {
  const [name, setName] = useState('')
  const [typed, setTyped] = useState('')
  /* The building under the pin, its height from the map's buildings, keyed by the pin it was read for. */
  const pinKey = target === null ? null : `${target.lat.toFixed(6)},${target.lon.toFixed(6)}`
  const [found, setFound] = useState<{ key: string; metres: number | null } | null>(null)
  useEffect(() => {
    if (target === null || pinKey === null) return
    let live = true
    const d = 0.0006
    void fetchBuildings({ south: target.lat - d, north: target.lat + d, west: target.lon - d, east: target.lon + d }).then((r) => {
      if (!live) return
      const hit = r.status === 'ok' ? r.buildings.find((b) => inRing(b.ring, target)) : undefined
      setFound({ key: pinKey, metres: hit?.height.metres ?? null })
    })
    return () => {
      live = false
    }
  }, [target, pinKey])
  const building = found !== null && found.key === pinKey ? found.metres : null
  const typedM = Number(typed)
  const heightM = typed.trim() !== '' && typedM >= 0 ? typedM : building
  const thing = name.trim() === '' ? 'the pin' : name.trim()

  const sight = target === null ? null : sightOf(venue, target, heightM)
  const horizonDeg = sight === null ? 0 : horizonAngleAt(horizon, sight.bearing)
  const tLat = target?.lat ?? null
  const tLon = target?.lon ?? null
  /* From when the card opened: a search that moved with the clock would redo a year each render. */
  const [from] = useState(() => new Date())
  const vLat = venue.lat
  const vLon = venue.lon
  /* The React compiler keeps this for as long as its inputs hold, the thing, its height, the horizon and `from`. */
  const list = tLat === null || tLon === null ? null : findLineups({ observer: { lat: vLat, lon: vLon }, target: { lat: tLat, lon: tLon }, targetHeightM: heightM, horizonDeg, from })
  const when = (d: Date) => `${new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', day: 'numeric', month: 'short' }).format(d)} ${clock(d)}`

  return (
    <div className="skyc__finder lineup">
      <p className="skyc__head">Line up the sun or moon behind something</p>
      <div className="btn-row">
        <button type="button" className="btn btn--small" onClick={onPickTarget} aria-pressed={picking}>
          {picking ? 'Tap the thing on the map' : target === null ? 'Pick it on the map' : 'Move the pin'}
        </button>
      </div>
      {sight === null ? (
        <p className="skyc__note">Pick the pier end, the lighthouse or the hotel on the map.</p>
      ) : (
        <>
          <p className="lineup__sight num">
            {Math.round(sight.bearing)}° {compassPoint(sight.bearing)} · {sight.distanceM < 1000 ? `${Math.round(sight.distanceM)} m` : `${(sight.distanceM / 1000).toFixed(1)} km`} ·{' '}
            {heightM === null ? 'height not known' : `${Math.round(heightM)} m tall${typed.trim() === '' ? ' (map buildings)' : ''}`}
          </p>
          <div className="lineup__fields">
            <label className="field">
              <span className="field__label">What it is</span>
              <input className="input" value={name} placeholder="the pier end" onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">Height, m</span>
              <input className="input" inputMode="decimal" value={typed} placeholder={building === null ? '' : String(Math.round(building))} onChange={(e) => setTyped(e.target.value)} />
            </label>
          </div>
          <p className="skyc__note">
            Within {LINEUP_TOLERANCE_DEG}° of it, the next twelve months. The horizon there: {horizon.kind === 'flat' ? 'flat (terrain off)' : `${horizonDeg.toFixed(1)}° up, from the terrain`}.
          </p>
          {list === null || list.length === 0 ? (
            <p className="skyc__note">Neither the sun nor the moon lines up with it in the next twelve months.</p>
          ) : (
            <ul className="skyc__list">
              {list.map((l) => (
                <li key={`${l.body}-${l.at.getTime()}`}>
                  <button type="button" className="skyc__row lineup__row" onClick={() => onJump(l.at)}>
                    <span>{lineupLine(l, thing, when)}</span>
                    <span className="skyc__why num">
                      {l.offset >= 0 ? '+' : ''}
                      {l.offset.toFixed(1)}° off it
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
