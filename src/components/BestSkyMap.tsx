import { attachLabels, leader, spreadPins } from '../core/bestSkyPins.ts'
import { distanceWords, type RadiusMi, type RankedSpot } from '../core/bestSky.ts'
import { areaTiles, areaView, ringPx, washBlur, washSpots } from '../core/bestSkyView.ts'
import type { LatLon } from '../core/geo.ts'
import { inView } from '../core/tileView.ts'
import { IMAGERY_TEMPLATE } from '../lib/offlineSources.ts'
import { tileUrl } from '../lib/tileRange.ts'
import type { BestSky } from '../lib/useBestSky.ts'
import { clockSpan, radiusWords } from '../core/bestSkyWords.ts'
import { formatClock } from '../core/timezone.ts'
import { RadiusChips, WordPill } from './bestSkyBits.tsx'

/*
 * PAGE 1 · THE MAP (Batch BEST SKY, Section 3; board BestSky_Map). The
 * imagery round you, darkened to the night ground; a soft wash where the
 * canvas and the gap score (nothing where the sky is clear or blocked: no
 * labels on it, its key is under "How we got this"); the ranked spots; you;
 * the sun's line; the radius. The sheet: the best spot and the radius.
 */
const PILL_H = 24
const PILL_CHAR = 8.2
const FONT = 14

export function BestSkyMap({ venue, radius, sky, top, miles, timeZone, onPick, onRadius }: { venue: LatLon; radius: RadiusMi; sky: BestSky; top: RankedSpot[]; miles: boolean; timeZone: string; onPick: (id: string) => void; onRadius: (r: RadiusMi) => void }) {
  const ev = sky.event
  const best = top[0] ?? null
  return (
    <section className="bsky__page bsky__page--map" aria-label="Map">
      <AreaMap venue={venue} radius={radius} sky={sky} top={top} miles={miles} timeZone={timeZone} onPick={onPick} />
      <div className="bsky__sheet" data-bsky-sheet>
        {sky.status === 'loading' ? (
          <p className="bsky__best">Reading the cloud over the area…</p>
        ) : sky.status === 'failed' ? (
          <p className="bsky__best">The forecast did not answer for the area.</p>
        ) : best === null ? (
          <p className="bsky__best">Little color likely anywhere within {radiusWords(radius, miles)}</p>
        ) : (
          <>
            <p className="bsky__best">
              <span>
                Best: {best.spot.name} · {distanceWords(venue, best.spot.at, miles)}
              </span>
              <WordPill word={best.word} />
            </p>
            <p className="bsky__why">
              {best.why.join(' · ')}
              {ev === null ? '' : ` · color ${clockSpan(ev.colorFrom, ev.colorTo, timeZone)}`}
            </p>
          </>
        )}
        <RadiusChips radius={radius} miles={miles} onRadius={onRadius} />
      </div>
    </section>
  )
}

