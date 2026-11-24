import type { ReactNode } from 'react'
import type { MomentKind } from '../core/homeTiles.ts'

/*
 * THE HOME TILES' MINI PICTURES (Batch SIMPLE-3, Section 2.1; mockup
 * Home_Visual, approved). Each tile's lower half: a live picture of the
 * number above it, drawn from data TileHome already worked out, never a
 * value of its own. Every picture is an SVG that stretches to the tile
 * (preserveAspectRatio none, strokes that do not scale) with its words in
 * HTML on a row under it, so a word is never squashed with the drawing.
 * The words go first when a tile is short (src/styles/home-tiles.css),
 * then the drawing shrinks; the picture itself never disappears once
 * drawn (S0's rule): a part shown keeps its picture.
 *
 * x along every picture is a share of its span, 0 to 1.
 */

export interface Tick {
  /** 0 to 1 across the picture. */
  x: number
  text: string
  tone?: 'now' | 'event' | 'tide' | 'moon'
}

const W = 160
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** The words under a picture, each at its own x; the ends hold to the edges. */
export function Ticks({ ticks }: { ticks: readonly Tick[] }) {
  return (
    <span className="hpic__ticks">
      {ticks.map((t, i) => {
        const x = clamp01(t.x)
        const anchor = x < 0.15 ? 'start' : x > 0.85 ? 'end' : 'mid'
        return (
          <span key={`${i}${t.text}`} className={`hpic__tick${t.tone === undefined ? '' : ` hpic__tick--${t.tone}`}`} data-anchor={anchor} style={{ left: `${(x * 100).toFixed(1)}%` }}>
            {t.text}
          </span>
        )
      })}
    </span>
  )
}

function Frame({ kind, children, ticks, top, data }: { kind: string; children: ReactNode; ticks: readonly Tick[]; top?: ReactNode; data?: Record<string, string> }) {
  return (
    <span className={`hpic hpic--frame hpic--${kind}`} aria-hidden="true" {...data}>
      {top === undefined ? null : <span className="hpic__top">{top}</span>}
      <span className="hpic__draw">{children}</span>
      {ticks.length === 0 ? null : <Ticks ticks={ticks} />}
    </span>
  )
}

/* ------------------------------------------------------------- sky */

/**
 * The sun's arc for the day of the call, sunrise at the left, sunset at the
 * right: the sun where it is now when it is up (by the clock along the
 * day), the event's end of the arc marked; a cloud band over it saying the
 * cover now and when it changes. Warm when the call is Likely or Possible.
 */
export function SkyPic({ nowShare, eventShare, eventText, lit, band, nowText }: { nowShare: number | null; eventShare: number; eventText: string; lit: boolean; band: string | null; nowText: string | null }) {
  const arcY = (s: number) => 34 - Math.sin(clamp01(s) * Math.PI) * 28
  const ticks: Tick[] = [...(nowShare === null || nowText === null || Math.abs(nowShare - eventShare) < 0.25 ? [] : [{ x: nowShare, text: nowText, tone: 'now' as const }]), { x: eventShare, text: eventText, tone: 'event' as const }]
  return (
    <Frame kind="sky" ticks={ticks} top={band === null ? undefined : <span className="hpic__band">{band}</span>} data={{ 'data-sky-art': lit ? 'lit' : 'muted' }}>
      <svg className={`hpic__svg${lit ? ' hpic--lit' : ''}`} viewBox={`0 0 ${W} 40`} preserveAspectRatio="none">
        <path d="M2 34 Q80 -22 158 34" className="hpic__arc" />
        <line x1="0" x2={W} y1="35" y2="35" className="hpic__horizon" />
        <circle cx={2 + eventShare * 156} cy={arcY(eventShare)} r="4" className="hpic__event" />
        {nowShare === null ? null : <circle cx={2 + nowShare * 156} cy={arcY(nowShare)} r="5" className="hpic__sun" />}
      </svg>
    </Frame>
  )
}

/* ------------------------------------------------------------- bars */

