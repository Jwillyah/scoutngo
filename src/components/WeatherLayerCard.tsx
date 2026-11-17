import '../styles/wind.css'
import { useEffect, useState } from 'react'
import { N0Q_PALETTE } from '../data/n0qPalette.ts'
import { formatClock } from '../core/timezone.ts'
import type { CellCall } from '../core/stormCells.ts'
import type { Strike } from '../core/lightning.ts'
import type { Alert } from '../lib/stormData.ts'
import type { Upstream } from '../core/warnUpstream.ts'
import { compassPoint } from '../core/field.ts'
import { sliderSteps } from '../lib/radarLayer.ts'
import { percentBand, RAIN_AHEAD_H, RAIN_PAST_H, type BarSpan } from '../core/layerTimeline.ts'
import { RadarSlider } from './RadarSlider.tsx'
import type { WeatherLayer } from './FeaturesSheet.tsx'

/*
 * THE WEATHER LAYER'S CARD (Batch K addendum, D): the colour legend (tap a
 * colour for its value), a play button and the timeline; for radar the past
 * hour and a projection 90 minutes ahead, dimmed and labelled; for wind, the
 * height and the time bar (now to +24 h). An amber card when the venue sits
 * inside an NWS warning's polygon. Facts, never advice.
 */
/** "Severe Thunderstorm Warning 18 mi W · moving E 25 mph toward you (NWS)": a fact, never advice. */
function upstreamLine(event: string, up: Upstream, dist: 'mi' | 'km'): string {
  const d = Math.max(1, Math.round(dist === 'mi' ? up.km / 1.609344 : up.km))
  const sp = Math.round(dist === 'mi' ? up.kt * 1.15078 : up.kt * 1.852)
  return `${event} ${d} ${dist} ${compassPoint(up.bearingDeg)} · moving ${compassPoint(up.towardDeg)} ${sp} ${dist === 'mi' ? 'mph' : 'km/h'} toward you (${up.motionFrom === 'nws' ? 'NWS' : 'NWS polygon, radar motion'})`
}

const DBZ = [20, 30, 40, 50, 60, 65]
const WORD: Record<number, string> = { 20: 'light rain', 30: 'rain', 40: 'heavy rain', 50: 'very heavy, storms', 60: 'hail likely in it', 65: 'large hail possible' }
const colour = (dbz: number) => `#${N0Q_PALETTE[Math.round((dbz + 32.5) * 2)].toString(16).padStart(6, '0')}`

/*
 * THE RADAR LEGEND (8 Nov). While radar is on it takes the time sheet's place
 * at the foot of the screen, the one strip that stays up at every height of
 * the sheet: in the card it sat under the time bar, at half height it ran
 * toward the bottom edge, and lowering the sheet to see the map hid it. The
 * time bar has nothing to say to radar, which has its own timeline here.
 */
/** Radar's rain strip (Batch FIX 2.5): the chance of rain at the marker, by the hour, over src/core/layerTimeline.ts rainSpan. */
export interface RainStrip {
  /** Per cent by the hour from the strip's start; null where the forecast did not say. */
  values: readonly (number | null)[]
  span: BarSpan
  /** Now along the strip, 0 to 1. */
  nowX: number
}

export function RadarLegend({ scanAt, calls, strikes, timeZone, rain = null }: { scanAt: Date | null; calls: readonly CellCall[]; strikes: readonly Strike[]; timeZone: string; rain?: RainStrip | null }) {
  const [play, setPlay] = useState(false)
  const [step, setStep] = useState(sliderSteps().indexOf(0))
  useEffect(() => {
    if (!play) return
    const t = setInterval(() => setStep((s) => (s + 1) % sliderSteps().length), 700)
    return () => clearInterval(t)
  }, [play])
  return (
    <div className="wlay wlay--peek" data-radar-legend>
      {/* Batch Polish 2, Section 1: one labelled bar, light to extreme, the radar's own colours; the dotted edge is where radar ends and the satellite's estimate goes on. */}
      <div className="wlay__legend wlay__legend--bar" role="img" aria-label={`Radar colours, light to extreme: ${DBZ.map((d) => WORD[d]).join(', ')}. Past the dotted line, the satellite's estimate.`}>
        <span className="wlay__bar" style={{ background: `linear-gradient(90deg, ${DBZ.map((d, i) => `${colour(d)} ${Math.round((i / (DBZ.length - 1)) * 100)}%`).join(', ')})` }} />
        <span className="wlay__ends" aria-hidden="true">
          <span>Light</span>
          <span>Heavy</span>
          <span>Extreme</span>
        </span>
        <span className="wlay__est" aria-hidden="true">
          <i className="rain__dots" /> satellite estimate
        </span>
      </div>
      {rain === null ? null : <RainBand rain={rain} />}
      {scanAt === null ? (
        <p className="wlay__note">Reading the radar…</p>
      ) : (
        <div className="wlay__time">
          <button type="button" className="wlay__play" aria-label={play ? 'Pause' : 'Play the radar'} aria-pressed={play} onClick={() => setPlay(!play)}>{play ? '❚❚' : '▶'}</button>
          <RadarSlider scanAt={scanAt} calls={calls} strikes={strikes} timeZone={timeZone} step={step} onStep={(i) => { setPlay(false); setStep(i) }} />
        </div>
      )}
    </div>
  )
}

