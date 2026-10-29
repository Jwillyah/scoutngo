import { useSidewaysScrub } from '../lib/useSidewaysScrub.ts'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import { glassMornings, type Morning } from '../core/glassMornings.ts'
import { localDate } from '../core/moonTimes.ts'
import { tideWeek } from '../core/moonTides.ts'
import { sunriseOn } from '../core/sunrise.ts'
import { directionAt, levelAt } from '../core/tide.ts'
import { tideRate } from '../core/tideRate.ts'
import { formatClock } from '../core/timezone.ts'
import { forgetPhoto, keepPhoto, readPhoto } from '../lib/explainerPhoto.ts'
import { tideDayModel } from '../lib/tideDay.ts'
import { surfAt, surfDay } from '../lib/surfDay.ts'
import { surfShape } from '../core/surf.ts'
import { SurfRow } from './SurfRow.tsx'
import { hourlyAt } from '../lib/tideSheetData.ts'
import { celsiusToF, compass, glassRead, metresToFeet, motionWords } from '../lib/tideWords.ts'
import type { TideInfo } from '../lib/useTide.ts'
import type { TideSheetData } from '../lib/useTideSheet.ts'
import { formatRange, formatWind, type Units } from '../lib/units.ts'

/*
 * THE TIDE SHEET: A WHOLE PAGE, NO SCROLLING ON A 390 x 844 PHONE.
 *
 * Read top to bottom the way a beginner asks: is the water coming in or going
 * out, and how fast (one sentence); what the day does (the curve, with the
 * sun's bands behind it and the same moment as the time bar); is the water
 * glassy (the wind against the way the beach faces, and the waves); which
 * mornings this month are glass mornings. The numbers sit small under the
 * words. Two drawn pictures explain why; no photographs of real places are
 * made up, and a photo of your own stays on the phone.
 */
interface TideSheetProps {
  tide: TideInfo
  at: Date
  timeZone: string
  venue: LatLon
  units: Units
  data: TideSheetData
  onAt: (at: Date) => void
  /** Jump the app to a day, at that morning's sunrise. */
  onJumpDay: (date: string, at: Date) => void
  onClose: () => void
  /** The waterline on the 2D map (Phase 4): only with a kept 3D scan. */
  waterline?: { shown: boolean; scanKept: boolean; line: string; onShow: (on: boolean) => void }
}

/*
 * The curve's height is what gives when the sheet runs long. On 27 Oct in the
 * evening (a full-moon note, the surf row, a two-line forecast) the sheet ran
 * 8 px past the screen at 104; at 92 it has room for a line more.
 */
const CURVE_H = 92
/*
 * TWENTY DAYS, TWO ROWS OF TEN, each day a 44 px target (29 Oct,
 * docs/gestures.md): thirty at 24 px were too small to tap, and thirty at
 * 44 did not fit the card. Past twenty days the wind is not forecast anyway,
 * so a day out there could only ever say "tide only".
 */
const STRIP_DAYS = 20

