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
export function RadarSlider({ scanAt, calls, strikes, timeZone }: { scanAt: Date; calls: readonly CellCall[]; strikes: readonly Strike[]; timeZone: string }) {
  const steps = sliderSteps()
  const [i, setI] = useState(steps.indexOf(0))
  const m = steps[i]
  const at = new Date(scanAt.getTime() + m * 60_000)
  const scan = scanAt.getTime()
  useEffect(() => {
    const t = new Date(scan + m * 60_000)
    if (m <= 0) {
      showRadar(t)
      showGuide(stormOnMap(strikes.filter((s) => s.frame.getTime() <= t.getTime() + 15 * 60_000), m === 0 ? calls : [], t))
    } else {
      showRadar(null)
      const moved = calls.filter((c) => c.towardDeg !== null || c.over).map((c) => ({ ...c, at: carried(c, m) }))
      showGuide(stormOnMap([], moved, t))
    }
  }, [m, scan]) // eslint-disable-line react-hooks/exhaustive-deps
  /* Off the map when the slider goes. */
  useEffect(() => () => showRadar(null), [])
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
