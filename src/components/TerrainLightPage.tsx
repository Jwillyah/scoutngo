import { useEffect, useMemo, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import type { HorizonInput } from '../core/skyWindow.ts'
import type { Special } from '../core/specialLight.ts'
import { alpenglow, ALPENGLOW_BELOW_DEG, skylineSun } from '../core/terrainLight.ts'
import { formatClock } from '../core/timezone.ts'
import { fetchSpecialWeek, specialsFrom } from '../lib/specialLightData.ts'
import { Page } from './Page.tsx'

/*
 * LAND › TERRAIN LIGHT (inland, field test 30 Oct): when the sun clears the
 * ridges and drops behind them, the alpenglow window, and the chance of
 * valley fog from the fog rule. The arithmetic is src/core/terrainLight.ts;
 * the fog is Special light's own rule and models, inland (no sea term).
 * Verdict first, then the times, method in the "i".
 */
interface Props {
  venue: LatLon
  at: Date
  timeZone: string
  horizon: HorizonInput
  /** Turns terrain on, when the skyline is flat for want of it: the message carries its control. */
  onTerrain?: () => void
  onJump?: (at: Date) => void
  onClose: () => void
}

const minutes = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 60_000)

export function TerrainLightPage({ venue, at, timeZone, horizon, onTerrain, onJump, onClose }: Props) {
  const clock = (d: Date) => formatClock(d, timeZone)
  const sun = useMemo(() => skylineSun(new Date(at.getTime()), venue.lat, venue.lon, horizon), [at, venue, horizon])
  const glow = useMemo(() => alpenglow(at, venue.lat, venue.lon), [at, venue])

  const key = `${venue.lat},${venue.lon}`
  const [fog, setFog] = useState<{ key: string; list: Special[] | null } | null>(null)
  useEffect(() => {
    let live = true
    void fetchSpecialWeek(venue).then((w) => {
      if (!live) return
      /* Inland: no sea term, so the rule is radiation fog. The next 24 hours. */
      const soon = w === null ? null : specialsFrom(w.week, venue, () => null).filter((s) => s.kind === 'fog' && s.to.getTime() > Date.now() && s.from.getTime() < Date.now() + 86_400_000)
      setFog({ key, list: soon })
    })
    return () => {
      live = false
    }
  }, [venue, key])
  const fogList = fog === null || fog.key !== key ? 'loading' : fog.list

  const flat = horizon.kind === 'flat'
  const riseLine =
    sun.ridgeRise === null || sun.flatRise === null
      ? 'The sun does not clear the skyline here today.'
      : flat
        ? `Sun up at ${clock(sun.ridgeRise)} over a level horizon.`
        : `Sun clears the ridge at ${clock(sun.ridgeRise)}, ${minutes(sun.ridgeRise, sun.flatRise)} min after a level sunrise.`
  const setLine =
    sun.ridgeSet === null || sun.flatSet === null
      ? null
      : flat
        ? `Sun down at ${clock(sun.ridgeSet)}.`
        : `Behind the ridge at ${clock(sun.ridgeSet)}, ${Math.max(0, minutes(sun.flatSet, sun.ridgeSet))} min before a level sunset.`

  return (
    <Page title="Terrain light" className="tlpage" onClose={onClose}>
      <p className="tlpage__verdict">{riseLine}</p>
      {setLine === null ? null : <p className="tlpage__line">{setLine}</p>}
      {flat ? (
        <p className="tlpage__note">
          No skyline yet: these are times over a level horizon.{' '}
          {onTerrain === undefined ? null : (
            <button type="button" className="btn btn--small" onClick={onTerrain}>
              Turn terrain on
            </button>
          )}
        </p>
      ) : null}
      <p className="tlpage__head">Alpenglow</p>
      <ul className="tlpage__list">
        {glow.morning === null ? null : (
          <li>
            <button type="button" className="tlpage__row" onClick={() => onJump?.(glow.morning!.from)}>
              Morning {clock(glow.morning.from)}–{clock(glow.morning.to)}
            </button>
          </li>
        )}
        {glow.evening === null ? null : (
          <li>
            <button type="button" className="tlpage__row" onClick={() => onJump?.(glow.evening!.from)}>
              Evening {clock(glow.evening.from)}–{clock(glow.evening.to)}
            </button>
          </li>
        )}
      </ul>
      <p className="tlpage__head">Valley fog, next 24 hours</p>
      {fogList === 'loading' ? (
        <p className="tlpage__note">Reading five forecasts…</p>
      ) : fogList === null ? (
        <p className="tlpage__note">The forecast did not arrive, so there is no fog line to give.</p>
      ) : fogList.length === 0 ? (
        <p className="tlpage__note">Not in the models by the fog rule. A rule, not a promise.</p>
      ) : (
        <ul className="tlpage__list">
          {fogList.map((s) => (
            <li key={s.from.getTime()}>
              <button type="button" className="tlpage__row" onClick={() => onJump?.(s.from)}>
                Valley fog {s.word} {clock(s.from)}–{clock(s.to)} · {s.agree} of {s.of} models
              </button>
            </li>
          ))}
        </ul>
      )}
      <details className="spec__how">
        <summary aria-label="How these are found">i</summary>
        <p>
          The sun's place is suncalc's; the skyline is the terrain's own, read from the elevation tiles along the sun's bearing, minute by minute. Alpenglow: the minutes the sun is 0° to {ALPENGLOW_BELOW_DEG}° below a level horizon, when high ground across the valley can still be lit and the ground at the venue is not; it says when, not that it will glow. Valley fog: Special light's fog rule with no sea term (dew point within 2°F of the air, wind under 6 kt) in five models.
        </p>
      </details>
    </Page>
  )
}