/** Bars, an hour each, the value up; `on` hours bright; a dashed limit with its words; a shaded window behind with its words. A missing hour has no bar, never a zero one. */
export function BarsPic({ values, floor, tone, limit = null, limitText = null, window = null, ticks }: { values: readonly { v: number | null; on: boolean }[]; floor: number; tone: 'surf' | 'drone'; limit?: number | null; limitText?: string | null; window?: { from: number; to: number; text: string } | null; ticks: readonly Tick[] }) {
  const top = Math.max(floor, limit ?? 0, ...values.map((x) => x.v ?? 0)) * 1.12
  const w = W / Math.max(1, values.length)
  const y = (v: number) => 40 - (v / top) * 40
  return (
    <Frame kind={tone} ticks={ticks}>
      <svg className={`hpic__svg hpic--bars hpic--${tone}`} viewBox={`0 0 ${W} 40`} preserveAspectRatio="none">
        {window === null ? null : <rect x={clamp01(window.from) * W} y="0" width={Math.max(4, (clamp01(window.to) - clamp01(window.from)) * W)} height="40" rx="4" className="hpic__window" data-window />}
        {limit === null ? null : <line x1="0" x2={W} y1={y(limit)} y2={y(limit)} className="hpic__limit" />}
        {values.map((x, i) =>
          x.v === null ? null : <rect key={i} x={i * w + 1.5} y={40 - Math.max(3, (x.v / top) * 40)} width={Math.max(2, w - 3)} height={Math.max(3, (x.v / top) * 40)} rx="1.5" className={x.on ? 'hpic__bar hpic__bar--on' : 'hpic__bar'} />,
        )}
      </svg>
      {window === null ? null : (
        <span className="hpic__windowt" style={{ left: `${(clamp01(window.from) * 100).toFixed(1)}%` }}>
          {window.text}
        </span>
      )}
      {limit === null || limitText === null ? null : (
        <span className="hpic__limitt" style={{ bottom: `${Math.min(88, (limit / top) * 100).toFixed(1)}%` }}>
          {limitText}
        </span>
      )}
    </Frame>
  )
}

/* ------------------------------------------------------------- wind */

/** Arrows, now and every 2 h, each pointing where that hour's wind goes, its speed under it, then its hour. */
export function WindPic({ steps }: { steps: readonly { toDeg: number | null; calm: boolean; speed: string | null; at: string; key: number }[] }) {
  return (
    <span className="hpic hpic--arrows" aria-hidden="true">
      {steps.map((s) => (
        <span key={s.key} className="hpic__arrowcell">
          <svg viewBox="0 0 24 24" className="hpic__arrowsvg">
            {s.toDeg === null ? (
              <circle cx="12" cy="12" r={s.calm ? 3 : 0} className="hpic__calm" />
            ) : (
              <g transform={`rotate(${s.toDeg} 12 12)`} data-arrow-deg={Math.round(s.toDeg)}>
                <path d="M12 21V4M6.5 9.5L12 3.5l5.5 6" className="hpic__arrow" />
              </g>
            )}
          </svg>
          <span className="hpic__arrowkt num">{s.speed ?? '—'}</span>
          <span className="hpic__arrowat">{s.at}</span>
        </span>
      ))}
    </span>
  )
}

/* ------------------------------------------------------------- tide */

