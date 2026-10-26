import { useState } from 'react'
import HOME_FRAME from '../data/homeFrame.json'
import { shippedTile, type IconId } from '../lib/iconPalette.ts'
import { FOOT_SCRIM, FRAME, HORIZON, SKY_STOPS } from '../lib/homeSky.ts'
import { ESRI_ATTRIBUTION } from './MapView.tsx'
import { HowPage } from './HowPage.tsx'
import { Icon, type GlyphId } from './Icon.tsx'

/**
 * THE HOME PAGE: the real map at an example venue under a sunset.
 *
 *   the sky          night indigo at the top to gold at the horizon, gone by
 *                    60% down so the venue reads (src/lib/homeSky.ts)
 *   the sun          on the horizon, where the app's own sun line meets it
 *   the plan         golden bubble pins and their cones, at the points the
 *                    app put them (scripts/make-home-frame.mjs)
 *   the brand        the app icon, the name, one line, four things it does
 *   one button       gold, Open the map
 *   one footer line  Free, open source, no account, How it works
 *
 * plus the credit for the imagery, which is owed and is not a step.
 *
 * EVERYTHING ELSE IS ON /how AND NOTHING WAS DELETED.
 */
export function Landing({ onDismiss }: { onDismiss: () => void }) {
  const [view, setView] = useState<'cover' | 'how'>(() =>
    typeof window !== 'undefined' && window.location.pathname === '/how' ? 'how' : 'cover',
  )

  const show = (next: 'cover' | 'how') => {
    setView(next)
    /*
     * A REAL URL, so the link is shareable and the back button works. There is
     * no router in this app and adding one for two views would be a dependency
     * to carry forever; pushState is the whole of what is needed.
     */
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', next === 'how' ? '/how' : '/')
    }
  }

  if (view === 'how') {
    return <HowPage onBack={() => show('cover')} />
  }

  return <Cover onDismiss={onDismiss} onHow={() => show('how')} />
}

/* Which tile each pin wears, in the menu's sunset order. */
const PIN_TILES = ['plan', 'sky', 'saved'] as const

