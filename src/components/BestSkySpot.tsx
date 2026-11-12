import { distanceWords, type RankedSpot } from '../core/bestSky.ts'
import { clockParts } from '../core/bestSkyClock.ts'
import { compassPoint } from '../core/field.ts'
import type { LatLon } from '../core/geo.ts'
import { formatClock } from '../core/timezone.ts'
import type { BestSky, BestSkyEvent } from '../lib/useBestSky.ts'
import { BestSkyActions } from './BestSkyList.tsx'
import { clockSpan } from '../core/bestSkyWords.ts'
import { WordPill } from './bestSkyBits.tsx'
import '../styles/bestsky-spot.css'

/*
 * PAGE 3 · THE SPOT (Batch BEST SKY, Section 5; board BestSky_Spot). The
 * view from the spot, facing up the page: its open wedge, the sun's line,
 * the glow as strong as the score. Then what it faces and what is in front;
 * "Why here", a side drawing of the sun, the gap and the patch; the colour's
 * clock as a bar; where the satellite's frame stands.
 */
export function BestSkySpot({ venue, sky, chosen, miles, timeZone, now, onShowOnMap }: { venue: LatLon; sky: BestSky; chosen: RankedSpot | null; miles: boolean; timeZone: string; now: Date; onShowOnMap: (at: LatLon, when: Date) => void }) {
  const ev = sky.event
  if (chosen === null || ev === null) {
    return (
      <section className="bsky__page" aria-label="Spot">
        <p className="bsky__best">{sky.status === 'loading' ? 'Reading…' : 'No spot within reach.'}</p>
      </section>
    )
  }
  const s = chosen.spot
  const tags = [s.facing === null ? null : `faces ${compassPoint(s.facing)}`, s.water ? 'water in front' : null, s.silhouette === null ? null : `${s.silhouette} silhouette`, chosen.why[0]].filter((x): x is string => x !== null)
  return (
    <section className="bsky__page bsky__page--spot" aria-label="Spot">
      <SpotScene ranked={chosen} ev={ev} />
      <div className="bsky__spotcard">
        <div className="bsky__spothead">
          <p className="bsky__spotname" data-bsky-spot>
            {s.name}
          </p>
          <WordPill word={chosen.word} />
        </div>
        <p className="bsky__spotsub">{distanceWords(venue, s.at, miles)} of you</p>
        <p className="bsky__tags">
          {tags.map((t) => (
            <span key={t} className="bsky__tag">
              {t}
            </span>
          ))}
        </p>
        <div className="bsky__whyhere">
          <p className="bsky__label">Why here</p>
          <WhyHere ranked={chosen} ev={ev} />
        </div>
        <ColorClock ev={ev} timeZone={timeZone} />
        <p className="bsky__sat">{sky.satAt !== null ? `Satellite ${formatClock(sky.satAt, timeZone)} · the patch as it was then` : sky.satAsked ? 'The satellite did not answer; from the forecast models.' : 'From the forecast models; the satellite is read within 3 hours of the color.'}</p>
        <BestSkyActions sky={sky} chosen={chosen} timeZone={timeZone} now={now} onShowOnMap={onShowOnMap} />
      </div>
    </section>
  )
}

const rad = (d: number) => (d * Math.PI) / 180
/** The way from the spot at `deg` relative to where it faces, in the scene's box (facing is up). */
const ahead = (rel: number, r: number) => ({ x: 180 + Math.sin(rad(rel)) * r, y: 200 - Math.cos(rad(rel)) * r })

