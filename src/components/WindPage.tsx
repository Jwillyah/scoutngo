import { useEffect, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import { windToBeach } from '../core/coastFacing.ts'
import { compassPoint } from '../core/field.ts'
import { formatClock, formatHour } from '../core/timezone.ts'
import { overRated, windTo, type WindHour } from '../core/windModels.ts'
import { formatWind, windIn, windUnitLabel, type WindUnit } from '../lib/units.ts'
import { fetchMeasuredWind, fetchWindModels, LEVEL_LABEL, type Measured, type WindLevel, type WindModels } from '../lib/windModelsData.ts'
import { seaBreeze, seaBreezeLine, STABILITY_WORD } from '../core/localWind.ts'
import { localDate, localHour } from '../core/modelSkill.ts'
import { fetchMarine, hourlyAt } from '../lib/tideSheetData.ts'
import { Page } from './Page.tsx'

/*
 * WIND: five models (GFS, HRRR, ECMWF, ICON, GEM), the median to read and
 * how far apart they are, at the ground, 80 m and 120 m, with what the
 * nearest weather station and buoy measure now. The drone's rated wind from
 * Kit is a line on the strip; above it the hour is amber. Nothing here says
 * a flight is safe: under the line is only under the line.
 */
interface Props {
  venue: LatLon
  at: Date
  timeZone: string
  unit: WindUnit
  /** For the sea breeze's land-sea contrast. */
  tempUnit?: 'C' | 'F'
  /** The drone in the bag, its rated wind (m/s) and name, from Kit. */
  drone: { name: string; ratedMps: number | null } | null
  /** The beach's facing, degrees, for offshore / cross / onshore; null inland. */
  facing: number | null
  onClose: () => void
  /** The wind card, for the flight height and the cams: the chip opens this page now, so the card is a tap from here. */
  onWindCard?: () => void
}

const STRIP_HOURS = 24
const W = 340
const H = 120
const COL = W / STRIP_HOURS

function Strip({ hours, rows, unit, ratedMps, timeZone, now, mark }: { hours: Date[]; rows: WindHour[]; unit: WindUnit; ratedMps: number | null; timeZone: string; now: number; mark?: Date | null }) {
  const shown = rows.slice(now, now + STRIP_HOURS)
  const top = Math.max(1, ...shown.map((r) => Math.max(r.gust ?? 0, r.p90 ?? 0)), ratedMps ?? 0) * 1.1
  const y = (mps: number) => H - 22 - (mps / top) * (H - 40)
  return (
    <svg className="windp__strip" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="The next 24 hours: arrows show where the wind blows to; bars the models' median; whiskers their 10 to 90% range; ticks the gusts">
      {ratedMps === null ? null : (
        <>
          <line x1={0} x2={W} y1={y(ratedMps)} y2={y(ratedMps)} className="windp__rated" />
          <text x={W - 2} y={y(ratedMps) - 3} textAnchor="end" className="windp__axis">
            rated {formatWind(ratedMps, unit)}
          </text>
        </>
      )}
      {mark === null || mark === undefined
        ? null
        : (() => {
            const i = hours.findIndex((h) => h.getTime() === mark.getTime()) - now
            if (i < 0 || i >= STRIP_HOURS) return null
            const x = i * COL + COL / 2
            return (
              <g className="windp__sb" data-sea-breeze={mark.toISOString()}>
                <line x1={x} x2={x} y1={14} y2={H - 22} />
                <text x={Math.min(W - 2, x + 3)} y={22} textAnchor={x > W - 60 ? 'end' : 'start'}>sea breeze</text>
              </g>
            )
          })()}
      {shown.map((r, i) => {
        const x = i * COL + COL / 2
        const over = overRated(r.median, ratedMps) || overRated(r.gust, ratedMps)
        return (
          <g key={i} className={over ? 'windp__hour windp__hour--over' : 'windp__hour'}>
            {r.median === null ? null : <rect x={x - COL * 0.3} y={y(r.median)} width={COL * 0.6} height={H - 22 - y(r.median)} className="windp__bar" />}
            {r.p10 === null || r.p90 === null ? null : <line x1={x} x2={x} y1={y(r.p10)} y2={y(r.p90)} className="windp__whisker" />}
            {r.gust === null ? null : <line x1={x - COL * 0.35} x2={x + COL * 0.35} y1={y(r.gust)} y2={y(r.gust)} className="windp__gust" />}
            {r.from === null ? null : (
              /* The arrow points where the air goes: TO, the FROM bearing plus 180. */
              <path d="M0 -5 L3 3 L0 1.5 L-3 3 Z" transform={`translate(${x} 9) rotate(${windTo(r.from)})`} className="windp__arrow" />
            )}
            {i % 6 === 0 ? (
              <text x={i === 0 ? 1 : x} y={H - 6} textAnchor={i === 0 ? 'start' : 'middle'} className="windp__axis num">
                {formatHour(hours[now + i], timeZone)}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}

export function WindPage({ venue, at, timeZone, unit, tempUnit = 'F', drone, facing, onClose, onWindCard }: Props) {
  const key = `${venue.lat},${venue.lon}`
  const [data, setData] = useState<{ key: string; models: WindModels | null; measured: Measured[]; seaC: number | null } | null>(null)
  const coastal = facing !== null
  useEffect(() => {
    let live = true
    void Promise.all([fetchWindModels(venue), fetchMeasuredWind(venue), coastal ? fetchMarine(venue).catch(() => null) : Promise.resolve(null)]).then(([models, measured, marine]) => {
      /* The sea's temperature at midday: the sea barely moves through a day. */
      const noon = new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000 + 17 * 3_600_000)
      if (live) setData({ key, models, measured, seaC: marine === null ? null : hourlyAt(marine.value, 'sea_surface_temperature', noon) })
    })
    return () => {
      live = false
    }
  }, [venue, key, coastal])
  const [level, setLevel] = useState<WindLevel>('ground')
  const loaded = data !== null && data.key === key ? data : null
  const models = loaded?.models ?? null
  const hourIndex = models === null ? -1 : models.hours.findIndex((h) => h.getTime() > at.getTime() - 1_800_000)
  const now = models === null || hourIndex < 0 ? null : models.byLevel[level][hourIndex]
  const rated = drone?.ratedMps ?? null
  const relation = now?.from == null || facing === null ? null : windToBeach(now.from, facing)
  const say = (mps: number | null) => formatWind(mps, unit)
  const spread = now?.p10 == null || now.p90 == null ? null : (windIn(now.p90, unit) ?? 0) - (windIn(now.p10, unit) ?? 0)
  /* The sea breeze for the day on the bar, from the models' ground wind and temperature against the sea (src/core/localWind.ts). */
  const sb = (() => {
    if (models === null || hourIndex < 0) return null
    const day = localDate(models.hours[hourIndex], timeZone)
    const hrs = models.hours.map((h, i) => ({ h, i })).filter(({ h }) => localDate(h, timeZone) === day)
    return seaBreeze(hrs.map(({ h, i }) => ({ at: h, hour: localHour(h, timeZone), tempC: models.tempC[i], mps: models.byLevel.ground[i].median, fromDeg: models.byLevel.ground[i].from })), facing, loaded?.seaC ?? null)
  })()
  const sbLine = seaBreezeLine(sb, { speed: (mps) => `${Math.round(windIn(mps, unit) ?? 0)} ${windUnitLabel(unit)}`, hour: (d) => formatHour(d, timeZone), diff: (c) => `${Math.round(tempUnit === 'F' ? c * 1.8 : c)}°` })
  const aloft = models === null || hourIndex < 0 ? null : models.aloft[hourIndex]

  return (
    <Page title="Wind" className="windp" onClose={onClose}>
      <div className="seg windp__levels" role="group" aria-label="Height">
        {(['ground', '80m', '120m'] as const).map((l) => (
          <button key={l} type="button" className={`seg__btn${level === l ? ' seg__btn--on' : ''}`} aria-pressed={level === l} onClick={() => setLevel(l)}>
            {LEVEL_LABEL[l]}
          </button>
        ))}
      </div>
      {loaded === null ? (
        <p className="windp__note">Reading five forecasts…</p>
      ) : models === null || now === null ? (
        <p className="windp__note">The models’ wind did not arrive, so there is nothing to show.</p>
      ) : (
        <>
          <p className={`windp__verdict${overRated(now.median, rated) || overRated(now.gust, rated) ? ' windp__verdict--over' : ''}`}>
            {say(now.median)} {now.from === null ? 'from no one direction' : `from the ${compassPoint(now.from)}`}
            {relation === null ? '' : `, ${relation}`}
            {level === 'ground' && now.gust !== null ? `, gusts ${say(now.gust)}` : ''}
          </p>
          <p className="windp__note num">
            {now.models} models{spread === null ? '' : `, ${Math.round(spread)} ${windUnitLabel(unit)} apart (10–90%)`}, at {formatClock(models.hours[hourIndex], timeZone)}.
            {rated === null || drone === null ? '' : overRated(now.median, rated) || overRated(now.gust, rated) ? ` Over the ${drone.name}’s rated ${say(rated)}.` : ` Under the ${drone.name}’s rated ${say(rated)}; that is a rating, not a promise.`}
          </p>
          {sbLine === null ? null : <p className="windp__sbline num" data-sea-breeze-line={sb?.kind}>{sbLine}</p>}
          <Strip hours={models.hours} rows={models.byLevel[level]} unit={unit} ratedMps={rated} timeZone={timeZone} now={hourIndex} mark={level === 'ground' && sb !== null && sb.kind !== 'held' ? sb.at : null} />
          <h3 className="windp__head">Measured now</h3>
          {loaded.measured.length === 0 ? (
            <p className="windp__note">No station or buoy nearby answered.</p>
          ) : (
            <ul className="windp__measured num">
              {loaded.measured.map((m) => (
                <li key={m.source}>
                  {m.source}: {say(m.mps)} {m.fromDeg === null ? 'variable' : `from the ${compassPoint(m.fromDeg)}`}
                  {m.gustMps === null ? '' : `, gusts ${say(m.gustMps)}`} · <span className="windp__t">{formatClock(m.at, timeZone)}</span>
                </li>
              ))}
            </ul>
          )}
          <details className="windp__how">
            <summary aria-label="How this is worked out">i</summary>
            <p>
              Speed: the median of GFS, HRRR, ECMWF, ICON and GEM (Open-Meteo), with the 10–90% range across them as the whisker. Direction: the circular mean of where the wind comes from; the arrows point where it goes. Gusts at the ground only, the highest any model gives. 80 m and 120 m are the models’ own heights. Measured: the nearest weather station’s METAR and the nearest NOAA buoy.
            </p>
            {aloft === null ? null : (
              <p className="num" data-aloft-factor={aloft.factor.toFixed(2)}>
                400 ft at {formatClock(models.hours[hourIndex], timeZone)}: about {aloft.factor.toFixed(1)}× the ground wind ({STABILITY_WORD[aloft.cls]}, profile exponent {aloft.alpha.toFixed(2)}), from the sun’s height, the cloud and the wind. Sun-heated ground mixes the wind aloft down, so the step up is small; a clear, calm night sets an inversion and the wind above runs on without the ground.
                {models.filled120.length === 0 ? '' : ` ${models.filled120.join(' and ')} ${models.filled120.length === 1 ? 'has' : 'have'} no 120 m level: ${models.filled120.length === 1 ? 'its' : 'their'} 120 m is ${models.filled120.length === 1 ? 'its' : 'their'} ground wind times that factor.`}
              </p>
            )}
            {facing === null ? null : <p>Sea breeze: the land’s forecast temperature against the sea’s ({loaded.seaC === null ? 'not forecast here' : `${Math.round(loaded.seaC)}°C`}); it needs about 3°C more, and more again for each bit of wind off the land, which holds it back. The time and direction said are the models’ own turn onshore, when they show one.</p>}
          </details>
        </>
      )}
      {onWindCard === undefined ? null : (
        <button type="button" className="btn btn--small windp__card" onClick={onWindCard}>
          Wind at your flight height
        </button>
      )}
    </Page>
  )
}