export function TideSheet({ tide, at, timeZone, venue, units, data, onAt, onJumpDay, onClose, waterline }: TideSheetProps) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(340)
  const [explainer, setExplainer] = useState<'mirror' | 'spring' | null>(null)
  useEffect(() => {
    const el = box.current
    if (el === null || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(Math.max(200, Math.round(entry.contentRect.width)))
    })
    watch.observe(el)
    return () => watch.disconnect()
  }, [])

  const date = localDate(at, timeZone)
  const ok = tide.status === 'ok' ? tide : null
  const model = useMemo(
    () =>
      ok === null
        ? null
        : tideDayModel({ date, timeZone, curve: ok.predictions.curve, extremes: ok.predictions.extremes, lat: venue.lat, lon: venue.lon, width, height: CURVE_H }),
    [ok, date, timeZone, venue.lat, venue.lon, width],
  )

  const feet = ok === null ? null : levelAt(ok.predictions.curve, at)
  const direction = ok === null ? 'slack' : directionAt(ok.predictions.extremes, at)
  const rate = ok === null ? null : tideRate(ok.predictions.curve, ok.predictions.extremes, at, ok.predictions.curveSource === 'published')
  const next = ok === null ? null : ([...ok.predictions.extremes].sort((p, q) => p.at.getTime() - q.at.getTime()).find((e) => e.at.getTime() > at.getTime()) ?? null)
  const week = tideWeek(at)

  const facing = data.facing.value !== null && data.facing.value !== 'inland' ? data.facing.value.facing : null
  const wind = data.wind.value
  const windSpeed = wind === null ? null : hourlyAt(wind, 'wind_speed_10m', at)
  const windFrom = wind === null ? null : hourlyAt(wind, 'wind_direction_10m', at)
  const glass = windSpeed === null || windFrom === null ? null : glassRead(windSpeed, windFrom, facing)
  const marine = data.marine.value !== null && data.marine.value !== 'inland' ? data.marine.value : null
  const waveH = marine === null ? null : hourlyAt(marine, 'wave_height', at)
  const waveT = marine === null ? null : hourlyAt(marine, 'wave_period', at)
  const waveDir = marine === null ? null : hourlyAt(marine, 'wave_direction', at)
  const water = marine === null ? null : hourlyAt(marine, 'sea_surface_temperature', at)

  const surfNow = !data.surf || marine === null ? null : surfAt(marine, at, facing)
  const surfShapeNow = surfNow === null || windSpeed === null || windFrom === null ? null : surfShape(windSpeed, windFrom, facing)
  const surfBars = useMemo(() => (!data.surf || marine === null || model === null ? [] : surfDay(marine, model.from, facing)), [data.surf, marine, model, facing])

  const mornings = useMemo((): Morning[] => {
    const today = localDate(new Date(), timeZone)
    const days = Array.from({ length: STRIP_DAYS }, (_, i) => {
      const d = new Date(Date.parse(`${today}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10)
      return { date: d, sunrise: sunriseOn(d, venue.lat, venue.lon, timeZone) }
    })
    const lows = (data.month.value ?? []).filter((e) => e.kind === 'low').map((e) => e.at)
    const windAt = (t: Date) => {
      if (wind === null) return null
      const s = hourlyAt(wind, 'wind_speed_10m', t)
      const f = hourlyAt(wind, 'wind_direction_10m', t)
      return s === null || f === null ? null : { speedMps: s, fromDeg: f }
    }
    const surfFtAt = (t: Date) => (!data.surf || marine === null ? null : (surfAt(marine, t, facing)?.estimate.faceFt ?? null))
    return glassMornings(days, lows, windAt, facing, surfFtAt)
  }, [data.month.value, data.surf, marine, wind, facing, timeZone, venue.lat, venue.lon])

  /* Sideways scrubs and a tap sets the time; up or down is the sheet's (src/lib/useSidewaysScrub.ts). */
  const curveScrub = useSidewaysScrub((event) => {
    if (model === null) return
    const r = event.target.getBoundingClientRect()
    onAt(new Date(model.tOf(Math.max(0, Math.min(width, event.clientX - r.left)))))
  }, true)

  return (
    <section className="tides" aria-label="Tide">
      <div className="tides__head">
        <p className="tides__title">Tide</p>
        <button type="button" className="card2__x" onClick={onClose} aria-label="Back to the shoot">
          ×
        </button>
      </div>

      {ok === null ? (
        <p className="tides__lead">
          {tide.status === 'no-station'
            ? `No tide station near here. The closest is ${formatRange(tide.nearestKm * 1000, units.distance)} away.`
            : tide.status === 'unavailable'
              ? tide.reason
              : 'Waiting for NOAA.'}
        </p>
      ) : (
        <>
          <p className="tides__lead">{motionWords(direction, rate)}</p>
          <p className="tides__sub num">
            {feet === null ? '—' : `${feet.toFixed(1)} ft now`}
            {next === null ? '' : ` · ${next.kind} ${formatClock(next.at, timeZone)}, ${next.feet.toFixed(1)} ft`}
            {week === null ? '' : ` · ${week.line}`}
          </p>
        </>
      )}

      <div ref={box} className="tides__curve">
        {model === null ? null : (
          <svg
            width={width}
            height={CURVE_H}
            role="slider"
            aria-label="The tide through the day. Drag to move the time."
            aria-valuenow={at.getTime()}
            aria-valuetext={formatClock(at, timeZone)}
            {...curveScrub}
          >
            {model.bands.map((b) => (
              <rect key={`${b.band}-${b.x0}`} className={`curve__band curve__band--${b.band}`} x={b.x0} y={0} width={Math.max(0, b.x1 - b.x0)} height={CURVE_H} />
            ))}
            {model.sun.map((s) => (
              <g key={s.kind} className="tides__sunmark">
                <line x1={s.x} x2={s.x} y1={CURVE_H - 16} y2={CURVE_H} />
                <text x={Math.min(width - 54, Math.max(2, s.x + 3))} y={CURVE_H - 4}>
                  {s.kind === 'rise' ? 'sunrise' : 'sunset'} {formatClock(s.at, timeZone)}
                </text>
              </g>
            ))}
            {/* The surf estimate, hour by hour, as short bars along the foot (1 px = 1/2 ft, capped at 8 ft). */}
            {surfBars.map((h) => {
              const tall = Math.min(8, h.estimate.faceFt) * 2
              return <rect key={h.at.getTime()} className="tides__surfbar" x={model.xOf(h.at.getTime()) - 3} y={CURVE_H - 18 - tall} width={6} height={tall} />
            })}
            <path className="tides__line" d={model.path} />
            {model.marks.map((m) => (
              <g key={m.at.getTime()} className={`tides__mark tides__mark--${m.kind}`}>
                <circle cx={m.x} cy={m.y} r={3.5} />
                <text x={Math.min(width - 34, Math.max(2, m.x - 16))} y={m.kind === 'high' ? m.y - 6 : m.y + 13}>
                  {formatClock(m.at, timeZone)}
                </text>
              </g>
            ))}
            <line className="tides__needle" x1={model.xOf(at.getTime())} x2={model.xOf(at.getTime())} y1={0} y2={CURVE_H} />
          </svg>
        )}
      </div>
      {ok === null ? null : (
        <p className="tides__small">
          Feet above MLLW, the average daily low · {ok.station.name},{' '}
          <span className="num">{formatRange(ok.distanceKm * 1000, units.distance)}</span>
          {ok.predictions.curveSource === 'published' ? '' : ' · curve from the turns'}
          {waterline === undefined || data.facing.value === 'inland' ? null : waterline.scanKept ? (
            <>
              {' · '}
              <button type="button" className="clay__link" onClick={() => waterline.onShow(!waterline.shown)}>
                {waterline.shown ? 'Hide the waterline' : 'Waterline on the map'}
              </button>
            </>
          ) : (
            ' · waterline needs the 3D scan'
          )}
        </p>
      )}

      <div className={`tides__glass${glass?.glassy === true ? ' tides__glass--glassy' : ''}`}>
        <GlassIcon glassy={glass?.glassy ?? null} />
        <div>
          <p className="tides__glassline">
            {data.facing.value === 'inland' ? 'No beach within 1.5 km to read the water against.' : (glass?.line ?? (data.wind.status === 'failed' ? "The wind didn't load" : 'Waiting for the wind forecast'))}
          </p>
          <p className="tides__small num">
            {windSpeed === null || windFrom === null ? '' : `Wind ${formatWind(windSpeed, units.wind)} from ${compass(windFrom)}`}
            {glass?.relation == null ? '' : ` · ${glass.relation}`}
            {facing === null ? '' : ` · beach faces ${compass(facing)}`}
            {waveH === null ? '' : ` · waves ${metresToFeet(waveH).toFixed(1)} ft`}
            {waveT === null ? '' : ` every ${Math.round(waveT)} s`}
            {waveDir === null ? '' : ` from ${compass(waveDir)}`}
            {water === null ? '' : ` · water ${Math.round(celsiusToF(water))}°F`}
          </p>
        </div>
      </div>

      {!data.surf ? null : <SurfRow now={surfNow} shape={surfShapeNow} buoy={data.buoy} venue={venue} units={units} timeZone={timeZone} />}

      <div className="tides__strip">
        <p className="tides__striphead">
          Glass mornings: low tide near sunrise, calm water
          <span className="tides__key">
            {data.surf ? (
              <>
                <i className="tides__dot tides__dot--surf-glass" /> surf + glass{' '}
              </>
            ) : null}
            <i className="tides__dot tides__dot--glass" /> glass <i className="tides__dot tides__dot--tide-only" /> tide only <i className="tides__dot tides__dot--windy" /> windy
          </span>
        </p>
        <div className="tides__days">
          {mornings.map((m) => (
            <button
              key={m.date}
              type="button"
              className={`tides__day tides__day--${m.mark}${m.date === date ? ' tides__day--on' : ''}`}
              onClick={() => (m.sunrise === null ? undefined : onJumpDay(m.date, m.sunrise))}
              aria-label={`${m.date}: ${m.mark === 'surf-glass' ? 'glass morning with surf' : m.mark === 'glass' ? 'glass morning' : m.mark === 'tide-only' ? 'low tide near sunrise, wind not forecast yet' : m.mark === 'windy' ? 'low tide near sunrise, windy' : 'no low tide near sunrise'}${m.low === null ? '' : `, low ${formatClock(m.low, timeZone)}`}`}
            >
              <span className="num">{Number(m.date.slice(8))}</span>
            </button>
          ))}
        </div>
        {data.month.status === 'failed' ? <p className="tides__small">The month of tides didn't load; asked again by itself.</p> : null}
      </div>

      <div className="tides__explain">
        <button type="button" className="tides__why" onClick={() => setExplainer('mirror')}>
          Why mirror mornings
        </button>
        <button type="button" className="tides__why" onClick={() => setExplainer('spring')}>
          What big tides do
        </button>
      </div>

      {explainer === null ? null : <Explainer id={explainer} onClose={() => setExplainer(null)} />}
    </section>
  )
}

function GlassIcon({ glassy }: { glassy: boolean | null }) {
  return (
    <svg className="tides__glassicon" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="28" cy="12" r="5" className="tides__sun" />
      {glassy === false ? (
        <path d="M4 26q4-5 8 0t8 0 8 0 8 0M4 33q4-5 8 0t8 0 8 0 8 0" className="tides__wave" />
      ) : (
        <path d="M4 27h32M8 33h24" className="tides__wave" />
      )}
    </svg>
  )
}

const EXPLAIN = {
  mirror: {
    title: 'Why low tide + sunrise + calm = mirror',
    words:
      'At low tide the sea leaves a wide, flat strip of wet sand with a thin skin of water on it. With no wind that skin lies still, so it reflects the sky like a mirror, and at sunrise the sky is the brightest, warmest thing there is.',
  },
  spring: {
    title: 'What a big tide does',
    words:
      'Near a full or new moon the sun and moon pull together, so high tides come higher and low tides go lower. A big low tide uncovers more beach, sandbars and rocks than usual; a big high tide can cover the whole beach.',
  },
} as const

function Explainer({ id, onClose }: { id: 'mirror' | 'spring'; onClose: () => void }) {
  const [photo, setPhoto] = useState<string | null>(() => readPhoto(id))
  const [note, setNote] = useState<string | null>(null)
  return (
    <div className="tides__explainer" role="dialog" aria-label={EXPLAIN[id].title}>
      <div className="tides__head">
        <p className="tides__title">{EXPLAIN[id].title}</p>
        <button type="button" className="card2__x" onClick={onClose} aria-label="Close the explainer">
          ×
        </button>
      </div>
      {id === 'mirror' ? <MirrorPicture /> : <SpringPicture />}
      <p className="tides__words">{EXPLAIN[id].words}</p>
      {photo === null ? null : <img className="tides__photo" src={photo} alt="Your own example photo, kept on this phone" />}
      <label className="tides__add">
        {photo === null ? 'Add your own example photo (stays on this phone)' : 'Change your photo'}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file === undefined) return
            void keepPhoto(id, file).then((kept) => {
              setNote(kept ? null : 'This phone would not keep the photo.')
              setPhoto(readPhoto(id))
            })
          }}
        />
      </label>
      {photo === null ? null : (
        <button
          type="button"
          className="tides__why"
          onClick={() => {
            forgetPhoto(id)
            setPhoto(null)
          }}
        >
          Remove your photo
        </button>
      )}
      {note === null ? null : <p className="tides__small">{note}</p>}
    </div>
  )
}

/* Drawn, not photographed: sky, a low sun, flat wet sand with its reflection, the sea pulled back. */
function MirrorPicture() {
  return (
    <svg className="tides__picture" viewBox="0 0 320 140" role="img" aria-label="A drawing: the sun low over the sea, and its reflection in a thin layer of water on flat wet sand at low tide">
      <rect width="320" height="70" className="pic__sky" />
      <circle cx="230" cy="62" r="12" className="pic__sun" />
      <rect y="70" width="320" height="18" className="pic__sea" />
      <rect y="88" width="320" height="34" className="pic__wet" />
      <ellipse cx="230" cy="100" rx="9" ry="5" className="pic__glint" />
      <path d="M200 106h60M210 112h40" className="pic__ripple" />
      <rect y="122" width="320" height="18" className="pic__sand" />
      <text x="8" y="84" className="pic__label">sea, pulled back</text>
      <text x="8" y="106" className="pic__label">thin water on flat sand: a mirror</text>
      <text x="8" y="134" className="pic__label">dry sand</text>
    </svg>
  )
}

/* Drawn: the same beach at a normal tide and at a big one, the waterlines marked. */
function SpringPicture() {
  return (
    <svg className="tides__picture" viewBox="0 0 320 140" role="img" aria-label="A drawing of a sloping beach with four waterlines: a normal high and low, and a big tide's higher high and lower low">
      <path d="M0 130L320 40V140H0z" className="pic__sand" />
      <path d="M150 88L320 40" className="pic__wet" />
      <line x1="0" x2="320" y1="58" y2="58" className="pic__line pic__line--big" />
      <line x1="0" x2="320" y1="72" y2="72" className="pic__line" />
      <line x1="0" x2="320" y1="104" y2="104" className="pic__line" />
      <line x1="0" x2="320" y1="118" y2="118" className="pic__line pic__line--big" />
      <text x="6" y="54" className="pic__label">big tide: higher high</text>
      <text x="6" y="68" className="pic__label">normal high</text>
      <text x="6" y="100" className="pic__label">normal low</text>
      <text x="6" y="114" className="pic__label">big tide: lower low, more beach</text>
    </svg>
  )
}
