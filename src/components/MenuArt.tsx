import type { SkyIcon } from '../core/homeDay.ts'

/*
 * MENU A'S CARD ART (Batch LIVE, Section 4.1; board docs/mockups/Menu_A.png).
 * A faded drawing in each card's bottom-right corner, live from the card's
 * own numbers: the wind's lines point where the wind goes, the tide's curve
 * rises or falls, the weather follows the one sky word (sun, cloud, rain,
 * moon at night), the sky's sunset is lit only for a Possible or Likely
 * call. Inline SVG, at most ART_OPACITY, in a box the card's value never
 * reaches (src/styles/menu-a.css). All of it together stays under 8 KB
 * (tests/menuArt.test.tsx).
 */
export const ART_OPACITY = 0.55

export type ArtInput =
  | { kind: 'weather'; icon: SkyIcon | null }
  | { kind: 'surf' }
  | { kind: 'wind'; fromDeg: number | null }
  | { kind: 'tide'; rising: boolean | null }
  | { kind: 'sky'; lit: boolean }
  | { kind: 'drone' }

function WeatherArt({ icon }: { icon: SkyIcon | null }) {
  const sun = <circle cx="64" cy="40" r="20" />
  const rays = <path d="M64 8v8M64 64v8M32 40h8M88 40h8M42 18l6 6M80 56l6 6M42 62l6-6M80 24l6-6" />
  const cloud = <path d="M34 66h50a14 14 0 0 0-4-27 20 20 0 0 0-38 4 12 12 0 0 0-8 23z" />
  const moon = <path d="M72 18a24 24 0 1 0 14 40 20 20 0 0 1-14-40z" />
  const rain = <path d="M44 74l-4 10M58 74l-4 10M72 74l-4 10" />
  if (icon === 'moon' || icon === 'partly-night') return <g>{moon}{icon === 'partly-night' ? cloud : null}</g>
  if (icon === 'cloud' || icon === 'fog') return <g>{cloud}</g>
  if (icon === 'rain' || icon === 'drizzle' || icon === 'storm' || icon === 'snow') return <g>{cloud}{rain}</g>
  if (icon === 'partly') return <g>{sun}{rays}{cloud}</g>
  return <g>{sun}{rays}</g>
}

export function MenuArt({ art }: { art: ArtInput }) {
  let body
  if (art.kind === 'weather') body = <WeatherArt icon={art.icon} />
  else if (art.kind === 'surf') body = <path d="M8 88c10-34 34-52 60-44 14 4 18 18 8 22-8 3-14-4-10-10" className="mart__fill" />
  else if (art.kind === 'wind') {
    /* Lines along the way the wind goes (from + 180°), turned about the art's middle. */
    const to = art.fromDeg === null ? 90 : (art.fromDeg + 180) % 360
    body = (
      <g transform={`rotate(${to - 90} 56 48)`} data-wind-to={Math.round(to)}>
        <path d="M14 36h56a10 10 0 1 0-10-10" />
        <path d="M24 52h70" />
        <path d="M14 68h48a10 10 0 1 1-10 10" />
      </g>
    )
  } else if (art.kind === 'tide') {
    /* The curve and a dot on the way up or down. */
    const up = art.rising !== false
    body = (
      <g data-tide={art.rising === null ? 'unknown' : up ? 'rising' : 'falling'}>
        <path d="M8 84c18 0 22-56 44-56s26 56 44 56" />
        <circle cx={up ? 32 : 72} cy="48" r="6" className="mart__fill" />
      </g>
    )
  } else if (art.kind === 'sky') {
    body = (
      <g data-sky-lit={art.lit ? '1' : '0'}>
        <path d="M24 76a32 32 0 0 1 64 0z" className={art.lit ? 'mart__fill mart__warm' : 'mart__fill'} />
        <path d="M8 84h96M30 58h-14M96 50h12" />
      </g>
    )
  } else {
    body = (
      <g>
        <circle cx="30" cy="30" r="14" />
        <circle cx="82" cy="30" r="14" />
        <circle cx="30" cy="78" r="14" />
        <circle cx="82" cy="78" r="14" />
        <path d="M40 40l32 28M72 40l-32 28" />
        <rect x="46" y="44" width="20" height="20" rx="4" className="mart__fill" />
      </g>
    )
  }
  return (
    <svg className={`mart mart--${art.kind}`} viewBox="0 0 112 96" aria-hidden="true" style={{ opacity: ART_OPACITY }}>
      {body}
    </svg>
  )
}
