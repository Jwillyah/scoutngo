import { moonPath, scatter, STAR_BAND, type LiveSky as Sky } from '../core/liveSky.ts'
import '../styles/live-sky.css'

/*
 * THE LIVE SKY (Batch LIVE, Section 7): drawn in code behind the page, from
 * src/core/liveSky.ts. Inline SVG, no photos; the clouds drift slowly and
 * stop under Reduce Motion (src/styles/live-sky.css); a scrim keeps the
 * cards' words readable over a light sky.
 */
export function LiveSkyDraw({ sky }: { sky: Sky }) {
  const clouds = scatter(sky.clouds, 7)
  const stars = scatter(sky.stars, 3)
  const deck = sky.state === 'overcast' || sky.state === 'rain'
  return (
    <div className={`lsky lsky--${sky.state}`} aria-hidden="true" data-live-sky={sky.state} data-stars={sky.stars} data-clouds={sky.clouds}>
      <svg className="lsky__svg" viewBox="0 0 100 200" preserveAspectRatio="xMidYMid slice">
        <defs>
          <filter id="lsky-soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        {stars.map((s, i) => (
          <circle key={`s${i}`} cx={s.x * 100} cy={s.y * 200 * STAR_BAND} r={0.25 + s.r * 0.45} className="lsky__star" style={{ opacity: 0.35 + s.r * 0.6 }} />
        ))}
        {sky.moon === null ? null : <path d={moonPath(sky.moon.x * 100, sky.moon.y * 200, 5, sky.moon.fraction, sky.moon.waxing)} className="lsky__moon" style={{ opacity: sky.moon.opacity }} />}
        <g className="lsky__drift" filter="url(#lsky-soft)">
          {clouds.map((c, i) => {
            /* Every shape inside the frame, with room for the drift and the blur: nothing past the screen's edge. */
            const rx = deck ? 22 + c.r * 14 : 9 + c.r * 10
            const cx = rx + 6 + c.x * Math.max(0, 100 - 2 * (rx + 6))
            return <ellipse key={`c${i}`} cx={cx} cy={deck ? 12 + c.y * 70 : 14 + c.y * 90} rx={rx} ry={deck ? 9 + c.r * 6 : 4 + c.r * 4} className={deck || sky.state === 'night-cloudy' ? 'lsky__deck' : 'lsky__cloud'} />
          })}
        </g>
        {sky.state === 'rain'
          ? scatter(40, 11).map((r, i) => <line key={`r${i}`} x1={r.x * 100} y1={r.y * 200} x2={r.x * 100 - 1.5} y2={r.y * 200 + 7} className="lsky__streak" />)
          : null}
      </svg>
      {sky.state === 'fog' ? <div className="lsky__haze" /> : null}
      <div className="lsky__scrim" />
    </div>
  )
}
