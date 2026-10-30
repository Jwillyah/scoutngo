import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { getPosition } from 'suncalc'
import type { LatLon } from '../core/geo.ts'
import { disagreement, lowestDeck, skyWords } from '../core/metar.ts'
import {
  DECK_HEIGHT_M,
  fireVerdict,
  fireWindow,
  grazingKm,
  layersLine,
  LIT_UNTIL_DEG,
  MODEL_LABEL,
  modelsSplit,
  nextEvents,
  PATH_KM,
  type FireVerdict,
  type ModelChecks,
  type ModelPath,
} from '../core/skyFire.ts'
import { formatClock } from '../core/timezone.ts'
import { FIRST_ENTRY, OUTCOME_LABEL, readFireLog, trackRecord, withEntry, writeFireLog, type FireEntry, type FireOutcome } from '../lib/fireLog.ts'
import { TruthLoop } from './TruthLoop.tsx'
import { useWeatherBusy, useWeatherEpoch } from '../lib/useWeatherStatus.ts'
import { forecastAge } from '../lib/savedForecast.ts'
import { fetchFirePaths, fetchStationSkies, nearestHour, pathsAt, type FirePaths, type StationSky } from '../lib/skyFireData.ts'

/*
 * SKY FIRE: will the clouds light up at this sunrise or sunset. Words, the
 * three checks with their numbers and how many models agree, when to look,
 * and a side view drawn from the same numbers. The arithmetic is
 * src/core/skyFire.ts; this only draws it. Never certain, never a promise.
 */
interface SkyFireProps {
  venue: LatLon
  timeZone: string
  placeName: string
  /** The time on the bar: the next sunrise or sunset after it is the one asked about. */
  at: Date
  /** The real clock, injected for tests: "Sky right now" and the log are about now, not the bar. */
  now?: () => Date
  /** The colour clock, drawn right under the verdict (field test, 30 Oct: one page, verdict first). */
  clock?: ReactNode
}

type Kind = 'sunrise' | 'sunset'
const altitudeAt = (t: Date, lat: number, lon: number) => getPosition(t, lat, lon).altitude

function SideView({ verdict, path, kind }: { verdict: FireVerdict; path: ModelPath; kind: Kind }) {
  const best = verdict.checks.find((c) => c.model === 'best_match') ?? verdict.checks[0]
  const W = 320
  const H = 150
  const ground = 112
  const x = (km: number) => 34 + (km / 400) * (W - 58)
  /* Height on a square-root scale, so a deck at 1 km stands clear of the ground and one at 8 km still fits. */
  const y = (m: number) => ground - Math.sqrt(m / 9000) * (ground - 12)
  const decks = (['low', 'mid', 'high'] as const).flatMap((layer) =>
    PATH_KM.map((km, i) => ({ layer, km, cover: path.samples[i]?.[layer] ?? null }))
      .filter((s) => s.cover !== null && s.cover >= 50)
      .map((s) => ({ ...s, h: DECK_HEIGHT_M[s.layer] })),
  )
  const layersDrawn = [...new Set(decks.map((d) => d.layer))]
  const deck = best?.canvas.deck ?? null
  const deckH = deck === null ? null : DECK_HEIGHT_M[deck]
  const graze = deckH === null ? null : Math.min(400, grazingKm(deckH))
  return (
    <svg className="fire__side" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Side view toward the ${kind}: cloud decks from the forecast, and the light's path under them`}>
      <line x1={0} x2={W} y1={ground} y2={ground} className="fire__ground" />
      {layersDrawn.map((layer) => (
        <text key={layer} x={2} y={y(DECK_HEIGHT_M[layer]) + 3} className="fire__axis">
          {layer}
        </text>
      ))}
      {decks.map((d) => (
        <rect key={`${d.layer}-${d.km}`} x={x(d.km) - 11} y={y(d.h) - 4} width={22} height={8} rx={4} className={`fire__deck fire__deck--${d.layer}`} opacity={Math.min(1, 0.3 + (d.cover ?? 0) / 140)} />
      ))}
      {deckH === null || graze === null ? null : (
        <>
          {/* From the sun below the horizon, grazing the Earth, up under the deck overhead. */}
          <polyline points={`${W - 8},${ground + 10} ${x(graze)},${ground - 1} ${x(0)},${y(deckH) + 4}`} className="fire__ray" />
          <circle cx={W - 8} cy={ground + 10} r={6} className="fire__sun" />
        </>
      )}
      <circle cx={x(0)} cy={ground - 3} r={3} className="fire__you" />
      <text x={x(0)} y={ground + 13} className="fire__axis" textAnchor="middle">you</text>
      {[100, 200, 300].map((km) => (
        <text key={km} x={x(km)} y={ground + 13} className="fire__axis num" textAnchor="middle">
          {km} km
        </text>
      ))}
      <text x={W - 2} y={H - 3} className="fire__axis" textAnchor="end">
        toward the sun, below the horizon →
      </text>
    </svg>
  )
}

