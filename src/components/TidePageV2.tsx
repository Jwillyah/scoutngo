import { useEffect, useMemo, useRef, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import { GLASSY_MPS } from '../core/coastFacing.ts'
import { glassMornings, LOW_NEAR_SUNRISE_MIN, type Morning } from '../core/glassMornings.ts'
import { localDate } from '../core/moonTimes.ts'
import { SPRING_WITHIN, tideWeek } from '../core/moonTides.ts'
import { sunriseOn } from '../core/sunrise.ts'
import { directionAt, levelAt, STATION_LOCAL_KM } from '../core/tide.ts'
import { formatClock, formatShortHour } from '../core/timezone.ts'
import { wetsuitFor } from '../core/wetsuit.ts'
import { dayRangeFeet, moonLitPercent, nextTurns, SCRUB_RETURN_MS, tideDayWindow, tideHeight, timeAtShare, untilWords } from '../core/tideWindow.ts'
import type { DetailId } from '../lib/detailTabs.ts'
import { hourlyAt } from '../lib/tideSheetData.ts'
import { useTide, type TideInfo } from '../lib/useTide.ts'
import { useTideSheet, type TideSheetData } from '../lib/useTideSheet.ts'
import { formatRange, formatTemperature, formatWind, type Units } from '../lib/units.ts'
import { DCard, DetailShell } from './DetailShell.tsx'
import { saneTide } from '../core/sanity.ts'

/*
 * TIDE, v2 (Batch N, Section 2; board docs/mockups/Detail2T.png). The new
 * home's look: "<spot> · now", which way the water is going in big type, the
 * height and the next turn with its countdown; today's curve (night shaded,
 * now a dot, each turn's time and height); four tiles (next low, next high,
 * today's range with the moon, the water's temperature with the wetsuit
 * convention); the mirror mornings, a tap away as a list; the station and
 * its datum under "How we got this".
 *
 * Same tide as the map: useTide (the nearest NOAA station that publishes),
 * and for the month and the sea, useTideSheet. Every number is NOAA's or
 * worked out in src/core; a dash where nothing was said.
 */
export interface TidePageV2Props {
  venue: LatLon
  placeName: string
  timeZone: string
  units: Units
  ground: string
  onBack: () => void
  onSwitch: (id: DetailId) => void
  onMap: () => void
  drone?: { name: string; maxWindMps: number | null } | null
}

/** The time, a minute at a time: the countdown and the now dot move with it. */
function useMinute(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

export function TidePageV2({ venue, placeName, timeZone, units, ground, onBack, onSwitch, onMap }: TidePageV2Props) {
  const now = useMinute()
  const tide = useTide(venue, now)
  /* 'off': the surf row is the Surf page's now, so no buoys are asked for here. */
  const data = useTideSheet(true, venue, tide.status === 'ok' ? tide.station.id : null, 'off')
  return (
    <DetailShell id="tide" ground={ground} onBack={onBack} onSwitch={onSwitch} onMap={onMap} how={<TideHow tide={tide} data={data} units={units} />}>
      <TideContent now={now} tide={tide} data={data} venue={venue} placeName={placeName} timeZone={timeZone} units={units} />
    </DetailShell>
  )
}

const DIRECTION_WORD = { rising: 'Rising', falling: 'Falling', slack: 'Turning' } as const
const CURVE_W = 330
const CURVE_H = 150
/** Mirror mornings are looked for this far ahead; NOAA's month reaches it, the wind forecast stops sooner. */
const MIRROR_DAYS = 30

const dayWords = (date: string) => new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
const weekdayWord = (date: string) => new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))