function SpotScene({ ranked, ev }: { ranked: RankedSpot; ev: BestSkyEvent }) {
  const f = ranked.spot.facing ?? ev.azimuth
  const rel = ((((ev.azimuth - f) % 360) + 540) % 360) - 180
  const sun = ahead(rel, 400)
  const glow = ahead(Math.max(-75, Math.min(75, rel * 0.6)), 130)
  const open = ranked.spot.facing === null ? null : ranked.spot.openDeg
  return (
    <svg className="bsky__scene" viewBox="0 0 360 220" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`${ranked.spot.name} faces ${compassPoint(f)}; the sun at ${Math.round(ev.azimuth)}°, ${ranked.seesSun ? 'in its open view' : 'outside its open view'}`}>
      <defs>
        <linearGradient id="bskySky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#13284a" />
          <stop offset="1" stopColor="#1d2f55" />
        </linearGradient>
        <radialGradient id="bskyGlow">
          <stop offset="0" stopColor="#f08a6c" stopOpacity="0.9" />
          <stop offset="0.6" stopColor="#b9607d" stopOpacity="0.35" />
          <stop offset="1" stopColor="#b9607d" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="360" height="220" fill="url(#bskySky)" />
      <ellipse cx={glow.x} cy={Math.min(110, glow.y)} rx="150" ry="70" fill="url(#bskyGlow)" opacity={Math.max(0.15, ranked.score)} data-bsky-glow />
      <path d="M0 140 Q90 118 170 150 L190 150 Q270 118 360 136 L360 220 L0 220 Z" className="bsky__land" />
      {ranked.spot.water ? <path d="M168 150 L192 150 L198 220 L162 220 Z" className="bsky__water" /> : null}
      {ranked.spot.silhouette === null ? null : (
        <g className="bsky__silhouette">
          <line x1="120" y1="166" x2="250" y2="156" />
          <text x="230" y="146">
            {ranked.spot.silhouette}
          </text>
        </g>
      )}
      {open === null ? null : (
        <>
          <line x1="180" y1="200" x2={ahead(-open, 260).x} y2={ahead(-open, 260).y} className="bsky__ray" />
          <line x1="180" y1="200" x2={ahead(open, 260).x} y2={ahead(open, 260).y} className="bsky__ray" />
        </>
      )}
      <line x1="180" y1="200" x2={sun.x} y2={sun.y} className="bsky__sunline" />
      <text x={Math.max(8, Math.min(300, 180 + Math.sin(rad(rel)) * 150))} y={Math.max(18, 200 - Math.cos(rad(rel)) * 150)} className="bsky__sunlab bsky__sunlab--left">
        sun {Math.round(ev.azimuth)}°
      </text>
      <circle cx="180" cy="200" r="16" className="bsky__herehalo" />
      <circle cx="180" cy="200" r="9" className="bsky__here" />
    </svg>
  )
}

/* Side on: the sun on the horizon toward its bearing, the light's way through the gap, the patch it lights, you. */
function WhyHere({ ranked, ev }: { ranked: RankedSpot; ev: BestSkyEvent }) {
  const what = ranked.why[0]
  const gap = ranked.why.find((w) => w.startsWith('gap ')) ?? null
  const patchX = what === 'patch overhead' ? 230 : 130
  const patch = what !== 'clear sky' && what !== 'low deck overhead'
  return (
    <svg className="bsky__profile" viewBox="0 0 320 100" role="img" aria-label={`Why here: ${ranked.why.join(', ')}`}>
      <line x1="0" y1="80" x2="320" y2="80" className="bsky__horizon" />
      <circle cx="22" cy="80" r="9" className="bsky__sun" />
      {patch ? (
        <>
          <path d={`M30 78 Q${patchX - 80} 70 ${patchX - 30} 34`} className="bsky__light" />
          <ellipse cx={patchX - 20} cy="30" rx="30" ry="8" className="bsky__cloud" />
          <ellipse cx={patchX + 18} cy="31" rx="26" ry="7" className="bsky__cloud bsky__cloud--deep" />
          <text x={patchX} y="16" className="bsky__plab">
            {what}
          </text>
        </>
      ) : (
        <text x="160" y="40" className="bsky__plab">
          {what}
        </text>
      )}
      {gap === null ? null : (
        <text x="60" y="62" className="bsky__plab bsky__plab--dim">
          {gap}
        </text>
      )}
      <path d="M224 66 L236 66 L230 78 Z" className="bsky__youmark" />
      <text x="244" y="76" className="bsky__plab bsky__plab--dim">
        you
      </text>
      <title>{`${ev.kind} ${Math.round(ev.azimuth)}°`}</title>
    </svg>
  )
}

function ColorClock({ ev, timeZone }: { ev: BestSkyEvent; timeZone: string }) {
  const parts = clockParts(ev)
  return (
    <div className="bsky__clock">
      <p className="bsky__times num">
        <span>set up {formatClock(ev.setUp, timeZone)}</span>
        <span>
          color {clockSpan(ev.colorFrom, ev.colorTo, timeZone)}
        </span>
        <span>peak {formatClock(ev.peak, timeZone)}</span>
        {ev.dark === null ? null : <span>dark {formatClock(ev.dark, timeZone)}</span>}
      </p>
      <div className="bsky__bar" aria-hidden="true">
        {parts.map((p) => (
          <span key={p.part} className={`bsky__barpart bsky__barpart--${p.part}`} style={{ flexGrow: p.share }} />
        ))}
      </div>
    </div>
  )
}
