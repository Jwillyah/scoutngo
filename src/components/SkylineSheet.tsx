import { formatClock } from '../core/timezone.ts'
import { skylineAt } from '../core/skyRing.ts'
import type { SkylineResult } from '../lib/skyline/skylineFor.ts'
import { skylineLines } from '../lib/skyline/words.ts'

/*
 * THE SKYLINE: a picture of the world all the way round from one spot, the
 * sun's and moon's paths across it, then one sentence, then the times.
 *
 * Left to right is the compass (north, east, south, west, north); up is the
 * angle above level, to TOP_DEG. The grey is what the scan measured standing
 * there (src/core/skyRing.ts); the gold line is the sun's path today, the
 * pale one the moon's, drawn only while they are up.
 */
export type SkylineState = SkylineResult | 'no-scan' | 'off-scan' | 'loading'

interface SkylineSheetProps {
  state: SkylineState
  timeZone: string
  /** Where it is from, in words: "the venue pin" or "where you stand". */
  from: string
  /** Eye height or the drone's. */
  height: 'eye' | 'drone'
  droneFt: number
  onHeight: (h: 'eye' | 'drone') => void
  onClose: () => void
  /** The 3D scan's download, offered right here when there is none (ScanOffer.tsx). */
  scanOffer: React.ReactNode
}

const W = 360
const H = 120
const TOP_DEG = 45
const y = (deg: number) => H - (Math.max(-2, Math.min(TOP_DEG, deg)) / TOP_DEG) * (H - 8) - 2

function pathLine(points: { azimuth: number; altitude: number }[]): string {
  /* Broken where the path wraps past north or dips below the horizon. */
  let d = ''
  let prev: { azimuth: number; altitude: number } | null = null
  for (const p of points) {
    const up = p.altitude > -1
    if (!up) {
      prev = null
      continue
    }
    const jump = prev !== null && Math.abs(p.azimuth - prev.azimuth) > 180
    d += `${prev === null || jump ? 'M' : 'L'}${p.azimuth.toFixed(1)},${y(p.altitude).toFixed(1)}`
    prev = p
  }
  return d
}

export function SkylineSheet({ state, timeZone, from, height, droneFt, onHeight, onClose, scanOffer }: SkylineSheetProps) {
  const r = typeof state === 'string' ? null : state
  const lines = r === null ? [] : skylineLines(r.events, r.sunset, timeZone)
  const ground = r === null ? '' : `M0,${H} ` + Array.from({ length: W + 1 }, (_, x) => `L${x},${y(skylineAt(r.skyline, x)).toFixed(1)}`).join(' ') + ` L${W},${H} Z`
  return (
    <section className="tides skyl" aria-label="Skyline">
      <div className="tides__head">
        <p className="tides__title">Skyline</p>
        <button type="button" className="card2__x" onClick={onClose} aria-label="Back to the shoot">
          ×
        </button>
      </div>
      <div className="seg" role="group" aria-label="Height">
        <button type="button" className={`seg__btn${height === 'eye' ? ' seg__btn--on' : ''}`} aria-pressed={height === 'eye'} onClick={() => onHeight('eye')}>
          Eye height
        </button>
        <button type="button" className={`seg__btn${height === 'drone' ? ' seg__btn--on' : ''}`} aria-pressed={height === 'drone'} onClick={() => onHeight('drone')}>
          Drone, {droneFt} ft
        </button>
      </div>
      {state === 'loading' ? (
        <p className="pf__prompt">Working out the skyline…</p>
      ) : state === 'no-scan' ? (
        scanOffer
      ) : state === 'off-scan' ? (
        <p className="pf__prompt">This spot is outside the scanned patch, or the scan measured no ground there.</p>
      ) : r === null ? null : (
        <>
          <svg className="skyl__pic" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`The skyline all the way round from ${from}, with the sun's and moon's paths today`}>
            <path d={ground} className="skyl__ground" />
            <path d={pathLine(r.moonPath)} className="skyl__moon" />
            <path d={pathLine(r.sunPath)} className="skyl__sun" />
            {r.events.map((e) => {
              const p = (e.body === 'sun' ? r.sunPath : r.moonPath).reduce((best, q) => (Math.abs(q.at.getTime() - e.at.getTime()) < Math.abs(best.at.getTime() - e.at.getTime()) ? q : best))
              return <circle key={`${e.body}${e.at.getTime()}`} cx={p.azimuth} cy={y(p.altitude)} r={3} className={e.body === 'sun' ? 'skyl__dot--sun' : 'skyl__dot--moon'} />
            })}
          </svg>
          <div className="skyl__axis num" aria-hidden="true">
            <span>N</span>
            <span>E</span>
            <span>S</span>
            <span>W</span>
            <span>N</span>
          </div>
          <p className="skyl__lead">{lines[0]}</p>
          {lines.slice(1).map((l) => (
            <p key={l} className="pf__small num">
              {l}
            </p>
          ))}
          <p className="pf__small num">
            From {from},{' '}
            {height === 'eye' ? `eye height (1.6 m) above what the scan measured there, ${r.standM.toFixed(1)} m` : `${droneFt} ft above the ground there, ${r.groundM.toFixed(1)} m`} on its datum. Within 2 m of the spot is left out.
            {r.sunset === null ? '' : ` Sunset ${formatClock(r.sunset, timeZone)}.`} What stands there is the scan's; anything built since is not in it.
          </p>
        </>
      )}
    </section>
  )
}
