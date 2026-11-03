import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { getPosition } from 'suncalc'
import type { LatLon } from '../core/geo.ts'
import { disagreement, layersWords, skyWords } from '../core/metar.ts'
import { cloudTriple, eventToLog, layersLine, MODEL_LABEL, modelsSplit, nextEvents } from '../core/skyFire.ts'
import { agreementLine, checkWords, fireVerdict, leadLayer, lookWindow, meanPath, verdictSentence, WHY_WORDS } from '../core/fireOutlook.ts'
import { FireSideView } from './FireSideView.tsx'
import { LAYER_WORD, type Layer } from '../core/skyColour.ts'
import { LOG_FOR_H } from '../core/skyFire.ts'
import { layerWords } from '../core/layerTruth.ts'
import { useSkyObs } from '../lib/useSkyObs.ts'
import { eventCall } from '../core/briefing.ts'
import { litUntilDeg } from '../core/underLight.ts'
import { showGuide, useBestView } from '../lib/useBestView.ts'
import { bestViewOnMap } from '../core/bestView.ts'
import { formatClock } from '../core/timezone.ts'
import { FIRST_ENTRY, OUTCOME_LABEL, readFireLog, trackRecord, withEntry, writeFireLog, type FireEntry, type FireOutcome } from '../lib/fireLog.ts'
import { TruthLoop } from './TruthLoop.tsx'
import { useOnline } from '../lib/useOnline.ts'
import { useStationNow } from '../lib/useStationNow.ts'
import { useWeatherBusy, useWeatherEpoch } from '../lib/useWeatherStatus.ts'
import { forecastAge } from '../lib/savedForecast.ts'
import { fetchAerosol, fetchFirePaths, fetchStationSkies, nearestHour, pathsAt, type FirePaths, type StationSky } from '../lib/skyFireData.ts'
import type { LatLon as Pin } from '../core/geo.ts'

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
  /** The colour clock for the event picked here, drawn right under the verdict (field test, 30 Oct: one page, verdict first). */
  clock?: (kind: 'sunrise' | 'sunset', show?: 'strip' | 'compare') => ReactNode
  /** The map pin, for "Pick on map" when a photo has no place in it (the truth loop). */
  target?: Pin | null
  onPickTarget?: () => void
}

type Kind = 'sunrise' | 'sunset'

const dayMonth = (d: Date, timeZone: string) => new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short' }).format(d)

