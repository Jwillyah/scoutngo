import { useEffect, useMemo, useRef, useState } from 'react'
import { getPosition } from 'suncalc'
import type { LatLon } from '../core/geo.ts'
import { nextEvents } from '../core/skyFire.ts'
import { clockStrips, fireVerdict, WHY_WORDS } from '../core/fireOutlook.ts'
import {
  CLOCK_FROM_MIN,
  CLOCK_TO_MIN,
  clockWords,
  GAP_PARTIAL,
  LAYER_WORD,
  lightHex,
  stripTimes,
  type Strip,
} from '../core/skyColour.ts'
import { formatClock } from '../core/timezone.ts'
import type { Cover } from '../core/clouds.ts'
import { fourSkies, weekOfSkies, type ModelSky } from '../core/skyPages.ts'
import { skyWords } from '../core/metar.ts'
import { fetchSkyHours, hourlyAt, type Hourly } from '../lib/tideSheetData.ts'
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
 * Page 2, "Four forecasts" (Batch F, Section 6): the same event once per
 * model, a small picture of each sky drawn on the phone by the 3D view's own
 * sky and clouds (src/three/skyThumb.ts) from that model's cloud amounts at
 * their heights and our sun, and, once the event is past, what the nearest
 * stations reported. Page 3, "Week of skies": every sunrise and sunset for
 * seven days, a picture each from the venue's forecast cloud; a tap moves
 * the app to that time. Clouds illustrative: where they sit is drawn, how
 * much and how high is the forecast. The pictures are cached; with clouds on
 * Battery (the 3D view's setting) they are not drawn at all.
 */
interface Props {
  /**
   * Batch I, Section 3: 'strip' is the colour strip alone (Sky fire's first
   * screen); 'compare' the four forecasts and the week, behind "Compare the 5
   * forecasts". Unset: all three pages, swiped.
   */
  show?: 'strip' | 'compare'
  /** Page 3's tap: put the app at that sunrise or sunset. */
  onJump?: (at: Date) => void
  venue: LatLon
  timeZone: string
  at: Date
  now?: () => Date
  /**
   * Inside Sky fire (Batch E, 1 Nov): the event Sky fire's own switch picked,
   * and no second switch or verdict here; the page had both twice.
   */
  kind?: Kind
}

type Kind = 'sunrise' | 'sunset'
/*
 * ONE PAGE UNTIL THE OTHERS EXIST (Batch E, 1 Nov). "Four forecasts" and
 * "Week of skies" were swipe pages that said only "Coming with the new 3D
 * sky", with dots for them. They come back with Batch D; no dots, no swipe,
 * until then.
 */
const PAGES = ['Colour clock', 'Four forecasts', 'Week of skies'] as const

/* The 3D view's cloud quality, kept on this phone (Clay3D.tsx): Battery draws no pictures here. */
export const CLOUD_QUALITY_KEY = 'scoutngo.cloudQuality.v1'
function battery(): boolean {
  try {
    return localStorage.getItem(CLOUD_QUALITY_KEY) === 'battery'
  } catch {
    return false
  }
}

/* A picture of one sky, drawn on the phone after the page shows; a dash while it is drawn or when it cannot be. */
function SkyPicture({ sunAzimuthDeg, sunAltitudeDeg, cover, width, height, label, glow }: { sunAzimuthDeg: number; sunAltitudeDeg: number; cover: Cover; width: number; height: number; label: string; glow?: ModelSky['glow'] }) {
  const [url, setUrl] = useState<string | null>(null)
  const { low, mid, high } = cover
  /* Keyed by value: the same light is the same picture. */
  const glowKey = JSON.stringify(glow ?? {})
  useEffect(() => {
    let live = true
    if (battery()) return
    void import('../three/skyThumb.ts')
      .then((m) => {
        if (live) setUrl(m.renderSkyThumb({ sunAzimuthDeg, sunAltitudeDeg, cover: { low, mid, high }, width, height, glow: JSON.parse(glowKey) as ModelSky['glow'] }))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [sunAzimuthDeg, sunAltitudeDeg, low, mid, high, width, height, glowKey])
  return url === null ? <span className="prev__pic prev__pic--none" style={{ aspectRatio: `${width} / ${height}` }} role="img" aria-label={label} /> : <img className="prev__pic" src={url} alt={label} width={width} height={height} />
}

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x)}%`)

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
          <rect key={i} x={i} y={0} width={1.05} height={10} className={m.light === null ? 'prev__unlit' : undefined} fill={m.light === null ? undefined : lightHex(m.light)} opacity={m.open != null && m.open < GAP_PARTIAL ? 0.25 : undefined} />
        ))}
        <line x1={zero + 0.5} x2={zero + 0.5} y1={0} y2={10} className="prev__event" />
      </svg>
    </div>
  )
}

export function SkyPreview({ venue, timeZone, at, now = () => new Date(), kind: given, onJump, show }: Props) {
  const wanted = show === 'strip' ? [0] : show === 'compare' ? [1, 2] : [0, 1, 2]
  const events = useMemo(() => nextEvents(at, venue), [at, venue])
  const firstKind: Kind = events.sunrise !== null && (events.sunset === null || events.sunrise < events.sunset) ? 'sunrise' : 'sunset'
  const [own, setKind] = useState<Kind>(firstKind)
  const kind = given ?? own
  const embedded = given !== undefined
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
  /* After the event: what the stations reported, for page 2. */
  const past = event !== null && realNow.getTime() > event.getTime()
  const [after, setAfter] = useState<StationSky[] | null>(null)
  useEffect(() => {
    if (!past) return
    let live = true
    void fetchStationSkies(venue).then((s) => {
      if (live) setAfter(s)
    })
    return () => {
      live = false
    }
  }, [past, venue])
  /* Page 3's cloud: the venue's hourly forecast, one request for the fortnight. */
  const [hours, setHours] = useState<Hourly | null>(null)
  useEffect(() => {
    let live = true
    void fetchSkyHours(venue).then((h) => {
      if (live && h !== null) setHours(h.value)
    })
    return () => {
      live = false
    }
  }, [venue])
  const week = weekOfSkies(venue, new Date(at.getTime() - 12 * 3_600_000), (t) => {
        if (hours === null) return null
        const c = { low: hourlyAt(hours, 'cloud_cover_low', t), mid: hourlyAt(hours, 'cloud_cover_mid', t), high: hourlyAt(hours, 'cloud_cover_high', t) }
        return c.low === null && c.mid === null && c.high === null ? null : c
      }).filter((e) => e.at.getTime() > at.getTime() - 12 * 3_600_000)
  const station = soon && stations?.[0] !== undefined && stations[0].at !== '' ? { sky: stations[0].sky, at: new Date(stations[0].at) } : null

  const paths = data === 'loading' || data.paths === null || event === null ? [] : pathsAt(data.paths, nearestHour(event))
  /* Aerosol from Open-Meteo; when it did not answer, a clean-air 0.1 and the "i" says so. */
  const aod = data === 'loading' ? null : (data.aod ?? null)
  /* ONE SOURCE OF TRUTH (src/core/fireOutlook.ts): the verdict and these strips are the same walk of the light. */
  const verdict = paths.length === 0 || event === null ? null : fireVerdict(paths, { event, kind, venue, aod, station })
  const four = event === null ? [] : fourSkies(paths, verdict, event)
  const strips = verdict === null ? [] : clockStrips(verdict)
  const lowBaseM = verdict?.station?.lowBaseM ?? null

  const [onBattery] = useState(battery)
  const pager = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)

  return (
    <div className="prev">
      {embedded ? null : (
      <div className="seg prev__kinds" role="group" aria-label="Which event">
        {(['sunrise', 'sunset'] as const).map((k) => (
          <button key={k} type="button" className={`seg__btn${kind === k ? ' seg__btn--on' : ''}`} aria-pressed={kind === k} disabled={events[k] === null} onClick={() => setKind(k)}>
            {k === 'sunrise' ? 'Sunrise' : 'Sunset'}
            {events[k] === null ? null : <span className="num"> {clock(events[k] as Date)}</span>}
          </button>
        ))}
      </div>
      )}

      <div
        className="prev__pages"
        ref={pager}
        data-sideways=""
        onScroll={(e) => {
          const el = e.currentTarget
          setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
        }}
      >
        {!wanted.includes(0) ? null : (
        <section className="prev__page" aria-label={PAGES[0]}>
          {event === null ? (
            <p className="prev__note">No {kind} here in the next two days.</p>
          ) : data === 'loading' ? (
            <p className="prev__note">Reading six forecasts along the sun’s line…</p>
          ) : verdict === null ? (
            <p className="prev__note">The forecast for the sun’s line did not arrive, so there is no colour to work out.</p>
          ) : (
            <>
              {embedded ? null : <p className={`prev__verdict fire__verdict--${verdict.word}`}>{verdict.line}</p>}
              {strips.length === 0 ? (
                <p className="prev__note">Nothing lit that you could see: {WHY_WORDS[verdict.why ?? 'none']}.</p>
              ) : (
                <>
                  {/* Nothing lit you could see: the verdict's reason, not "no cloud is lit" under a forecast full of it. */}
                  {show === 'strip' ? null : <p className="prev__words">{strips.some((s) => stripTimes(s).glowFrom !== null) ? clockWords(strips, kind, clock) : `Nothing lit that you could see: ${WHY_WORDS[verdict.why ?? 'none']}.`}</p>}
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
                  {show === 'strip' ? null : <details className="prev__how">
                    <summary aria-label="How this is worked out">i</summary>
                    <p>
                      The colour of sunlight reaching each cloud’s base, each minute: the sun’s height with refraction, the cloud’s own horizon (it sees the sun sqrt(2h/R) below yours), the air along the light’s path, and how much blue that air and the haze take out. Haze: aerosol optical depth {aod === null ? '0.1, assumed (the air-quality forecast did not answer)' : `${aod.toFixed(2)} from Open-Meteo`}. Heights: {strips.map((s) => `${LAYER_WORD[s.layer]} ${Math.round(s.heightM)} m${s.layer === 'low' && lowBaseM !== null ? ` (${verdict.station?.station ?? 'station'})` : ' (typical)'}`).join(', ')}. The lit cloud is the sunward edge of the deck over you, still above your horizon: {strips.map((s) => `${LAYER_WORD[s.layer]} ${s.reachKm} km`).join(', ')}. The light’s own path is walked toward the sun, and cloud on it counts only where the ray is inside that cloud’s layer; a faded minute is one the cloud on the way blocks. The models’ mean cover is drawn, the same arithmetic as the verdict. Not counted: ozone, the cloud’s own thickness, light from the rest of the sky.
                    </p>
                  </details>}
                </>
              )}
            </>
          )}
        </section>
        )}
        {!wanted.includes(1) ? null : (
        <section className="prev__page" aria-label={PAGES[1]}>
          <p className="prev__head">Four forecasts, one {kind}</p>
          {event === null || azimuth === null ? (
            <p className="prev__note">No {kind} here in the next two days.</p>
          ) : onBattery ? (
            <p className="prev__note">Clouds are on Battery in the 3D view, so these pictures are not drawn. The numbers: {four.map((m) => `${m.label} low ${pct(m.cover.low)} mid ${pct(m.cover.mid)}`).join(' · ') || 'not arrived'}.</p>
          ) : four.length === 0 ? (
            <p className="prev__note">{data === 'loading' ? 'Reading the forecasts…' : 'The models’ cloud for this event did not arrive.'}</p>
          ) : (
            <div className="prev__grid">
              {four.map((m) => (
                <figure key={m.model} className="prev__fig">
                  <SkyPicture sunAzimuthDeg={azimuth} sunAltitudeDeg={getPosition(m.at, venue.lat, venue.lon).altitude} cover={m.cover} glow={m.glow} width={168} height={126} label={`${m.label}: ${kind} sky at ${clock(m.at)}, low ${pct(m.cover.low)}, mid ${pct(m.cover.mid)}, high ${pct(m.cover.high)}`} />
                  <figcaption className="prev__cap">
                    <span className="num">{m.label}</span> <b>{m.lit === null ? 'no fire' : `lit ${LAYER_WORD[m.lit]}`}</b>{m.lit === null ? null : <span className="num"> {clock(m.at)}</span>}
                    <span className="prev__nums num"> low {pct(m.cover.low)} · mid {pct(m.cover.mid)} · high {pct(m.cover.high)}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
          {!past || after === null || after.length === 0 ? null : (
            <p className="prev__note">What the stations saw: {after.map((x) => `${x.sky.station} ${skyWords(x.sky)}`).join(' · ')}</p>
          )}
          <p className="prev__note">Clouds illustrative: how much and how high is each forecast’s; where they sit is drawn.</p>
        </section>
        )}
        {!wanted.includes(2) ? null : (
        <section className="prev__page" aria-label={PAGES[2]}>
          <p className="prev__head">Week of skies</p>
          {onBattery ? (
            <p className="prev__note">Clouds are on Battery in the 3D view, so these pictures are not drawn.</p>
          ) : (
            <div className="prev__week">
              {week.map((e) => (
                <button key={e.at.toISOString()} type="button" className="prev__day" onClick={() => onJump?.(e.at)} aria-label={`${e.kind} ${new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(e.at)} ${clock(e.at)}: go there`}>
                  {e.cover === null ? <span className="prev__pic prev__pic--none" /> : <SkyPicture sunAzimuthDeg={e.sunAzimuthDeg} sunAltitudeDeg={e.kind === 'sunrise' ? 1 : 1} cover={e.cover} width={96} height={64} label="" />}
                  <span className="prev__cap num">
                    {new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(e.at)} {e.kind === 'sunrise' ? '↑' : '↓'} {clock(e.at)}
                  </span>
                </button>
              ))}
            </div>
          )}
          <p className="prev__note">Clouds illustrative · the venue’s forecast cloud at each hour · tap one to go there.</p>
        </section>
        )}
      </div>
      {wanted.length < 2 ? null : (
        <div className="prev__dots" role="img" aria-label={`Page ${page + 1} of ${wanted.length}: ${PAGES[wanted[page] ?? 0]}`}>
          {wanted.map((w, i) => (
            <span key={PAGES[w]} className={`prev__dot${i === page ? ' prev__dot--on' : ''}`} />
          ))}
        </div>
      )}
    </div>
  )
}
