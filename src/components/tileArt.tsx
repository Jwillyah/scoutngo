/*
 * THE LAYER TILES: ONE BOLD SYMBOL EACH.
 *
 * WHAT THIS REPLACED. Each tile was a small painted scene -- water, a road,
 * trees, a jetty -- with the layer's idea drawn somewhere inside it. At 70 by
 * 62 pixels on a phone they read as shapes, and the shapes looked alike. Now a
 * tile is a plain dark ground and a single heavy white symbol, the way a map
 * app's layer buttons read: you find the one you want by its silhouette.
 *
 * WHITE, NOT A ROLE COLOUR. Teal is chrome and red is hazard, and a tile is
 * neither; its ON state is the tile's own border and ground (app.css .tile).
 */

const FRAME = {
  width: 70,
  height: 62,
  viewBox: '0 0 70 62',
  'aria-hidden': true,
} as const

const GROUND = '#14161A'
const INK = '#F4F4EF'
const STROKE = { stroke: INK, strokeWidth: 4, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const

const tile = (symbol: React.ReactNode) => (
  <svg {...FRAME}>
    <rect width="70" height="62" rx="8" fill={GROUND} />
    {symbol}
  </svg>
)

export const TILE_ART = {
  /* A globe: the photograph of the ground. */
  satellite: tile(
    <>
      <circle cx="35" cy="31" r="17" {...STROKE} />
      <path d="M18 31h34M35 14c-7 9-7 25 0 34M35 14c7 9 7 25 0 34" {...STROKE} strokeWidth={3} />
    </>,
  ),
  /* A ridge: height. */
  terrain: tile(<path d="M12 46 27 24l9 12 7-9 15 19z" {...STROKE} />),
  /* A wedge: what a camera sees. */
  cones: tile(<path d="M19 46 51 22M19 46l32 6M19 46l10-27" {...STROKE} />),
  /* An arc with the sun on it. */
  sunArc: tile(
    <>
      <path d="M12 46a23 23 0 0 1 46 0" {...STROKE} />
      <circle cx="44" cy="27" r="6" fill={INK} />
    </>,
  ),
  /* A post and the shadow it throws. */
  shadows: tile(
    <>
      <path d="M24 14v32" {...STROKE} />
      <path d="M24 46 54 40" {...STROKE} strokeWidth={6} opacity={0.6} />
    </>,
  ),
  /* A cloud. */
  cloud: tile(
    <path
      d="M22 44h26a9 9 0 0 0 0-18 12 12 0 0 0-23-3 9 9 0 0 0-3 21z"
      {...STROKE}
    />,
  ),
  /* A warning triangle: what is marked. */
  hazards: tile(
    <>
      <path d="M35 14 56 48H14z" {...STROKE} />
      <path d="M35 27v10" {...STROKE} />
      <circle cx="35" cy="42" r="2.4" fill={INK} />
    </>,
  ),
  /* Two blocks: buildings. */
  buildings: tile(
    <>
      <path d="M16 48V26h14v22M30 48V16h20v32" {...STROKE} />
      <path d="M12 48h46" {...STROKE} />
    </>,
  ),
  /* A label tag: names and roads. */
  labels: tile(
    <>
      <path d="M14 22h30l12 9-12 9H14z" {...STROKE} />
      <circle cx="22" cy="31" r="2.6" fill={INK} />
    </>,
  ),
  /* Rings around a point: controlled airspace. */
  airspace: tile(
    <>
      <circle cx="35" cy="31" r="7" {...STROKE} />
      <circle cx="35" cy="31" r="17" {...STROKE} strokeDasharray="5 5" />
    </>,
  ),
}
