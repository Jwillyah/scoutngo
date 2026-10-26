import type { CSSProperties, ReactNode } from 'react'
import { shippedTile, type IconId } from '../lib/iconPalette.ts'

/*
 * THE ONE ICON: a golden bubble tile with a white glyph on it.
 *
 * Inline SVG on a CSS tile, no image files. The tile is a three-stop
 * gradient with a gloss across its top and a glow underneath in its own
 * middle colour; the corner is 0.306 of the side, which is the design's
 * 22 px at 72 and 13 px at 42. The glyph paths are the design's, exactly
 * (design/icons-golden-bubble.html); cut-outs are painted in the tile's dark
 * stop so they read as holes.
 *
 * DECORATIVE ON ITS OWN. The icon is aria-hidden: the button it sits in
 * carries the words, as an aria-label or as visible text.
 */

export type GlyphId = Exclude<IconId, 'offline'>

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
  lens: (
    <>
      <circle cx="12" cy="12" r="9" fill="#FFF" />
      <path d="M12 7.6l3.8 2.2v4.4L12 16.4l-3.8-2.2V9.8z" fill={dark} />
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
