import type { CSSProperties, ReactNode } from 'react'
import { shippedTile, type IconId } from '../lib/iconPalette.ts'

/*
 * THE ONE ICON: a golden bubble tile with a white glyph on it.
 *
 * Inline SVG on a CSS tile, no image files. The tile is a three-stop
 * gradient with a soft gloss across its top and a faint shadow underneath;
 * the corner is 0.306 of the side, which is the design's 22 px at 72 and
 * 13 px at 42. The menu glyphs are the design's (design/icons-golden-bubble.html);
 * the lens is now a camera view cone, and the layer tiles' symbols are drawn
 * here in the same manner. Cut-outs are painted in the tile's dark stop so
 * they read as holes.
 *
 * DECORATIVE ON ITS OWN. The icon is aria-hidden: the button it sits in
 * carries the words, as an aria-label or as visible text.
 */

export type GlyphId = Exclude<IconId, 'offline'>

/*
 * The cone's geometry, in the glyph's 24 unit box. The apex is the lens at
 * (7.2, 12); the rays run to (21.2, 3.8) and (21.2, 20.2), a 60 degree
 * fan, and the arc between their ends is centred on the apex, so it is the
 * cone's own far edge.
 */
const CONE_APEX = [7.2, 12] as const
const CONE_TOP = [21.2, 3.8] as const
const CONE_BOTTOM = [21.2, 20.2] as const
const CONE_RADIUS = Math.hypot(CONE_TOP[0] - CONE_APEX[0], CONE_TOP[1] - CONE_APEX[1])
const r1 = (n: number) => Math.round(n * 10) / 10
const CONE_ARC = `A${r1(CONE_RADIUS)} ${r1(CONE_RADIUS)} 0 0 1 ${CONE_BOTTOM.join(' ')}`
const CONE_FAN = `M${CONE_APEX.join(' ')}L${CONE_TOP.join(' ')}${CONE_ARC}Z`
const CONE_EDGE = `M${CONE_TOP.join(' ')}L${CONE_APEX.join(' ')}L${CONE_BOTTOM.join(' ')}M${CONE_TOP.join(' ')}${CONE_ARC}`