export function SkyFire({ venue, timeZone, placeName, at, now = () => new Date(), clock: colourClock, target, onPickTarget }: SkyFireProps) {
  const events = useMemo(() => nextEvents(at, venue), [at, venue])
  const firstKind: Kind = events.sunrise !== null && (events.sunset === null || events.sunrise < events.sunset) ? 'sunrise' : 'sunset'
  const [kind, setKind] = useState<Kind>(firstKind)
  const event = events[kind]
  const azimuth = event === null ? null : getPosition(event, venue.lat, venue.lon).azimuth
  const date = event === null ? null : event.toISOString().slice(0, 10)

  /* Kept with the request it answers, so a new event reads as loading until its own answer comes. */
  const askKey = azimuth === null || date === null ? null : `${venue.lat},${venue.lon},${azimuth.toFixed(1)},${date}`
  const [answer, setAnswer] = useState<{ key: string; data: FirePaths | null; aod: number | null } | null>(null)
  /* Asked again when a back-off ends (src/lib/weatherStore.ts). The haze too: the colour clock's own question, asked once between them. */
  const epoch = useWeatherEpoch()
  useEffect(() => {
    if (azimuth === null || date === null || askKey === null || event === null) return
    let live = true
    void Promise.all([fetchFirePaths(venue, azimuth, date), fetchAerosol(venue, event)]).then(([d, aod]) => {
      if (live) setAnswer({ key: askKey, data: d, aod })
    })
    return () => {
      live = false
    }
  }, [venue, azimuth, date, askKey, epoch, event])
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

  /* The station's report within two hours of the event: its low deck over you, its base, or the low gap open (src/core/fireOutlook.ts). */
  const station = stations?.[0] !== undefined && stations[0].at !== '' ? { sky: stations[0].sky, at: new Date(stations[0].at) } : null
  const paths = data === 'loading' || data === null || event === null ? [] : pathsAt(data, nearestHour(event))
  const aod = answer === null || answer.key !== askKey ? null : answer.aod
  /* One source of truth: the same walk of the light as the colour clock under it. */
  const verdict = paths.length === 0 || event === null ? null : fireVerdict(paths, { event, kind, venue, aod, station })
  const best = paths.find((p) => p.model === 'best_match') ?? paths[0]
  const overhead = best?.samples[0] ?? null
  const split = modelsSplit(paths.filter((p) => p.model !== 'best_match').map((p) => p.samples[0]?.low ?? null))
  const clock = (d: Date) => formatClock(d, timeZone)
  const lead = verdict === null ? null : leadLayer(verdict)
  const watch = verdict === null ? null : lookWindow(verdict)
  /* Batch J: the observations before the event name the deck by its real height ("mid deck (12k or higher)", never the models' "cirrus" for it). */
  const obs = useSkyObs(venue, event, stations?.[0] === undefined ? null : { id: stations[0].sky.station, sky: stations[0].sky }, lead?.layer ?? null, realNow)
  const name = (l: Layer) => layerWords(l, obs?.truth ?? null, LAYER_WORD)
  /* Within the hour, a reported deck and an open gap are the call, and time the colour from under (Batch J, Sections 2-3): the same as Today. */
  const seen = obs === null || event === null || verdict === null ? null : eventCall(verdict, kind, event, realNow, null, { venue, truth: obs.truth, gap: obs.gap })
  const byStations = seen !== null && seen.call === 'Go' && seen.peak != null
  /* Batch J, Section 5: the best view tonight, a tap draws the wedge and the spots on the map. */
  const view = useBestView(event === null ? null : venue, event)
  /* How vivid (Batch J, Section 4): the air, the 31 runs, contrails. */
  const vividLine = obs === null ? '' : [obs.vivid.air === null ? null : `Air: ${obs.vivid.air.line}`, obs.vivid.runs?.line ?? null, obs.vivid.contrails ? 'contrails may streak the sky' : null].filter((x) => x !== null).join(' · ')

  /*
   * THE LOG, BY THE REAL CLOCK (item 6): from 50 minutes before a sunrise or
   * sunset to 3 hours after, else the last one earlier today; one tap saves.
   */
  const [log, setLog] = useState<FireEntry[]>(() => readFireLog())
  const [kept, setKept] = useState<string | null>(null)
  const toLog = eventToLog(realNow, venue, timeZone)
  const logIt = (outcome: FireOutcome, photo: string | null) => {
    if (toLog === null) return
    const day = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(toLog.at)
    const entry: FireEntry = {
      id: `${day}-${toLog.kind}-${placeName}`,
      date: day,
      event: toLog.kind,
      place: placeName,
      outcome,
      /* What the page said for that event, when it is the one on it. */
      forecast: event !== null && Math.abs(event.getTime() - toLog.at.getTime()) < 60_000 ? (verdict?.line ?? null) : null,
      photo,
    }
    const next = withEntry(log, entry)
    setLog(next)
    setKept(writeFireLog(next) ? `Logged: ${dayMonth(toLog.at, timeZone)} ${toLog.kind} · ${OUTCOME_LABEL[outcome]}` : 'Not kept: this phone\'s storage is full.')
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
  /* Within two hours of now, what the station sees leads the page; the forecast is under it (Batch E, 1 Nov). */
  const online = useOnline()
  const stationNow = useStationNow(venue, at, online)

  /*
   * THE LOG: at the top from the moment of sunrise or sunset to 3 h after,
   * and the last one later that day (item 6); in the 50 minutes before it,
   * below with the photos (Section 4), as the page is still the forecast's.
   */
  /* Batch J, Section 8: on top only in the 3 h after its event; later in the day it is a row away, so the rows and the Viewfinder stay on the first screen. */
  const logOnTop = toLog !== null && realNow.getTime() >= toLog.at.getTime() && realNow.getTime() - toLog.at.getTime() <= LOG_FOR_H * 3_600_000
  const logBlock =
    toLog === null ? null : (
      <div className="fire__log" aria-label="How was it">
        <p className="fire__head">
          How was the {toLog.kind}, {dayMonth(toLog.at, timeZone)}?
        </p>
        <div className="btn-row">
          {(['fired', 'meh', 'nothing'] as const).map((o) => (
            <button key={o} type="button" className={`btn btn--small${outcome === o ? ' btn--on' : ''}`} aria-pressed={outcome === o} onClick={() => { setOutcome(o); logIt(o, null) }}>
              {OUTCOME_LABEL[o]}
            </button>
          ))}
        </div>
        {kept === null ? null : <p className="fire__note fire__kept" role="status">{kept}</p>}
        {outcome === null ? null : (
          <label className="fire__photo">
            Add a photo (stays on this phone)
            <input type="file" accept="image/*" onChange={(e) => void addPhoto(e.target.files?.[0])} />
          </label>
        )}
      </div>
    )
  const mean = meanPath(paths)
  /* Sky right now, one line: the nearest station near now, else the stations asked in the two hours before. */
  const nowLine =
    stationNow !== null
      ? `${stationNow.sky.station}${stationNow.at === '' ? '' : ` ${clock(new Date(stationNow.at))}`}: ${layersWords(stationNow.sky)}`
      : stations !== null && stations[0] !== undefined
        ? `${stations[0].sky.station}: ${skyWords(stations[0].sky)}`
        : soon && stations === null
          ? 'asking the nearest stations…'
          : null
  const checks = lead === null ? [] : ([
    ['Canvas', 'canvas', lead.canvas ? 'yes' : 'no'],
    ['Gap', 'gap', lead.gap === 'open' ? 'yes' : lead.gap === 'partial' ? 'partly' : 'no'],
    ['Not blocked', 'notBlocked', lead.hiddenBy === null ? 'yes' : 'no'],
  ] as const)

  return (
    <div className="fire">
      {logOnTop ? logBlock : null}

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
          {/*
            * ONE SCREEN (Batch I, Section 3; board "BATCH I · Sky fire on one
            * screen"): the verdict big, its best and deepest time, how many
            * models agree; the side view; the strip with the three checks.
            * Everything else is a row away.
            */}
          <div className="fire__top">
            <p className={`fire__big fire__verdict--${byStations ? 'likely' : verdict.word}`} role="status">
              {byStations ? 'Fire likely' : verdict.word === 'unlikely' ? 'Fire unlikely' : `Fire ${verdict.word}`}
            </p>
            <span className="fire__chip num">
              {byStations ? 'stations' : `${verdict.agree} of ${verdict.of}`}
            </span>
          </div>
          <p className="fire__when num">
            {byStations && seen?.colorFrom != null && seen.colorTo != null && seen.peak != null
              ? `Best ${clock(seen.colorFrom)}–${clock(seen.colorTo)} · deepest ${clock(seen.peak)}`
              : verdict.word === 'unlikely' ? verdictSentence(verdict, clock, name).replace(/^Fire unlikely: /, '').replace(/^./, (c) => c.toUpperCase()) : watch === null ? verdictSentence(verdict, clock, name) : `Best ${clock(watch.from)}–${clock(watch.to)}${lead?.times?.deepest == null ? '' : ` · deepest ${clock(lead.times.deepest)}`}`}
          </p>
          {obs?.gap.state == null ? null : <p className="fire__gap">{obs.gap.line}</p>}
          {view === null || verdict.word === 'unlikely' ? null : (
            <button type="button" className="bview bview--fire-one" onClick={() => showGuide(bestViewOnMap(venue, view))}>
              {view.line}
            </button>
          )}
          {colourClock?.(kind, 'strip')}
          {lead === null ? null : (
            <ul className="fire__checks fire__checks--icons" aria-label={`The three checks, ${name(lead.layer)}`}>
              {checks.map(([label, key, said]) => (
                <li key={key} className={`fire__check fire__check--${said === 'partly' ? 'part' : said}`}>
                  <CheckIcon kind={key} />
                  <span className="fire__check-name">{label}</span>
                  <span className="fire__mark">{said}</span>
                </li>
              ))}
            </ul>
          )}
          <details className="frow">
            <summary>Compare the 5 forecasts</summary>
            {colourClock?.(kind, 'compare')}
          </details>
          <details className="frow fire__whyfold">
            <summary>Why · numbers and stations</summary>
            {/* Batch J, Section 8: the side view and how vivid, a row away, so the rows and the Viewfinder are on the first screen. */}
            {mean === null ? null : <FireSideView read={verdict.sky} path={mean} venue={venue} kind={kind} />}
            {vividLine === '' ? null : <p className="fire__note fire__vivid">{vividLine}</p>}

            {nowLine === null ? null : <p className="fire__now fire__note">Sky right now · {nowLine}</p>}
            {byStations && obs?.truth != null ? <p className="fire__note">Lit from under through the gap: the deck you can see catches the sun before sunset, deepest as the sun sets, until the sun is {litUntilDeg((obs.truth.baseFt ?? 0) * 0.3048).toFixed(1)}° below (its height&rsquo;s dip, and the bend of a grazing ray).</p> : null}
            {obs?.vivid.afd?.line == null ? null : (
              <p className="fire__note fire__afd">
                NWS {obs.vivid.afd.office}{obs.vivid.afd.issued === '' ? '' : `, ${clock(new Date(obs.vivid.afd.issued))}`}, in its own words (context only, never part of the call): &ldquo;{obs.vivid.afd.line}&rdquo;
              </p>
            )}
            {obs?.truth == null ? null : <p className="fire__note fire__truth">The deck over you: {obs.truth.words}. {obs.truth.notes.join(' · ')}.</p>}
            <p className="fire__note">
              {agreementLine(verdict, name)}{split ? ' · models split on low cloud' : ''}. A forecast places cloud on a grid kilometres across: it cannot promise a hole.
            </p>
            {watch === null || byStations ? null : (
              <p className="fire__note">
                Look from {clock(watch.from)} until {clock(watch.to)}, when the {name(watch.layer)} glows{kind === 'sunrise' && watch.to.getTime() <= event.getTime() ? ', before the sun is up' : ''}.
              </p>
            )}
            {lead === null ? null : (
              <ul className="fire__checks">
                {checks.map(([label, key, said]) => (
                  <li key={key} className="fire__check">
                    <span className={`fire__mark fire__mark--${said === 'no' ? 'no' : 'yes'}`}>{label}: {said}.</span> {checkWords(lead, name)[key]}
                  </li>
                ))}
              </ul>
            )}
            {overhead === null ? null : <p className="fire__note">Overhead: {layersLine(overhead)} (best match)</p>}
            {stations === null || stations.length === 0 ? null : (
              <p className="fire__note">
                Stations:{' '}
                {stations.map((s) => {
                  const differs = disagreement(s.sky, overhead?.low ?? null)
                  return `${s.sky.station} ${skyWords(s.sky)}${differs === null ? '' : ` (${differs})`}`
                }).join(' · ')}
              </p>
            )}
            <ul className="fire__models">
              {verdict.models.map((m) => {
                const lit = m.layers.filter((l) => l.fires).map((l) => name(l.layer))
                const why = m.layers.find((l) => l.canvas)?.why ?? 'none'
                const p = paths.find((x) => x.model === m.model)
                return (
                  <li key={m.model}>
                    {MODEL_LABEL[m.model as keyof typeof MODEL_LABEL]}: {lit.length > 0 ? `lit ${lit.join(', ')}` : `no fire, ${WHY_WORDS[why]}`}
                    {p === undefined ? null : <span className="fire__nums num"> {cloudTriple(p.samples[0] ?? { low: null, mid: null, high: null })}</span>}
                    {p === undefined ? null : <FireSideView read={m} path={p} venue={venue} kind={kind} label={`${MODEL_LABEL[m.model as keyof typeof MODEL_LABEL]}: side view`} />}
                  </li>
                )
              })}
            </ul>
            <p className="fire__note">
              How it is worked out: for each model and each cloud layer, the lit edge is where the deck over you ends toward the sun. The sun&rsquo;s ray from it is walked toward the sun each minute (its height with refraction, the Earth&rsquo;s curve), and cloud on the way counts only where the ray is inside that cloud&rsquo;s layer; thin high cirrus never blocks. A layer fires when it is over you, nothing thicker under it hides it, and some minute of its glow gets through. The colour strips are the same arithmetic for the models&rsquo; mean.
            </p>
          </details>
        </>
      )}

      <details className="frow">
      <summary>Log it · your log and photos</summary>
      {logOnTop ? null : logBlock}

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
      <TruthLoop
        timeZone={timeZone}
        venue={venue}
        placeName={placeName}
        target={target ?? null}
        onPickTarget={onPickTarget}
        onLogged={(e) => {
          const next = withEntry(log, e)
          setLog(next)
          writeFireLog(next)
        }}
      />
      </details>
    </div>
  )
}

/* The three checks as small pictures: a cloud, a ray through a gap, an eye. */
function CheckIcon({ kind }: { kind: 'canvas' | 'gap' | 'notBlocked' }) {
  return (
    <svg className="fire__icon" viewBox="0 0 24 24" aria-hidden="true">
      {kind === 'canvas' ? (
        <path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.3 1.5A3.3 3.3 0 0 0 7 18z" />
      ) : kind === 'gap' ? (
        <>
          <path d="M3 8h7M14 8h7M3 16h7M14 16h7" />
          <path d="M20 21L5 4" />
        </>
      ) : (
        <>
          <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z" />
          <circle cx="12" cy="12" r="2.6" />
        </>
      )}
    </svg>
  )
}
