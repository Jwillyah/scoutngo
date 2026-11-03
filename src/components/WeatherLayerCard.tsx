import { useEffect, useState } from 'react'
import { N0Q_PALETTE } from '../data/n0qPalette.ts'
import { formatClock } from '../core/timezone.ts'
import type { CellCall } from '../core/stormCells.ts'
import type { Strike } from '../core/lightning.ts'
import type { Alert } from '../lib/stormData.ts'
import { sliderSteps } from '../lib/radarLayer.ts'
import { RadarSlider } from './RadarSlider.tsx'
import type { WeatherLayer } from './FeaturesSheet.tsx'

/*
 * THE WEATHER LAYER'S CARD (Batch K addendum, D): the colour legend (tap a
 * colour for its value), a play button and the timeline; for radar the past
 * hour and a projection 90 minutes ahead, dimmed and labelled; for wind, the
 * height and the time bar (now to +24 h). An amber card when the venue sits
 * inside an NWS warning's polygon. Facts, never advice.
 */
const DBZ = [20, 30, 40, 50, 60, 65]
const WORD: Record<number, string> = { 20: 'light rain', 30: 'rain', 40: 'heavy rain', 50: 'very heavy, storms', 60: 'hail likely in it', 65: 'large hail possible' }
const colour = (dbz: number) => `#${N0Q_PALETTE[Math.round((dbz + 32.5) * 2)].toString(16).padStart(6, '0')}`

export function WeatherLayerCard({ layer, scanAt, calls, strikes, alerts, timeZone, windFt, onWindFt }: { layer: WeatherLayer; scanAt: Date | null; calls: readonly CellCall[]; strikes: readonly Strike[]; alerts: readonly Alert[]; timeZone: string; windFt: 0 | 400; onWindFt: (ft: 0 | 400) => void }) {
  const [tapped, setTapped] = useState<number | null>(null)
  const [play, setPlay] = useState(false)
  const [step, setStep] = useState(sliderSteps().indexOf(0))
  useEffect(() => {
    if (!play) return
    const t = setInterval(() => setStep((s) => (s + 1) % sliderSteps().length), 700)
    return () => clearInterval(t)
  }, [play])
  const warnings = alerts.filter((a) => /warning/i.test(a.event))
  return (
    <div className="wlay">
      {warnings.map((a) => (
        <p key={a.event + a.headline} className="wlay__warn">{a.event}{a.ends === null ? '' : ` until ${formatClock(a.ends, timeZone)}`}: the venue is inside its polygon (NWS)</p>
      ))}
      {layer === 'radar' ? (
        <>
          <div className="wlay__legend" role="group" aria-label="Radar colours">
            {DBZ.map((d) => (
              <button key={d} type="button" className="wlay__sw" style={{ background: colour(d) }} aria-label={`${d} dBZ: ${WORD[d]}`} onClick={() => setTapped(d)} />
            ))}
            <span className="wlay__val">{tapped === null ? 'Tap a colour' : `${tapped} dBZ · ${WORD[tapped]}`}</span>
          </div>
          {scanAt === null ? (
            <p className="wlay__note">Reading the radar…</p>
          ) : (
            <div className="wlay__time">
              <button type="button" className="wlay__play" aria-label={play ? 'Pause' : 'Play the radar'} aria-pressed={play} onClick={() => setPlay(!play)}>{play ? '❚❚' : '▶'}</button>
              <RadarSlider scanAt={scanAt} calls={calls} strikes={strikes} timeZone={timeZone} step={step} onStep={(i) => { setPlay(false); setStep(i) }} />
            </div>
          )}
        </>
      ) : layer === 'wind' ? (
        <>
          <div className="seg" role="group" aria-label="Wind height">
            <button type="button" className={`seg__btn${windFt === 0 ? ' seg__btn--on' : ''}`} aria-pressed={windFt === 0} onClick={() => onWindFt(0)}>Surface</button>
            <button type="button" className={`seg__btn${windFt === 400 ? ' seg__btn--on' : ''}`} aria-pressed={windFt === 400} onClick={() => onWindFt(400)}>400 ft</button>
          </div>
          <p className="wlay__note">Streaks move with the wind; brighter is stronger. The time bar moves it, now to +24 h. Cloud-level wind is not in the forecast the map uses (it reaches 180 m).</p>
        </>
      ) : layer === 'clouds' ? (
        <p className="wlay__note">GOES satellite cloud over the map, and the forecast&rsquo;s low, mid and high cloud in the squares; the time bar moves it.</p>
      ) : null}
    </div>
  )
}