/*
 * THE CHANCE OF RAIN ON RADAR'S BAR (Batch FIX, Section 2.5): the past
 * RAIN_PAST_H hours and the next RAIN_AHEAD_H, a bar per hour at its per cent,
 * a line at now. Where the forecast said nothing there is no bar (never a
 * zero), and with nothing at all the strip says so.
 */
function RainBand({ rain }: { rain: RainStrip }) {
  const band = percentBand(rain.values, rain.span)
  const most = rain.values.reduce<number | null>((m, v) => (v === null ? m : m === null ? v : Math.max(m, v)), null)
  return (
    <div className="wlay__rain" data-rain-band={band.length}>
      <span className="wlay__rainword">{most === null ? 'Rain —' : `Rain up to ${Math.round(most)}%`}</span>
      {/* Batch FIX, Section 2.5: one row (the ends beside the plot, not under it), so the radar's peek still fits a standalone iPhone. */}
      <span className="wlay__rainend" aria-hidden="true">−{RAIN_PAST_H} h</span>
      <span className="wlay__rainplot" role="img" aria-label={most === null ? 'Chance of rain: the forecast did not say' : `Chance of rain, the past ${RAIN_PAST_H} h and the next ${RAIN_AHEAD_H} h, up to ${Math.round(most)}%; the line is now`}>
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
          {band.map((b) => (
            <rect key={b.x} className="wlay__rainbar" x={b.x * 1000 + 0.5} y={100 - b.h * 100} width={Math.max(1, b.w * 1000 - 1)} height={b.h * 100} />
          ))}
          <line className="wlay__rainnow" x1={rain.nowX * 1000} x2={rain.nowX * 1000} y1={0} y2={100} vectorEffect="non-scaling-stroke" />
        </svg>
        {band.length === 0 ? <span className="wlay__rainnone">the forecast did not say</span> : null}
      </span>
      <span className="wlay__rainend" aria-hidden="true">+{RAIN_AHEAD_H} h</span>
    </div>
  )
}

export function WeatherLayerCard({ layer, alerts, upstream = [], dist = 'mi', timeZone, windFt, onWindFt, cloudLabel = null, onCloudRetry }: { layer: WeatherLayer; alerts: readonly Alert[]; upstream?: readonly { alert: Alert; up: Upstream }[]; dist?: 'mi' | 'km'; timeZone: string; windFt: 0 | 400; onWindFt: (ft: 0 | 400) => void; cloudLabel?: { text: string; failed: boolean } | null; onCloudRetry?: () => void }) {
  const warnings = alerts.filter((a) => /warning/i.test(a.event))
  return (
    <div className="wlay">
      {warnings.map((a) => (
        <p key={a.event + a.headline} className="wlay__warn">{a.event}{a.ends === null ? '' : ` until ${formatClock(a.ends, timeZone)}`}: the venue is inside its polygon (NWS)</p>
      ))}
      {upstream.slice(0, 2).map(({ alert: a, up }) => (
        <p key={`up${a.event}${a.headline}`} className="wlay__warn wlay__warn--up num" data-upstream>
          {upstreamLine(a.event, up, dist)}
          {a.ends === null ? '' : ` · until ${formatClock(a.ends, timeZone)}`}
        </p>
      ))}
      {layer === 'radar' ? (
        <p className="wlay__note">While radar is on, its colours and its timeline take the time bar&rsquo;s place. The cloud under the radar is GOES infrared.</p>
      ) : layer === 'wind' ? (
        <>
          <div className="seg" role="group" aria-label="Wind height">
            <button type="button" className={`seg__btn${windFt === 0 ? ' seg__btn--on' : ''}`} aria-pressed={windFt === 0} onClick={() => onWindFt(0)}>Surface</button>
            <button type="button" className={`seg__btn${windFt === 400 ? ' seg__btn--on' : ''}`} aria-pressed={windFt === 400} onClick={() => onWindFt(400)}>400 ft</button>
          </div>
          <p className="wlay__note">{windFt === 0 ? 'The colour is the wind’s speed; the white lines move with it. The marker reads the wind where it sits: hold the map anywhere to move it. Play runs the bar’s five days.' : 'Streaks move with the wind at 400 ft; brighter is stronger. Cloud-level wind is not in the forecast the map uses (it reaches 180 m).'}</p>
        </>
      ) : layer === 'clouds' ? (
        <>
          {/* Batch NOW, Section 4: one label, "Satellite 11:10 AM" or "Forecast · Sat 1 AM"; a satellite that failed says so, with a retry, never an empty map. */}
          {cloudLabel === null ? null : cloudLabel.failed ? (
            <p className="wlay__label" data-sky-label="failed">
              Satellite didn&rsquo;t load ·{' '}
              <button type="button" className="skykey__retry" onClick={onCloudRetry}>
                Retry
              </button>
            </p>
          ) : (
            <p className="wlay__label" data-sky-label={cloudLabel.text.startsWith('Satellite') ? 'satellite' : 'forecast'}>
              {cloudLabel.text}
            </p>
          )}
          <p className="wlay__note">GOES satellite cloud now and before (infrared at night); after now the forecast&rsquo;s low, mid and high cloud as a soft field, the last frame fading into it over 3 hours. The time bar moves it.</p>
        </>
      ) : null}
    </div>
  )
}