const glyphs = (dark: string): Record<GlyphId, ReactNode> => ({
  plan: (
    <>
      <path d="M3 6.4L9 4v13.6L3 20z" fill="#FFF" />
      <path d="M9 4l6 2.4V20l-6-2.4z" fill="#FFF" fillOpacity="0.72" />
      <path d="M15 6.4L21 4v13.6L15 20z" fill="#FFF" />
      <circle cx="12" cy="11" r="1.8" fill={dark} />
    </>
  ),
  sky: (
    <>
      <path d="M6.5 16.5a5.5 5.5 0 0 1 11 0z" fill="#FFF" />
      <path d="M12 6.2v2.2M6.2 9.4l1.5 1.5M17.8 9.4l-1.5 1.5M3.8 14.2h1.9M18.3 14.2h1.9" stroke="#FFF" strokeWidth="2" strokeLinecap="round" />
      <rect x="3" y="17.6" width="18" height="2.2" rx="1.1" fill="#FFF" fillOpacity="0.85" />
    </>
  ),
  /* An aperture: the ring of the lens and the six-sided opening its blades leave. */
  exposure: (
    <>
      <circle cx="12" cy="12" r="8.6" fill="#FFF" />
      <path d="M12 7.4l4 2.3v4.6l-4 2.3-4-2.3V9.7z" fill={dark} />
      <path d="M12 7.4l4 2.3M16 9.7v4.6M16 14.3l-4 2.3M12 16.6l-4-2.3M8 14.3V9.7M8 9.7l4-2.3" stroke="#FFF" strokeWidth="0.9" strokeOpacity="0.55" />
    </>
  ),
  kit: (
    <>
      <path d="M5 7.3h2.4L9 5h6l1.6 2.3H19a2.2 2.2 0 0 1 2.2 2.2v7.8a2.2 2.2 0 0 1-2.2 2.2H5a2.2 2.2 0 0 1-2.2-2.2V9.5A2.2 2.2 0 0 1 5 7.3z" fill="#FFF" />
      <circle cx="12" cy="13.3" r="4" fill={dark} />
      <circle cx="12" cy="13.3" r="2.2" fill="#7DD3FC" />
      <circle cx="11.2" cy="12.5" r="0.7" fill="#FFF" />
    </>
  ),
  saved: (
    <>
      <path d="M12 21.5s-7-5.9-7-11.6a7 7 0 0 1 14 0c0 5.7-7 11.6-7 11.6z" fill="#FFF" />
      <circle cx="12" cy="9.8" r="2.7" fill={dark} />
    </>
  ),
  viewfinder: (
    <>
      <path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5" fill="none" stroke="#FFF" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3.4" fill="#FFD66B" />
      <circle cx="12" cy="12" r="3.4" fill="none" stroke="#FFF" strokeWidth="1.2" />
    </>
  ),
  callsheet: (
    <>
      <rect x="5" y="4.2" width="14" height="17" rx="2.6" fill="#FFF" />
      <rect x="8" y="9.6" width="8" height="1.8" rx="0.9" fill={dark} />
      <rect x="8" y="13" width="8" height="1.8" rx="0.9" fill={dark} />
      <rect x="8" y="16.4" width="5" height="1.8" rx="0.9" fill={dark} />
    </>
  ),
  settings: (
    <>
      <path d="M4 7.2h16M4 12h16M4 16.8h16" stroke="#FFF" strokeOpacity="0.7" strokeWidth="2" strokeLinecap="round" />
      <circle cx="15" cy="7.2" r="2.6" fill="#FFF" />
      <circle cx="8.5" cy="12" r="2.6" fill="#FFF" />
      <circle cx="16.5" cy="16.8" r="2.6" fill="#FFF" />
    </>
  ),
  about: (
    <>
      <circle cx="12" cy="12" r="9" fill="none" stroke="#FFF" strokeWidth="2" />
      <path d="M12 5l2.6 7H9.4z" fill="#FFF" />
      <path d="M12 19l2.6-7H9.4z" fill="#FFF" fillOpacity="0.5" />
    </>
  ),
  sunmoon: (
    <>
      <circle cx="8.6" cy="8.8" r="4.2" fill="#FFD66B" />
      <path d="M20.4 16.6a5.4 5.4 0 1 1-6.6-7.5 4.3 4.3 0 0 0 6.6 7.5z" fill="#FFF" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.8" y="5" width="16.4" height="15.2" rx="3" fill="#FFF" />
      <path d="M3.8 8a3 3 0 0 1 3-3h10.4a3 3 0 0 1 3 3v2H3.8z" fill="#FFF" fillOpacity="0.6" />
      <rect x="7.3" y="2.8" width="2.2" height="4.6" rx="1.1" fill="#FFF" />
      <rect x="14.5" y="2.8" width="2.2" height="4.6" rx="1.1" fill="#FFF" />
      <circle cx="15.4" cy="15.4" r="1.9" fill={dark} />
    </>
  ),
  /*
   * THE CAMERA'S VIEW CONE. A small camera body at the left, and two straight
   * rays fanning out from its lens to a shallow arc, the field of view filled
   * faintly between them. It was a white disc with a dark hexagon in it, which
   * read as a screw head. The cone layer's tile uses this same glyph.
   */
  lens: (
    <>
      <path d={CONE_FAN} fill="#FFF" fillOpacity="0.28" />
      <path d={CONE_EDGE} fill="none" stroke="#FFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="1.2" y="9.2" width="6.6" height="5.6" rx="1.4" fill="#FFF" />
      <circle cx="4.5" cy="12" r="1.3" fill={dark} />
    </>
  ),
  /* A globe: the photograph of the ground. */
  satellite: (
    <>
      <circle cx="12" cy="12" r="8.6" fill="none" stroke="#FFF" strokeWidth="2.4" />
      <path d="M3.6 12h16.8M12 3.4c-3.6 4.6-3.6 12.6 0 17.2M12 3.4c3.6 4.6 3.6 12.6 0 17.2" fill="none" stroke="#FFF" strokeWidth="2" />
    </>
  ),
  /* A ridge: height. */
  terrain: <path d="M2.4 19.2 9.2 7.6l4.1 6.4 2.6-3.6 5.7 8.8z" fill="#FFF" stroke="#FFF" strokeWidth="1.2" strokeLinejoin="round" />,
  /* The sun on its arc. */
  sunArc: (
    <>
      <path d="M3.6 18.4a8.4 8.4 0 0 1 16.8 0" fill="none" stroke="#FFF" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="17.4" cy="11.6" r="3.4" fill="#FFF" />
    </>
  ),
  /* A post and the shadow it throws along the ground. */
  shadows: (
    <>
      <path d="M17.6 18.6 4 15.4" stroke="#FFF" strokeOpacity="0.55" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M17.6 4.4v14.2" stroke="#FFF" strokeWidth="3.2" strokeLinecap="round" />
    </>
  ),
  /* A cloud. */
  cloud: <path d="M7.2 18.8h10.2a4.4 4.4 0 0 0 .5-8.8 6 6 0 0 0-11.4-1.3 5.1 5.1 0 0 0 .7 10.1z" fill="#FFF" />,
  /* A warning triangle: what is marked. */
  hazards: (
    <>
      <path d="M12 3.6 21.4 19.6H2.6z" fill="#FFF" stroke="#FFF" strokeWidth="1.6" strokeLinejoin="round" />
      <rect x="10.9" y="8.8" width="2.2" height="6" rx="1.1" fill={dark} />
      <circle cx="12" cy="17.1" r="1.25" fill={dark} />
    </>
  ),
  /* Two blocks: buildings. */
  buildings: (
    <>
      <rect x="3.4" y="10" width="7" height="10.4" rx="1" fill="#FFF" fillOpacity="0.75" />
      <rect x="11.4" y="3.6" width="9.2" height="16.8" rx="1" fill="#FFF" />
      <path d="M14.2 7.6h3.6M14.2 11h3.6M14.2 14.4h3.6" stroke={dark} strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  /* A label tag: names and roads. */
  labels: (
    <>
      <path d="M3.4 6.6h11.4l6 5.4-6 5.4H3.4a1 1 0 0 1-1-1V7.6a1 1 0 0 1 1-1z" fill="#FFF" />
      <circle cx="14.8" cy="12" r="1.6" fill={dark} />
      <path d="M5.6 10.4h5.4M5.6 13.6h3.6" stroke={dark} strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  /* Rings around a point: controlled airspace. */
  airspace: (
    <>
      <circle cx="12" cy="12" r="8.6" fill="none" stroke="#FFF" strokeWidth="2" strokeDasharray="3.4 2.4" />
      <circle cx="12" cy="12" r="4" fill="#FFF" />
    </>
  ),
  /* A ruler on the slant, with its marks cut in. */
  measure: (
    <>
      <path d="M3.4 15.6L15.6 3.4l5 5L8.4 20.6z" fill="#FFF" />
      <path d="M7.2 13.4l1.8 1.8M9.6 11l1.2 1.2M12 8.6l1.8 1.8M14.4 6.2l1.2 1.2" stroke={dark} strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  /* Preflight: a small drone and the curve of its move. */
  preflight: (
    <>
      <path d="M4 18c3-8 9-11 16-12" fill="none" stroke="#FFF" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="2.4 2.2" />
      <circle cx="17" cy="7" r="1.9" fill="#FFF" />
      <circle cx="21" cy="7" r="1.6" fill="#FFF" />
      <rect x="15.6" y="5.6" width="6.8" height="2.8" rx="1.2" fill="#FFF" />
      <circle cx="4.6" cy="18" r="2" fill="#FFF" />
    </>
  ),
  /* Skyline: a roofline with the sun about to drop behind it. */
  skyline: (
    <>
      <circle cx="15.4" cy="8" r="3.4" fill="#FFF" fillOpacity="0.7" />
      <path d="M2.6 20.4V13h3.6v-3.4h3.6V13h2.6V9.4l2.4-2 2.4 2v4.2h4.2v6.8z" fill="#FFF" />
    </>
  ),
  /* Light map: a sun over ground cut into squares, some lit. */
  lightmap: (
    <>
      <circle cx="12" cy="5.6" r="2.8" fill="#FFF" />
      <path d="M3 13h5.4v3.4H3zM9.3 13h5.4v3.4H9.3zM15.6 13H21v3.4h-5.4zM3 17.3h5.4v3.4H3zM9.3 17.3h5.4v3.4H9.3zM15.6 17.3H21v3.4h-5.4z" fill="#FFF" fillOpacity="0.45" />
      <path d="M9.3 13h5.4v3.4H9.3zM15.6 17.3H21v3.4h-5.4z" fill="#FFF" />
    </>
  ),
  layers: (
    <>
      <path d="M12 13.4l-9-4.2 9-4.2 9 4.2z" fill="#FFF" />
      <path d="M4.6 12.2L12 15.6l7.4-3.4 1.6.8-9 4.2-9-4.2z" fill="#FFF" fillOpacity="0.78" />
      <path d="M4.6 15.8L12 19.2l7.4-3.4 1.6.8-9 4.2-9-4.2z" fill="#FFF" fillOpacity="0.55" />
    </>
  ),
  now: (
    <>
      <path d="M5 12a7 7 0 1 0 2.1-5" fill="none" stroke="#FFF" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M4 4.2v5.2h5.2z" fill="#FFF" />
      <path d="M12 8.5V12l2.6 1.6" fill="none" stroke="#FFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  /* The app's own mark: a white pin with the sun setting inside it. */
  app: (
    <>
      <path d="M12 22s-7.2-6.1-7.2-12a7.2 7.2 0 0 1 14.4 0c0 5.9-7.2 12-7.2 12z" fill="#FFF" />
      <path d="M8.4 11.6a3.6 3.6 0 0 1 7.2 0z" fill="#F68B2E" />
      <rect x="7.6" y="12.4" width="8.8" height="1.4" rx="0.7" fill="#C2508A" />
    </>
  ),
})

interface IconProps {
  /** Which glyph. */
  glyph: GlyphId
  /** Which tile colours; the glyph's own unless a page borrows another (the home page does). */
  tile?: IconId
  /** The tile's side in px. */
  size: number
  className?: string
}

export function Icon({ glyph, tile, size, className }: IconProps) {
  const stops = shippedTile(tile ?? glyph)
  const style = {
    '--icon-size': `${size}px`,
    '--icon-light': stops.light,
    '--icon-middle': stops.middle,
    '--icon-dark': stops.dark,
  } as CSSProperties
  return (
    <span className={`icon${className === undefined ? '' : ` ${className}`}`} style={style} aria-hidden="true" data-icon={glyph}>
      <svg viewBox="0 0 24 24" className="icon__glyph" aria-hidden="true" focusable="false">
        {glyphs(stops.dark)[glyph]}
      </svg>
    </span>
  )
}
