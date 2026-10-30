import { useEffect, useMemo, useRef, useState } from 'react'
import { getPosition } from 'suncalc'
import type { LatLon } from '../core/geo.ts'
import { lowestDeck } from '../core/metar.ts'
import { DECK_HEIGHT_M, fireVerdict, nextEvents } from '../core/skyFire.ts'
import {
  CLOCK_FROM_MIN,
  CLOCK_TO_MIN,
  clockWords,
  LAYER_WORD,
  lightHex,
  reachKm,
  strip,
  type Layer,
  type Strip,
} from '../core/skyColour.ts'
import { formatClock } from '../core/timezone.ts'
import { fetchAerosol, fetchFirePaths, fetchStationSkies, nearestHour, pathsAt, type FirePaths, type StationSky } from '../lib/skyFireData.ts'

/*
 * SKY › PREVIEW: what colour the clouds will go, minute by minute.
 *
 * Page 1 is the colour clock: for each layer the forecast has on the sun's
 * line, the colour of the sunlight reaching that cloud's base each minute
 * from 50 before to 40 after the event (src/core/skyColour.ts), and the words
 * computed from it. Sky fire's verdict sits on top: whether there is a canvas
 * at all is its question, what colour it goes is this one's.
 *
 * Pages 2 and 3 are waiting for the new 3D sky and say so. No picture is
 * drawn that the app cannot compute.
 */
interface Props {
  venue: LatLon
  timeZone: string
  at: Date
  now?: () => Date
}

type Kind = 'sunrise' | 'sunset'
const altitudeAt = (lat: number, lon: number) => (t: Date) => getPosition(t, lat, lon).altitude
const PAGES = ['Colour clock', 'Four forecasts', 'Week of skies'] as const

function StripRow({ s, clock }: { s: Strip; clock: (d: Date) => string }) {
  const n = s.minutes.length
  const zero = -CLOCK_FROM_MIN
  return (
    <div className="prev__row">
      <span className="prev__layer">
        {LAYER_WORD[s.layer]}
        <span className="prev__h num"> {Math.round(s.heightM / 100) / 10} km</span>
      </span>
      <svg className="prev__strip" viewBox={`0 0 ${n} 10`} preserveAspectRatio="none" role="img" aria-label={`${LAYER_WORD[s.layer]}: the colour of its light from ${clock(s.minutes[0].at)} to ${clock(s.minutes[n - 1].at)}`}>
        {s.minutes.map((m, i) => (
          <rect key={i} x={i} y={0} width={1.05} height={10} className={m.light === null ? 'prev__unlit' : undefined} fill={m.light === null ? undefined : lightHex(m.light)} />
        ))}
        <line x1={zero + 0.5} x2={zero + 0.5} y1={0} y2={10} className="prev__event" />
      </svg>
    </div>
  )
}