function AreaMap({ venue, radius, sky, top, miles, timeZone, onPick }: { venue: LatLon; radius: RadiusMi; sky: BestSky; top: RankedSpot[]; miles: boolean; timeZone: string; onPick: (id: string) => void }) {
  const view = areaView(venue, radius)
  const W = view.width
  const H = view.height
  const you = inView(view, venue)
  const ring = ringPx(view, venue, radius)
  const ev = sky.event
  const sun = ev === null ? null : { dx: Math.sin((ev.azimuth * Math.PI) / 180), dy: -Math.cos((ev.azimuth * Math.PI) / 180) }
  const reach = Math.hypot(W, H)
  /* Batch LIVE, Section 8.1: pins pushed apart (never on each other), "You" among them; each label beside its pin with a leader, clear of the sun's label. */
  const truePins = top.map((r) => inView(view, r.spot.at))
  const spread = spreadPins([...truePins, you])
  const pins = top.map((r, i) => ({ r, p: spread[i], at: truePins[i] }))
  const youAt = spread[spread.length - 1]
  const youText = `You · ${sky.here === null ? '…' : sky.here.word === 'Little' ? 'little here' : `${sky.here.word.toLowerCase()} here`}`
  const labels = [...pins.map(({ r, p }) => ({ text: r.spot.name, p })), { text: youText, p: youAt }]
  const sunLab =
    sun === null || ev === null
      ? null
      : (() => {
          const text = `sun ${Math.round(ev.azimuth)}° · ${formatClock(ev.at, timeZone)}`
          const w = text.length * PILL_CHAR
          const cx = Math.max(70, Math.min(W - 70, you.x + sun.dx * ring * 1.02))
          const cy = Math.max(20, Math.min(H - 20, you.y + sun.dy * ring * 1.02 - 10))
          return { text, cx, cy, box: { x: cx - w / 2 - 4, y: cy - FONT - 2, w: w + 8, h: FONT + 8 } }
        })()
  const spots = attachLabels(
    labels.map((l) => ({ pin: l.p, w: l.text.length * PILL_CHAR + 18, h: PILL_H })),
    W,
    H,
    sunLab === null ? [] : [sunLab.box],
  )
  return (
    <svg className="bsky__map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`The area within ${radiusWords(radius, miles)}: where the color scores, the ranked spots and you`}>
      <defs>
        <radialGradient id="bskyWash">
          <stop offset="0" stopColor="#f08a6c" stopOpacity="1" />
          <stop offset="0.55" stopColor="#c8607a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#c8607a" stopOpacity="0" />
        </radialGradient>
        <filter id="bskySoft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={washBlur(view, sky.grid)} />
        </filter>
      </defs>
      {areaTiles(view).map((t) => (
        <image key={`${t.z}/${t.x}/${t.y}`} href={tileUrl(IMAGERY_TEMPLATE, t)} x={t.dx} y={t.dy} width={256} height={256} />
      ))}
      <rect width={W} height={H} className="bsky__shade" />
      <g className="bsky__wash" data-bsky-wash filter="url(#bskySoft)">
        {washSpots(view, sky.grid).map((s) => (
          <circle key={`${s.x.toFixed(1)},${s.y.toFixed(1)}`} cx={s.x} cy={s.y} r={s.r} fill="url(#bskyWash)" opacity={s.o} />
        ))}
      </g>
      <circle cx={you.x} cy={you.y} r={ring} className="bsky__ring" />
      <text x={you.x + ring * 0.72} y={you.y - ring * 0.72} className="bsky__ringlab">
        {radiusWords(radius, miles)}
      </text>
      {sun === null || ev === null ? null : (
        <>
          <line x1={you.x} y1={you.y} x2={you.x + sun.dx * reach} y2={you.y + sun.dy * reach} className="bsky__sunline" />
          {sunLab === null ? null : (
            <text x={sunLab.cx} y={sunLab.cy} className="bsky__sunlab" data-bsky-sunlab>
              {sunLab.text}
            </text>
          )}
        </>
      )}
      {/* Drawn last to first, so #1 is on top where two spots nearly meet (Lynnhaven Inlet and Lesner Bridge, 0.5 km apart). */}
      {pins.map(({ r, p, at }, i) => ({ r, p, at, i })).reverse().map(({ r, p, at, i }) => (
        <g key={r.spot.id} className="bsky__spot" role="button" tabIndex={0} aria-label={`${i + 1}. ${r.spot.name}`} onClick={() => onPick(r.spot.id)} data-pin={`${p.x.toFixed(1)},${p.y.toFixed(1)}`}>
          {Math.hypot(p.x - at.x, p.y - at.y) > 3 ? <line x1={at.x} y1={at.y} x2={p.x} y2={p.y} className="bsky__leader" /> : null}
          <circle cx={p.x} cy={p.y} r="13" className={i === 0 ? 'bsky__spotdot bsky__spotdot--first' : 'bsky__spotdot'} />
          <text x={p.x} y={p.y + 5} className="bsky__spotnum">
            {i + 1}
          </text>
        </g>
      ))}
      <rect x={youAt.x - 9} y={youAt.y - 9} width="18" height="18" rx="5" className="bsky__you" />
      {labels.map((l, i) => {
        const at = spots[i]
        if (at === null || at === undefined) return null
        const w = l.text.length * PILL_CHAR + 18
        const ld = leader(at, l.p)
        return (
          <g key={`lab${i}`} className="bsky__lab" aria-hidden="true" data-lab={`${at.x.toFixed(1)},${at.y.toFixed(1)},${w},${PILL_H}`} data-lab-pin={`${l.p.x.toFixed(1)},${l.p.y.toFixed(1)}`}>
            <line x1={ld.x1} y1={ld.y1} x2={ld.x2} y2={ld.y2} className="bsky__leader" />
            <rect x={at.x} y={at.y} width={w} height={PILL_H} rx={PILL_H / 2} />
            <text x={at.x + w / 2} y={at.y + PILL_H / 2 + FONT * 0.36}>
              {l.text}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