/** The water over the span as a filled curve, the turns as dots with their times under, the water now a dot. */
export function TidePic({ curve, now, turns }: { curve: readonly { x: number; feet: number }[]; now: { x: number; feet: number } | null; turns: readonly { x: number; feet: number; text: string }[] }) {
  const all = [...curve.map((c) => c.feet), ...turns.map((t) => t.feet)]
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  const y = (f: number) => 36 - ((f - lo) / Math.max(0.1, hi - lo)) * 30
  const line = curve.map((c, i) => `${i === 0 ? 'M' : 'L'}${(c.x * W).toFixed(1)} ${y(c.feet).toFixed(1)}`).join(' ')
  const area = curve.length < 2 ? '' : `${line} L${(curve[curve.length - 1].x * W).toFixed(1)} 40 L${(curve[0].x * W).toFixed(1)} 40 Z`
  return (
    <Frame kind="tide" ticks={turns.map((t) => ({ x: t.x, text: t.text, tone: 'tide' }))} data={{ 'data-tide-curve': 'strip' }}>
      <svg className="hpic__svg" viewBox={`0 0 ${W} 40`} preserveAspectRatio="none">
        <path d={area} className="hpic__tidearea" />
        <path d={line} className="hpic__tideline" />
        {turns.map((t) => (
          <circle key={t.x} cx={t.x * W} cy={y(t.feet)} r="3" className="hpic__tideturn" />
        ))}
        {now === null ? null : <circle cx={now.x * W} cy={y(now.feet)} r="4.5" className="hpic__tidenow" data-now />}
      </svg>
    </Frame>
  )
}

/* ------------------------------------------------------------- fish */

/** The next hours as a day bar: the tide's turns as ticks, the moon's rise or set as a tick; a computed window, when there is one, bright. */
export function FishPic({ marks, run, ticks }: { marks: readonly { x: number; kind: 'tide' | 'moon' }[]; run: { from: number; to: number } | null; ticks: readonly Tick[] }) {
  return (
    <Frame kind="fish" ticks={ticks}>
      <svg className="hpic__svg" viewBox={`0 0 ${W} 24`} preserveAspectRatio="none">
        <rect x="0" y="8" width={W} height="8" rx="4" className="hpic__trackbg" />
        {run === null ? null : <rect x={clamp01(run.from) * W} y="8" width={Math.max(4, (clamp01(run.to) - clamp01(run.from)) * W)} height="8" rx="4" className="hpic__run" />}
        {marks.map((m) => (
          <rect key={`${m.kind}${m.x}`} x={clamp01(m.x) * W - 1.5} y="2" width="3" height="20" rx="1.5" className={m.kind === 'tide' ? 'hpic__turn' : 'hpic__moonmark'} />
        ))}
      </svg>
    </Frame>
  )
}

/* ------------------------------------------------------------- the moment's icon */

/** The gold card's small picture, by what the moment is. */
export function MomentIcon({ kind }: { kind: MomentKind }) {
  return (
    <svg className={`hmoment__icon hmoment__icon--${kind}`} viewBox="0 0 32 32" aria-hidden="true" data-moment-icon={kind}>
      {kind === 'glassy' || kind === 'swell' ? (
        <>
          <path d="M3 17c4-6 8-6 12 0s8 6 14-1" className="hmi__wave" />
          <path d="M5 23h22" className="hmi__line" />
        </>
      ) : kind === 'moonrise' ? (
        <>
          <circle cx="16" cy="16" r="11" className="hmi__moon" />
          <circle cx="12" cy="12.5" r="2.6" className="hmi__mare" />
          <circle cx="19.5" cy="18.5" r="3.4" className="hmi__mare" />
          <circle cx="13.5" cy="20.5" r="1.6" className="hmi__mare" />
        </>
      ) : kind === 'sky' ? (
        <>
          <path d="M7 22a9 9 0 0 1 18 0z" className="hmi__sun" />
          <path d="M3 22h26M16 6v3M6.5 10.5l2 2M25.5 10.5l-2 2" className="hmi__line" />
        </>
      ) : kind === 'rain' ? (
        <>
          <path d="M9 18h14a5 5 0 0 0 .5-10 7 7 0 0 0-13.5 1.6A4.3 4.3 0 0 0 9 18z" className="hmi__cloud" />
          <path d="M11 21l-1.5 4M16 21l-1.5 4M21 21l-1.5 4" className="hmi__drop" />
        </>
      ) : kind === 'fog' ? (
        <path d="M5 11h22M3 16h26M6 21h20" className="hmi__line" />
      ) : (
        <path d="M5 16c5-6 13-6 18 0-5 6-13 6-18 0zM23 16l5-4v8z" className="hmi__fish" />
      )}
    </svg>
  )
}