export function TideContent({ now, tide, data, venue, placeName, timeZone, units }: { now: Date; tide: TideInfo; data: TideSheetData; venue: LatLon; placeName: string; timeZone: string; units: Units }) {
  const [listOpen, setListOpen] = useState(false)
  /*
   * DRAG ALONG THE CURVE (Batch Flow, Section 7): the headline follows the
   * finger; let go and it is back to now SCRUB_RETURN_MS later.
   */
  const [scrub, setScrub] = useState<Date | null>(null)
  const back = useRef<number | null>(null)
  useEffect(() => () => (back.current === null ? undefined : window.clearTimeout(back.current)), [])
  const ok = tide.status === 'ok' ? tide : null
  const today = localDate(now, timeZone)
  const model = useMemo(
    () => (ok === null ? null : tideDayWindow({ now, date: today, timeZone, curve: ok.predictions.curve, extremes: ok.predictions.extremes, lat: venue.lat, lon: venue.lon, width: CURVE_W, height: CURVE_H })),
    [ok, now, today, timeZone, venue.lat, venue.lon],
  )
  const facing = data.facing.value !== null && data.facing.value !== 'inland' ? data.facing.value.facing : null
  const mornings = useMemo((): Morning[] => {
    const days = Array.from({ length: MIRROR_DAYS }, (_, i) => {
      const d = new Date(Date.parse(`${today}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10)
      return { date: d, sunrise: sunriseOn(d, venue.lat, venue.lon, timeZone) }
    })
    const lows = (data.month.value ?? []).filter((e) => e.kind === 'low').map((e) => e.at)
    const wind = data.wind.value
    const windAt = (t: Date) => {
      if (wind === null) return null
      const s = hourlyAt(wind, 'wind_speed_10m', t)
      const f = hourlyAt(wind, 'wind_direction_10m', t)
      return s === null || f === null ? null : { speedMps: s, fromDeg: f }
    }
    return glassMornings(days, lows, windAt, facing)
  }, [today, data.month.value, data.wind.value, facing, venue.lat, venue.lon, timeZone])

  const kicker = <p className="dtide__kick">{placeName === '' ? 'Now' : `${placeName} · now`}</p>
  if (ok === null) {
    return (
      <div className="dhead">
        {kicker}
        <p className="dhead__big">—</p>
        <p className="dhead__line">
          {tide.status === 'no-station'
            ? `No tide station near here. The closest, ${tide.nearestName}, is ${formatRange(tide.nearestKm * 1000, units.distance)} away.`
            : tide.status === 'unavailable'
              ? tide.reason
              : 'Waiting for NOAA.'}
        </p>
      </div>
    )
  }

  const { extremes, curve } = ok.predictions
  const at = scrub ?? now
  /* Sanity (Batch QA, Section 4): a level outside the station's own predicted lows and highs is "—" (src/core/sanity.ts saneTide). */
  const feet0 = levelAt(curve, at)
  const feet = feet0 === null || extremes.length === 0 ? feet0 : saneTide(feet0, Math.min(...extremes.map((e) => e.feet)), Math.max(...extremes.map((e) => e.feet)))
  const direction = directionAt(extremes, at)
  const scrubTo = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const t = timeAtShare(today, timeZone, (e.clientX - r.left) / Math.max(1, r.width))
    if (t !== null) setScrub(t)
  }
  const dayFrom = timeAtShare(today, timeZone, 0)
  const dayTo = timeAtShare(today, timeZone, 1)
  const scrubX = scrub === null || dayFrom === null || dayTo === null ? null : ((scrub.getTime() - dayFrom.getTime()) / Math.max(1, dayTo.getTime() - dayFrom.getTime())) * CURVE_W
  const letGo = () => {
    if (back.current !== null) window.clearTimeout(back.current)
    back.current = window.setTimeout(() => setScrub(null), SCRUB_RETURN_MS)
  }
  /* The month's turns reach further than the day's table: the next high or low is read from both. */
  const turns = nextTurns([...extremes, ...(data.month.value ?? [])], now)
  const range = dayRangeFeet(extremes, today, timeZone)
  const week = tideWeek(now)
  const marine = data.marine.value !== null && data.marine.value !== 'inland' ? data.marine.value : null
  const waterC = marine === null ? null : hourlyAt(marine, 'sea_surface_temperature', now)
  const suit = wetsuitFor(waterC)
  const mirror = mornings.filter((m) => (m.mark === 'glass' || m.mark === 'surf-glass') && m.sunrise !== null && m.sunrise.getTime() > now.getTime() - 3_600_000)
  const tideOnly = mornings.filter((m) => m.mark === 'tide-only')
  const next = turns.next
  const until = next === null ? null : untilWords(now, next.at)

  return (
    <>
      <div className="dhead">
        {kicker}
        <p className="dhead__big">{DIRECTION_WORD[direction]}</p>
        <p className="dhead__line" data-tide-headline {...(scrub === null && next !== null ? { 'data-shared': 'tide', 'data-value': `${next.kind} ${formatClock(next.at, timeZone)}`.toLowerCase() } : {})}>
          {tideHeight(feet, units.distance)}
          {scrub !== null ? ` at ${formatClock(scrub, timeZone)}` : next === null ? '' : ` · ${next.kind} ${formatClock(next.at, timeZone)}${until === null ? '' : ` · ${until}`}`}
        </p>
      </div>

      <DCard label="Today" className="dtide__curvecard">
        {model === null ? (
          <p className="dtide__none">NOAA’s curve does not reach today.</p>
        ) : (
          <svg
            className="dtide__curve"
            viewBox={`0 0 ${CURVE_W} ${CURVE_H}`}
            role="img"
            aria-label="Today’s water level, night shaded, with each high and low and now. Drag along it to read any time."
            data-sideways
            style={{ touchAction: 'pan-y' }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              if (back.current !== null) window.clearTimeout(back.current)
              scrubTo(e)
            }}
            onPointerMove={(e) => {
              if (e.buttons > 0 || e.pointerType === 'touch') scrubTo(e)
            }}
            onPointerUp={letGo}
            onPointerCancel={letGo}
          >
            {model.nights.map((n) => (
              <rect key={n.x0} className="dtide__night" x={n.x0} y={0} width={Math.max(0, n.x1 - n.x0)} height={CURVE_H - 14} />
            ))}
            <path className="dtide__area" d={model.area} />
            <path className="dtide__line" d={model.path} />
            {model.marks.map((m) => (
              <g key={m.at.getTime()} className={`dtide__mark dtide__mark--${m.kind}`}>
                <circle cx={m.x} cy={m.y} r={2.5} />
                <text x={m.labelX} y={m.labelY} textAnchor="middle" className="dtide__t">
                  {formatClock(m.at, timeZone)}
                </text>
                <text x={m.labelX} y={m.labelY + 11} textAnchor="middle" className="dtide__h">
                  {tideHeight(m.feet, units.distance)}
                </text>
              </g>
            ))}
            {model.now === null ? null : (
              <g data-now>
                <circle className="dtide__now" cx={model.now.x} cy={model.now.y} r={6} />
                <text className="dtide__nowt" x={model.now.labelX} y={model.now.labelY} textAnchor="middle">
                  now
                </text>
              </g>
            )}
            {scrubX === null ? null : <line className="dtide__scrub" x1={scrubX} x2={scrubX} y1={0} y2={CURVE_H - 14} data-scrub />}
            {model.ticks.map((t, k) => (
              <text key={t.at.getTime()} className="dtide__tick" x={t.x} y={CURVE_H - 2} textAnchor={k === 0 ? 'start' : k === model.ticks.length - 1 ? 'end' : 'middle'}>
                {formatShortHour(t.at, timeZone)}
              </text>
            ))}
          </svg>
        )}
      </DCard>

      <div className="dtide__tiles">
        <DCard label="Next low" className="dtide__tile">
          <p className="dtide__big">{turns.low === null ? '—' : formatClock(turns.low.at, timeZone)}</p>
          <p className="dtide__line">{turns.low === null ? 'not in NOAA’s table yet' : tideHeight(turns.low.feet, units.distance)}</p>
        </DCard>
        <DCard label="Next high" className="dtide__tile">
          <p className="dtide__big">{turns.high === null ? '—' : formatClock(turns.high.at, timeZone)}</p>
          <p className="dtide__line">{turns.high === null ? 'not in NOAA’s table yet' : tideHeight(turns.high.feet, units.distance)}</p>
        </DCard>
        <DCard label="Range today" className="dtide__tile">
          <p className="dtide__big">{tideHeight(range, units.distance)}</p>
          <p className="dtide__line" data-spring={week?.kind ?? 'between'}>
            moon {moonLitPercent(now)}%{week === null ? '' : week.kind === 'spring' ? ' · spring tides' : ' · neap tides'}
          </p>
        </DCard>
        <DCard label="Water" className="dtide__tile">
          <p className="dtide__big">{waterC === null ? '—' : formatTemperature(waterC, units.temperature)}</p>
          <p className="dtide__line">
            {waterC === null || suit === null
              ? data.marine.value === 'inland'
                ? 'no open sea here'
                : data.marine.status === 'loading'
                  ? 'waiting for the sea forecast'
                  : data.marine.status === 'failed'
                    ? 'sea forecast didn’t load · retrying'
                    : 'the sea forecast did not say'
              : `${suit.suit} typical`}
          </p>
        </DCard>
      </div>

      <button type="button" className="dcard dtide__mirror" onClick={() => setListOpen(true)} aria-haspopup="dialog">
        <svg className="dtide__sunicon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 17h18M7 17a5 5 0 0 1 10 0M12 5v3M5.5 9.5l1.8 1.8M18.5 9.5l-1.8 1.8" />
        </svg>
        <span className="dtide__mirrortext">
          <b className="dtide__mirrorhead">
            Mirror mornings
            {data.month.status === 'loading' || data.wind.status === 'loading' ? ' · reading the month…' : mirror.length === 0 ? ' · none forecast' : ` · ${mirror.slice(0, 2).map((m) => weekdayWord(m.date)).join(', ')}${mirror.length > 2 ? ` +${mirror.length - 2}` : ''}`}
          </b>
          <span className="dtide__mirrorline">low tide within {LOW_NEAR_SUNRISE_MIN} min of sunrise, light wind</span>
        </span>
      </button>

      {listOpen ? (
        <div className="dhow" role="dialog" aria-label="Mirror mornings">
          <div className="dhow__panel">
            <div className="dhow__head">
              <p className="dhow__title">Mirror mornings</p>
              <button type="button" className="dhow__x" aria-label="Close" onClick={() => setListOpen(false)}>
                ×
              </button>
            </div>
            <div className="dhow__body">
              <p>Low tide within {LOW_NEAR_SUNRISE_MIN} min of sunrise, and light or offshore wind at sunrise.</p>
              {mirror.length === 0 ? <p>None while the wind is forecast.</p> : null}
              <ul className="dtide__list">
                {mirror.map((m) => (
                  <li key={m.date}>
                    <b>{dayWords(m.date)}</b> · low {m.low === null ? '—' : formatClock(m.low, timeZone)} · sunrise {m.sunrise === null ? '—' : formatClock(m.sunrise, timeZone)}
                    {m.mark === 'surf-glass' ? ' · surf' : ''}
                  </li>
                ))}
              </ul>
              {tideOnly.length === 0 ? null : (
                <>
                  <p>Low tide near sunrise, past the wind forecast:</p>
                  <ul className="dtide__list">
                    {tideOnly.map((m) => (
                      <li key={m.date}>
                        {dayWords(m.date)} · low {m.low === null ? '—' : formatClock(m.low, timeZone)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

/** "How we got this": the station, the datum, predictions not observations, the sea's source. Short lines. */
export function TideHow({ tide, data, units }: { tide: TideInfo; data: TideSheetData; units: Units }) {
  const ok = tide.status === 'ok' ? tide : null
  return (
    <>
      {ok === null ? (
        <p>No NOAA station answered for this spot.</p>
      ) : (
        <>
          <p>
            Station: NOAA {ok.station.id}, {ok.station.name}, {formatRange(ok.distanceKm * 1000, units.distance)} away.
            {ok.distant ? ` Further than ${STATION_LOCAL_KM} km: times and heights here can differ.` : ''}
          </p>
          <p>Heights above MLLW: the average of each day’s lower low water.</p>
          <p>{ok.predictions.curveSource === 'published' ? 'The curve is NOAA’s six-minute prediction.' : 'NOAA publishes only highs and lows here; the curve between them is worked out on this phone.'}</p>
          <p>Predictions, not observations: the astronomical tide. Wind and pressure move the real water off it.</p>
          {ok.predictions.provenance.kind === 'live' ? null : <p>Saved on this phone; no signal for a fresh table.</p>}
        </>
      )}
      <p>Spring or neap: from the moon’s phase (suncalc). Within {SPRING_WITHIN} of a cycle (about 3 days) of a new or full moon is spring, of a half moon neap.</p>
      <p>Water temperature: Open-Meteo Marine’s sea-surface forecast for this hour, a model, not a buoy.{data.marine.savedAt === null ? '' : ' Saved copy.'}</p>
      <p>Wetsuit: the thickness chart wetsuit makers print. A convention; brands differ by a few degrees.</p>
      <p>
        Mirror mornings: a low within {LOW_NEAR_SUNRISE_MIN} min of sunrise, and wind at sunrise under {formatWind(GLASSY_MPS, units.wind)} or offshore (Open-Meteo, 16 days).
      </p>
      <p>Night: the sun below the horizon.</p>
    </>
  )
}
