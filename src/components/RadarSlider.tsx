import { useEffect, useState } from 'react'
import { carried } from '../core/shooterStorm.ts'
import { stormOnMap } from '../core/lightning.ts'
import type { CellCall } from '../core/stormCells.ts'
import type { Strike } from '../core/lightning.ts'
import { formatClock } from '../core/timezone.ts'
import { showRadar, sliderSteps } from '../lib/radarLayer.ts'
import { showGuide } from '../lib/useBestView.ts'

/*
 * THE RADAR MAP'S TIME SLIDER (Batch K, Section 6). Left of now is the
 * radar, frame by frame, with the lightning of that hour; right of now is a
 * PROJECTION: the radar comes off and the tracked cells are drawn where
 * their straight-line motion puts them, labelled so. It never looks like
 * radar it is not.
 */
/* The slider's drawing is a layer: the map is not jumped to it on every step. */
const layered = (fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection => ({ ...fc, features: fc.features.map((f) => ({ ...f, properties: { ...f.properties, layer: true } })) })

export function RadarSlider({ scanAt, calls, strikes, timeZone, step, onStep }: { scanAt: Date; calls: readonly CellCall[]; strikes: readonly Strike[]; timeZone: string; step?: number; onStep?: (i: number) => void }) {
  const steps = sliderSteps()
  const [own, setOwn] = useState(steps.indexOf(0))
  /* Controlled when the card plays it (WeatherLayerCard), its own otherwise. */
  const i = step ?? own
  const setI = onStep ?? setOwn
  const m = steps[i]
  const at = new Date(scanAt.getTime() + m * 60_000)
  const scan = scanAt.getTime()
  useEffect(() => {
    const t = new Date(scan + m * 60_000)
    if (m <= 0) {
      showRadar(t)
      showGuide(layered(stormOnMap(strikes.filter((s) => s.frame.getTime() <= t.getTime() + 15 * 60_000), m === 0 ? calls : [], t)))
    } else {
      showRadar(null)
      const moved = calls.filter((c) => c.towardDeg !== null || c.over).map((c) => ({ ...c, at: carried(c, m) }))
      showGuide(layered(stormOnMap([], moved, t)))
    }
  }, [m, scan]) // eslint-disable-line react-hooks/exhaustive-deps
  /* The radar stays on when the card goes: the layer is the Features sheet's to turn off (Batch K addendum, D). */
  return (
    <div className="rslide">
      <p className={`rslide__when num${m > 0 ? ' rslide__when--proj' : ''}`}>
        {formatClock(at, timeZone)} · {m <= 0 ? (m === 0 ? 'radar now' : `radar, ${-m} min ago`) : `projection, ${m} min ahead: cells carried straight`}
      </p>
      <input className="rslide__range" type="range" min={0} max={steps.length - 1} step={1} value={i} aria-label="Radar time: the past hour, then a projection 90 minutes ahead" onChange={(e) => setI(Number(e.target.value))} />
      <p className="rslide__ends num" aria-hidden="true">
        <span>−1 h</span>
        <span>now</span>
        <span>+90 min</span>
      </p>
    </div>
  )
}