const yes = (pass: boolean) => (pass ? 'yes' : 'no')
function agreeOn(checks: readonly ModelChecks[], key: 'canvas' | 'gap' | 'notBlocked'): string {
  const named = checks.filter((c) => c.model !== 'best_match' && c.canvas.value !== null)
  return `${named.filter((c) => c[key].pass).length} of ${named.length}`
}

export function SkyFire({ venue, timeZone, placeName, at, now = () => new Date(), clock: colourClock }: SkyFireProps) {
  const events = useMemo(() => nextEvents(at, venue), [at, venue])
  const firstKind: Kind = events.sunrise !== null && (events.sunset === null || events.sunrise < events.sunset) ? 'sunrise' : 'sunset'
  const [kind, setKind] = useState<Kind>(firstKind)
  const event = events[kind]
  const azimuth = event === null ? null : getPosition(event, venue.lat, venue.lon).azimuth
  const date = event === null ? null : event.toISOString().slice(0, 10)

  /* Kept with the request it answers, so a new event reads as loading until its own answer comes. */
  const askKey = azimuth === null || date === null ? null : `${venue.lat},${venue.lon},${azimuth.toFixed(1)},${date}`
  const [answer, setAnswer] = useState<{ key: string; data: FirePaths | null } | null>(null)
  /* Asked again when a back-off ends (src/lib/weatherStore.ts). */
  const epoch = useWeatherEpoch()
  useEffect(() => {
    if (azimuth === null || date === null || askKey === null) return
    let live = true
    void fetchFirePaths(venue, azimuth, date).then((d) => {
      if (live) setAnswer({ key: askKey, data: d })
    })
    return () => {
      live = false
    }
  }, [venue, azimuth, date, askKey, epoch])
  const busy = useWeatherBusy()
  const data: FirePaths | null | 'loading' = answer === null || answer.key !== askKey ? 'loading' : answer.data

  /* Sky right now: only in the two hours before the event, from the nearest stations. */
  const realNow = now()
  const soon = event !== null && event.getTime() - realNow.getTime() <= 2 * 3_600_000 && event.getTime() > realNow.getTime() - 30 * 60_000
  const [stationAnswer, setStationAnswer] = useState<StationSky[] | null>(null)
  useEffect(() => {
    if (!soon) return
    let live = true
    void fetchStationSkies(venue).then((s) => {
      if (live) setStationAnswer(s)
    })
    return () => {
      live = false
    }
  }, [soon, venue])
  const stations = soon ? stationAnswer : null

  const deckBaseM = stations === null || stations[0] === undefined ? null : (() => {
    const d = lowestDeck(stations[0].sky)
    return d === null || d.baseFt >= 6500 ? null : d.baseFt * 0.3048
  })()
  const paths = data === 'loading' || data === null || event === null ? [] : pathsAt(data, nearestHour(event))
  const verdict = paths.length === 0 ? null : fireVerdict(paths, deckBaseM)
  const best = paths.find((p) => p.model === 'best_match') ?? paths[0]
  const overhead = best?.samples[0] ?? null
  const split = modelsSplit(paths.filter((p) => p.model !== 'best_match').map((p) => p.samples[0]?.low ?? null))
  const clock = (d: Date) => formatClock(d, timeZone)
  const bestChecks = verdict?.checks.find((c) => c.model === 'best_match') ?? verdict?.checks[0]
  const litDeck = bestChecks?.canvas.deck ?? null
  const watch = event === null || litDeck === null ? null : fireWindow(event, kind, litDeck, venue.lat, venue.lon, altitudeAt)

  /* The log: after the event, on its day, by the real clock. */
  const [log, setLog] = useState<FireEntry[]>(() => readFireLog())
  const [kept, setKept] = useState<string | null>(null)
  const after = event !== null && realNow.getTime() >= event.getTime() && realNow.getTime() - event.getTime() <= 6 * 3_600_000
  const logIt = (outcome: FireOutcome, photo: string | null) => {
    if (event === null) return
    const entry: FireEntry = {
      id: `${event.toISOString().slice(0, 10)}-${kind}-${placeName}`,
      date: new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(event),
      event: kind,
      place: placeName,
      outcome,
      forecast: verdict?.line ?? null,
      photo,
    }
    const next = withEntry(log, entry)
    setLog(next)
    setKept(writeFireLog(next) ? `Kept on this phone: ${OUTCOME_LABEL[outcome]}.` : 'Not kept: this phone\'s storage is full.')
  }
  const [outcome, setOutcome] = useState<FireOutcome | null>(null)
  const addPhoto = async (file: File | undefined) => {
    if (file === undefined || outcome === null) return
    try {
      const bitmap = await createImageBitmap(file)
      const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height))
      const c = document.createElement('canvas')
      c.width = Math.round(bitmap.width * scale)
      c.height = Math.round(bitmap.height * scale)
      c.getContext('2d')?.drawImage(bitmap, 0, 0, c.width, c.height)
      logIt(outcome, c.toDataURL('image/jpeg', 0.7))
    } catch {
      setKept('That photo could not be read; the entry is kept without it.')
    }
  }
  const record = trackRecord(log)

  return (
    <div className="fire">
      <div className="seg fire__kinds" role="group" aria-label="Which event">
        {(['sunrise', 'sunset'] as const).map((k) => (
          <button key={k} type="button" className={`seg__btn${kind === k ? ' seg__btn--on' : ''}`} aria-pressed={kind === k} disabled={events[k] === null} onClick={() => setKind(k)}>
            {k === 'sunrise' ? 'Sunrise' : 'Sunset'}
            {events[k] === null ? null : <span className="num"> {clock(events[k] as Date)}</span>}
          </button>
        ))}
      </div>

      {event === null ? (
        <p className="fire__note">No {kind} here in the next two days.</p>
      ) : data === 'loading' ? (
        <p className="fire__note">Asking six forecast models about the cloud toward the sun…</p>
      ) : verdict === null ? (
        <p className="fire__note">{data === null ? (busy ?? 'No forecast for this hour yet: the weather service did not answer. It is asked again when you come back.') : 'The forecast did not say: no cloud figures came back for this hour.'}</p>
      ) : (
        <>
          {data !== null && data.stale === true && data.fetchedAt !== undefined ? (
            <p className="fire__note">From the forecast of {forecastAge(new Date(data.fetchedAt ?? 0).toISOString()).text.replace(' old', ' ago')}: {busy ?? 'a newer one could not be had'}.</p>
          ) : null}
          <p className={`fire__verdict fire__verdict--${verdict.word}`} role="status">
            {verdict.line}
          </p>
          <p className="fire__note">
            {verdict.agree} of {verdict.of} models agree{split ? ' · models split on low cloud' : ''}. A forecast places cloud on a grid kilometres across: it cannot promise a hole.
          </p>
          {watch === null || litDeck === null ? null : (
            <p className="fire__note">
              {kind === 'sunrise'
                ? `Often before sunrise: look from ${clock(watch.from)}, when the sun is ${Math.abs(LIT_UNTIL_DEG[litDeck])}° below, until ${clock(watch.to)}.`
                : `Look from ${clock(watch.from)} until ${clock(watch.to)}, when the sun is ${Math.abs(LIT_UNTIL_DEG[litDeck])}° below: the colour lasts after sunset.`}
            </p>
          )}
          {colourClock}
          {/* The method one tap deeper (ux-rules 19): the three checks, the side view, each model. */}
          <details className="fire__why">
          <summary className="fire__head">Why: the three checks</summary>
          <table className="fire__checks num">
            <tbody>
              {bestChecks === undefined
                ? null
                : ([
                    ['Canvas', 'canvas'],
                    ['Gap toward the sun', 'gap'],
                    ['Not blocked', 'notBlocked'],
                  ] as const).map(([label, key]) => (
                    <tr key={key}>
                      <th scope="row">{label}</th>
                      <td className={`fire__mark fire__mark--${yes(bestChecks[key].pass)}`}>{yes(bestChecks[key].pass)}</td>
                      <td>{bestChecks[key].say}</td>
                      <td className="fire__agree">{agreeOn(verdict.checks, key)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
          {overhead === null ? null : <p className="fire__note">Overhead: {layersLine(overhead)} (best match)</p>}
          {best === undefined ? null : <SideView verdict={verdict} path={best} kind={kind} />}
          <details className="fire__more">
            <summary>Each model</summary>
            <ul className="fire__models num">
              {verdict.checks.map((c) => (
                <li key={c.model}>
                  {MODEL_LABEL[c.model]}: {c.fires ? 'fires' : 'does not'} · canvas {yes(c.canvas.pass)}, gap {yes(c.gap.pass)}, not blocked {yes(c.notBlocked.pass)}
                </li>
              ))}
            </ul>
          </details>
          </details>
        </>
      )}

      {!soon ? null : (
        <div className="fire__now">
          <p className="fire__head">Sky right now</p>
          {stations === null ? (
            <p className="fire__note">Asking the nearest stations…</p>
          ) : stations.length === 0 ? (
            <p className="fire__note">No station answered.</p>
          ) : (
            stations.map((s) => {
              const differs = disagreement(s.sky, overhead?.low ?? null)
              return (
                <p key={s.sky.station} className="fire__note">
                  {s.sky.station}: {skyWords(s.sky)}
                  {differs === null ? null : <span className="fire__differs"> · {differs}</span>}
                </p>
              )
            })
          )}
        </div>
      )}

      {!after ? null : (
        <div className="fire__log">
          <p className="fire__head">How was it?</p>
          <div className="btn-row">
            {(['fired', 'meh', 'nothing'] as const).map((o) => (
              <button key={o} type="button" className={`btn btn--small${outcome === o ? ' btn--on' : ''}`} aria-pressed={outcome === o} onClick={() => { setOutcome(o); logIt(o, null) }}>
                {OUTCOME_LABEL[o]}
              </button>
            ))}
          </div>
          {outcome === null ? null : (
            <label className="fire__photo">
              Add a photo (stays on this phone)
              <input type="file" accept="image/*" onChange={(e) => void addPhoto(e.target.files?.[0])} />
            </label>
          )}
          {kept === null ? null : <p className="fire__note">{kept}</p>}
        </div>
      )}

      <p className="fire__head">Your log</p>
      <p className="fire__note">
        {log.length} {log.length === 1 ? 'entry' : 'entries'}, kept on this phone only.
        {record.said === 0 ? '' : ` It fired ${record.fired} of ${record.said} times the forecast said possible or likely.`}
      </p>
      <ul className="fire__entries">
        {log.slice(0, 3).map((e) => (
          <li key={e.id}>
            {e.photo === null ? null : <img src={e.photo} alt="" className="fire__thumb" />}
            {e.date} {e.event} · {e.place}: {OUTCOME_LABEL[e.outcome]}
            {e.id === FIRST_ENTRY.id ? ' (entry #1)' : ''}
          </li>
        ))}
      </ul>

      {/* The truth loop: your photos against what the app said, and your hit rate (TruthLoop.tsx). */}
      <TruthLoop timeZone={timeZone} />
    </div>
  )
}