export function SkyPreview({ venue, timeZone, at, now = () => new Date() }: Props) {
  const events = useMemo(() => nextEvents(at, venue), [at, venue])
  const firstKind: Kind = events.sunrise !== null && (events.sunset === null || events.sunrise < events.sunset) ? 'sunrise' : 'sunset'
  const [kind, setKind] = useState<Kind>(firstKind)
  const event = events[kind]
  const azimuth = event === null ? null : getPosition(event, venue.lat, venue.lon).azimuth
  const date = event === null ? null : event.toISOString().slice(0, 10)
  const clock = (d: Date) => formatClock(d, timeZone)

  const askKey = azimuth === null || date === null || event === null ? null : `${venue.lat},${venue.lon},${azimuth.toFixed(1)},${date},${nearestHour(event)}`
  const [answer, setAnswer] = useState<{ key: string; paths: FirePaths | null; aod: number | null } | null>(null)
  useEffect(() => {
    if (azimuth === null || date === null || askKey === null || event === null) return
    let live = true
    void Promise.all([fetchFirePaths(venue, azimuth, date), fetchAerosol(venue, event)]).then(([paths, aod]) => {
      if (live) setAnswer({ key: askKey, paths, aod })
    })
    return () => {
      live = false
    }
  }, [venue, azimuth, date, askKey, event])
  const data = answer === null || answer.key !== askKey ? 'loading' : answer

  /* The low deck's base from the nearest station, in the two hours before: the forecast has cover, not heights. */
  const realNow = now()
  const soon = event !== null && event.getTime() - realNow.getTime() <= 2 * 3_600_000 && event.getTime() > realNow.getTime() - 30 * 60_000
  const [stations, setStations] = useState<StationSky[] | null>(null)
  useEffect(() => {
    if (!soon) return
    let live = true
    void fetchStationSkies(venue).then((s) => {
      if (live) setStations(s)
    })
    return () => {
      live = false
    }
  }, [soon, venue])
  const deck = soon && stations?.[0] !== undefined ? lowestDeck(stations[0].sky) : null
  const lowBaseM = deck === null || deck.baseFt >= 6500 ? null : deck.baseFt * 0.3048

  const paths = data === 'loading' || data.paths === null || event === null ? [] : pathsAt(data.paths, nearestHour(event))
  const verdict = paths.length === 0 ? null : fireVerdict(paths, lowBaseM)
  const best = paths.find((p) => p.model === 'best_match') ?? paths[0]
  /* Aerosol from Open-Meteo; when it did not answer, a clean-air 0.1 and the "i" says so. */
  const aod = data === 'loading' ? null : (data.aod ?? null)
  const strips = useMemo(() => {
    if (event === null || best === undefined) return []
    return (['high', 'mid', 'low'] as Layer[]).flatMap((layer) => {
      const heightM = layer === 'low' && lowBaseM !== null ? lowBaseM : DECK_HEIGHT_M[layer]
      const reach = reachKm(best, layer, heightM)
      return reach === null ? [] : [strip({ layer, heightM, reachKm: reach }, event, altitudeAt(venue.lat, venue.lon), aod ?? 0.1)]
    })
  }, [event, best, lowBaseM, aod, venue])

  const pager = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)

  return (
    <div className="prev">
      <div className="seg prev__kinds" role="group" aria-label="Which event">
        {(['sunrise', 'sunset'] as const).map((k) => (
          <button key={k} type="button" className={`seg__btn${kind === k ? ' seg__btn--on' : ''}`} aria-pressed={kind === k} disabled={events[k] === null} onClick={() => setKind(k)}>
            {k === 'sunrise' ? 'Sunrise' : 'Sunset'}
            {events[k] === null ? null : <span className="num"> {clock(events[k] as Date)}</span>}
          </button>
        ))}
      </div>

      <div
        className="prev__pages"
        ref={pager}
        data-sideways=""
        onScroll={(e) => {
          const el = e.currentTarget
          setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
        }}
      >
        <section className="prev__page" aria-label={PAGES[0]}>
          {event === null ? (
            <p className="prev__note">No {kind} here in the next two days.</p>
          ) : data === 'loading' ? (
            <p className="prev__note">Reading six forecasts along the sun’s line…</p>
          ) : verdict === null ? (
            <p className="prev__note">The forecast for the sun’s line did not arrive, so there is no colour to work out.</p>
          ) : (
            <>
              <p className={`prev__verdict fire__verdict--${verdict.word}`}>{verdict.line}</p>
              {strips.length === 0 ? (
                <p className="prev__note">No cloud on the sun’s line in the forecast: nothing to light.</p>
              ) : (
                <>
                  <p className="prev__words">{clockWords(strips, kind, clock)}</p>
                  <div className="prev__strips">
                    {strips.map((s) => (
                      <StripRow key={s.layer} s={s} clock={clock} />
                    ))}
                    <div className="prev__ticks num" aria-hidden="true">
                      <span>{clock(new Date(event.getTime() + CLOCK_FROM_MIN * 60_000))}</span>
                      <span className="prev__tick--event">{kind} {clock(event)}</span>
                      <span>{clock(new Date(event.getTime() + CLOCK_TO_MIN * 60_000))}</span>
                    </div>
                  </div>
                  <details className="prev__how">
                    <summary aria-label="How this is worked out">i</summary>
                    <p>
                      The colour of sunlight reaching each cloud’s base, each minute: the sun’s height with refraction, the cloud’s own horizon (it sees the sun sqrt(2h/R) below yours), the air along the light’s path, and how much blue that air and the haze take out. Haze: aerosol optical depth {aod === null ? '0.1, assumed (the air-quality forecast did not answer)' : `${aod.toFixed(2)} from Open-Meteo`}. Heights: {strips.map((s) => `${LAYER_WORD[s.layer]} ${Math.round(s.heightM)} m${s.layer === 'low' && lowBaseM !== null ? ` (${stations?.[0]?.sky.station ?? 'station'})` : ' (typical)'}`).join(', ')}. The lit cloud is the part toward the sun still above your horizon: {strips.map((s) => `${LAYER_WORD[s.layer]} ${s.reachKm} km`).join(', ')}. Not counted: ozone, the cloud’s own thickness, light from the rest of the sky.
                    </p>
                  </details>
                </>
              )}
            </>
          )}
        </section>
        {PAGES.slice(1).map((title) => (
          <section key={title} className="prev__page prev__page--soon" aria-label={title}>
            <p className="prev__title">{title}</p>
            <p className="prev__note">Coming with the new 3D sky.</p>
          </section>
        ))}
      </div>
      <div className="prev__dots" role="img" aria-label={`Page ${page + 1} of ${PAGES.length}: ${PAGES[page]}`}>
        {PAGES.map((p, i) => (
          <span key={p} className={`prev__dot${i === page ? ' prev__dot--on' : ''}`} />
        ))}
      </div>
    </div>
  )
}