function Cover({ onDismiss, onHow }: { onDismiss: () => void; onHow: () => void }) {
  const horizonY = FRAME.height * HORIZON
  const sun = HOME_FRAME.sunLine
  /* Where the app's own sun line crosses the horizon: that is where the sun sits. */
  const sunX = sun === null ? FRAME.width / 2 : xAtY(sun[0], sun[1], horizonY)

  return (
    <div className="cover">
      {/*
        * THE PICTURE: one SVG, so the photograph, the sky and the pins share
        * one set of coordinates and stay together on any screen.
        *
        * The photograph is the real map at the example venue, taken by
        * scripts/make-home-frame.mjs without the app's own overlays. The pins,
        * cones and sun line are drawn here at the screen points that script
        * read off the same live map (src/data/homeFrame.json): the positions
        * are Suggest's and the geometry is the app's; only the look is the
        * home page's.
        */}
      <svg
        className="cover__frame"
        viewBox={`0 0 ${FRAME.width} ${FRAME.height}`}
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="home-sky" x1="0" y1="0" x2="0" y2={horizonY} gradientUnits="userSpaceOnUse">
            {SKY_STOPS.map((s) => (
              <stop key={s.at} offset={s.at} stopColor={s.colour} />
            ))}
          </linearGradient>
          {/* The sky is opaque to just above the horizon, then gone by it: the venue reads below. */}
          <linearGradient id="home-sky-fade" x1="0" y1="0" x2="0" y2={horizonY} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" />
            <stop offset="0.85" stopColor="#fff" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id="home-sky-mask">
            <rect width={FRAME.width} height={horizonY} fill="url(#home-sky-fade)" />
          </mask>
          <radialGradient id="home-sun-glow">
            <stop offset="0" stopColor="#ffe6a0" stopOpacity="0.9" />
            <stop offset="0.22" stopColor="#ffbe5a" stopOpacity="0.45" />
            <stop offset="0.6" stopColor="#ffa050" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="home-sun-disc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff6d8" />
            <stop offset="1" stopColor="#ffd27a" />
          </linearGradient>
          <linearGradient id="home-foot" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={FOOT_SCRIM.colour} stopOpacity="0" />
            <stop offset={FOOT_SCRIM.solidFrom} stopColor={FOOT_SCRIM.colour} stopOpacity={FOOT_SCRIM.opacity} />
            <stop offset="1" stopColor={FOOT_SCRIM.colour} stopOpacity={FOOT_SCRIM.opacity} />
          </linearGradient>
          {PIN_TILES.map((id) => {
            const t = shippedTile(id)
            return (
              <linearGradient key={id} id={`home-pin-${id}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={t.light} />
                <stop offset="0.5" stopColor={t.middle} />
                <stop offset="1" stopColor={t.dark} />
              </linearGradient>
            )
          })}
        </defs>

        <image href="/home-frame.jpg" width={FRAME.width} height={FRAME.height} preserveAspectRatio="xMidYMid slice" />

        <rect width={FRAME.width} height={horizonY} fill="url(#home-sky)" mask="url(#home-sky-mask)" />
        <circle cx={sunX} cy={horizonY} r={170} fill="url(#home-sun-glow)" />
        <path d={`M${sunX - 30} ${horizonY}a30 30 0 0 1 60 0z`} fill="url(#home-sun-disc)" />

        {HOME_FRAME.positions.map((p, i) => {
          const t = shippedTile(PIN_TILES[i % PIN_TILES.length])
          return (
            <path
              key={`cone-${p.number}`}
              d={`M${p.apex.join(' ')}L${p.cone.map((c) => c.join(' ')).join('L')}Z`}
              fill={t.middle}
              fillOpacity={0.22}
              stroke={t.middle}
              strokeWidth={1.2}
            />
          )
        })}

        {sun === null ? null : (
          <path
            d={`M${sun[0].join(' ')}L${sunX} ${horizonY}`}
            stroke="#ffd27a"
            strokeWidth={2}
            strokeDasharray="1 6"
            strokeLinecap="round"
          />
        )}

        {HOME_FRAME.positions.map((p, i) => {
          const id = PIN_TILES[i % PIN_TILES.length]
          const [x, y] = p.apex
          return (
            <g key={`pin-${p.number}`} className="cover__pin" transform={`translate(${x} ${y})`}>
              <path d="M0 0l-6 -11h12z" fill={shippedTile(id).dark} />
              <circle cy={-24} r={14} fill={`url(#home-pin-${id})`} stroke="#fff" strokeOpacity={0.6} strokeWidth={1} />
              <ellipse cy={-31} rx={8.5} ry={4.5} fill="#fff" fillOpacity={0.4} />
              <text y={-19.5} textAnchor="middle" className="cover__pinnum">
                {p.number}
              </text>
            </g>
          )
        })}

        <rect y={FRAME.height * FOOT_SCRIM.top} width={FRAME.width} height={FRAME.height * (1 - FOOT_SCRIM.top)} fill="url(#home-foot)" />
      </svg>

      <div className="cover__brand">
        <Icon glyph="app" size={76} />
        <h1 className="cover__name">ScoutNGo</h1>
        <p className="cover__head">Plan the shot before you get there. Where to stand, which lens, and when the light is right.</p>
        <ul className="cover__feats">
          {FEATURES.map((f) => (
            <li key={f.label} className="cover__feat">
              <Icon glyph={f.glyph} tile={f.tile} size={50} />
              <span className="cover__featlabel">{f.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="cover__foot">
        <button type="button" className="cover__go" onClick={onDismiss}>
          Open the map
        </button>
        <p className="cover__licence">
          Free · open source · no account ·{' '}
          <button type="button" className="cover__more" onClick={onHow}>
            How it works
          </button>
        </p>
        <p className="cover__attrib">
          An example venue, not your location. {ESRI_ATTRIBUTION}
        </p>
      </div>
    </div>
  )
}

const FEATURES: readonly { label: string; glyph: GlyphId; tile: IconId }[] = [
  { label: 'Where to stand', glyph: 'plan', tile: 'plan' },
  { label: 'Which lens', glyph: 'kit', tile: 'kit' },
  { label: 'When the light hits', glyph: 'sky', tile: 'viewfinder' },
  { label: 'Works offline', glyph: 'layers', tile: 'offline' },
]

/** x where the line through a and b reaches height y. */
function xAtY(a: readonly number[], b: readonly number[], y: number): number {
  if (b[1] === a[1]) return a[0]
  return a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1])
}
