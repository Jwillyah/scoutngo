/*
 * THE TILE ARTWORK: EVERY TILE IS A TINY MAP.
 *
 * WHAT THIS REPLACED. Line icons on flat squares -- a triangle for cones, an
 * arc for the sun, a cloud outline for cloud. They were clear drawings and
 * they were the wrong drawings: an icon has to be DECODED, and the thing it
 * stands for is "the cones layer", which is a word, not a picture. So the
 * shooter read the label and the drawing earned nothing.
 *
 * A LAYER TILE IS A PICTURE OF THE MAP WITH THE LAYER ON. That is what every
 * map application does, and the reason it works is that the tile and the map
 * look alike: you recognise the thing you are about to see rather than
 * learning a symbol for it. Each tile below is the SAME abstract scene --
 * ground, a waterway, a road, a few buildings -- with one feature drawn over
 * it. Put side by side in the grid they read as one place seen eight ways.
 *
 * ITS OWN FILE BECAUSE IT IS NOT A COMPONENT. Eleven drawings exported beside
 * the tile grid made that module export both components and data, which
 * breaks fast refresh and mixes two things edited for entirely different
 * reasons.
 *
 * THE COLOURS HERE ARE THE PICTURE, NOT THE CHROME. A satellite thumbnail
 * that takes its greens from the theme is not a picture of satellite imagery.
 * These are illustration fills, the same licence a photograph has, confined
 * to this one file so the rule everywhere else -- every colour comes from a
 * token -- keeps no exceptions in app code.
 *
 * THE FEATURE COLOURS ARE NOT ARBITRARY, THOUGH. Where a layer paints the
 * real map in a meaning colour, its tile uses the same hue: a back-lit cone
 * is #d08a5a on the map and on the tile, a hazard is #ff3b30 in both places,
 * airspace is the same periwinkle. The tile is a preview, so a tile that
 * previewed a different colour would be a small lie.
 */

/* --------------------------------------------------------------- the scene */

/*
 * ONE PLACE, DRAWN ONCE. 70x62, the tile's own aspect. Everything is in this
 * coordinate space so a feature drawn at (24, 30) lands on the same patch of
 * ground on every tile.
 */
/*
 * THE WATER IS BLUER THAN A RIVER NEEDS TO BE, on purpose. At 62px wide the
 * first version's #1E3038 sat two steps from the ground green and read as a
 * darker field rather than as water, which took the one landmark out of the
 * scene that tells you the eight tiles are all the same place.
 */
const GROUND = '#2C3A28'
const GROUND_DARK = '#243021'
const WATER = '#1B3C4E'
const WATER_EDGE = '#2A566B'
const ROAD = '#5B6268'
const BUILDING = '#3B4038'
const BUILDING_LIT = '#474C42'

/*
 * THE SHARED BASE: ground, a waterway across it, a road, two blocks.
 *
 * AN ELEMENT, NOT A COMPONENT. Written as `function Scene()` it was a
 * component exported from a module that also exports data, which breaks fast
 * refresh -- and it never needed to be one: it takes no props and renders the
 * same thing every time, so it is a constant that happens to be JSX.
 */
const SCENE = (
  <>
      <rect width="70" height="62" fill={GROUND} />
      {/* A darker field, so the ground is not one flat colour. */}
      <path d="M0 0h30l6 18-9 14H0z" fill={GROUND_DARK} />
      {/* The waterway, widening as it crosses. */}
      <path d="M-2 10 74 30v12L-2 24z" fill={WATER} />
      <path d="M-2 10 74 30" stroke={WATER_EDGE} strokeWidth="1" fill="none" />
      {/* The road, crossing the water the other way. */}
      <path d="M8 62 26 0" stroke={ROAD} strokeWidth="2.6" fill="none" />
      <path d="M52 62 64 0" stroke={ROAD} strokeWidth="1.8" fill="none" opacity="0.75" />
      {/* Two blocks of roofs, which the Buildings and Shadows tiles reuse. */}
      <rect x="32" y="44" width="11" height="9" fill={BUILDING} />
      <rect x="45" y="48" width="8" height="8" fill={BUILDING_LIT} />
      <rect x="14" y="6" width="9" height="7" fill={BUILDING} />
  </>
)

const FRAME = { viewBox: '0 0 70 62', className: 'tile__svg', 'aria-hidden': true } as const

export const TILE_ART = {
  /* ------------------------------------------------------------ base tiles */

  /*
   * SATELLITE is the scene itself, with a little more texture than the
   * overlay tiles carry: it is the only tile whose subject IS the imagery,
   * so it gets the trees and the jetty the others leave out.
   */
  satellite: (
    <svg {...FRAME}>
      {SCENE}
      <circle cx="10" cy="40" r="3.2" fill="#35462E" />
      <circle cx="16" cy="46" r="2.4" fill="#2F3F29" />
      <circle cx="6" cy="49" r="2.6" fill="#35462E" />
      <circle cx="62" cy="12" r="2.8" fill="#35462E" />
      {/* A jetty out into the water, the giveaway detail of a real photo. */}
      <rect x="36" y="22" width="12" height="2" fill="#6B6F63" transform="rotate(14 36 22)" />
    </svg>
  ),

  /*
   * TERRAIN 3D is the same place, tilted, with a sky behind a ridge. The sky
   * is the whole point: it is what tells you this view has a horizon in it,
   * which is the difference between the flat map and the tilted one.
   */
  terrain: (
    <svg {...FRAME}>
      <rect width="70" height="62" fill="#16215E" />
      <rect y="0" width="70" height="18" fill="#1E2A6B" />
      {/* The far ridge, then the near one, then the tilted ground. */}
      <path d="M0 24 14 14 26 22 40 10 54 20 70 12v12H0z" fill="#101A3E" />
      <path d="M0 30 18 20 34 28 50 18 70 26v8H0z" fill="#1A2A22" />
      <path d="M0 34h70v28H0z" fill={GROUND} />
      {/* The same waterway and road, foreshortened by the tilt. */}
      <path d="M0 40 70 48v7L0 46z" fill={WATER} />
      <path d="M22 62 30 34" stroke={ROAD} strokeWidth="2.4" fill="none" />
      <rect x="44" y="50" width="9" height="7" fill={BUILDING} />
    </svg>
  ),

  /*
   * CHART is a different document entirely -- not a photograph of the ground
   * but a drawing of the water -- so it is the one base tile that does not
   * use the scene. Dark, depth contours, a sounding.
   */
  chart: (
    <svg {...FRAME}>
      <rect width="70" height="62" fill="#0A1118" />
      <path d="M0 50 70 44v18H0z" fill="#12202A" />
      <path d="M-2 14 74 8" stroke="#1E3A4A" strokeWidth="1.2" fill="none" />
      <path d="M-2 26 74 20" stroke="#1E3A4A" strokeWidth="1.2" fill="none" />
      <path d="M-2 38 74 32" stroke="#1E3A4A" strokeWidth="1.2" fill="none" />
      <circle cx="30" cy="22" r="5.5" fill="none" stroke="#2E5A70" strokeWidth="1.2" />
      <text x="30" y="24.6" fontSize="6" fill="#8FB8CC" textAnchor="middle" fontFamily="monospace">
        12
      </text>
      <text x="55" y="38" fontSize="5.5" fill="#55809A" textAnchor="middle" fontFamily="monospace">
        7
      </text>
    </svg>
  ),

  /* --------------------------------------------------------- overlay tiles */

  /*
   * CONES: a position on the ground and what it can see. Drawn back-lit
   * (#d08a5a) because that is the lighting class a shooter is looking for
   * when they turn this layer on, and because a cone has to be SOME colour
   * and an invented one would preview a thing the map never draws.
   */
  cones: (
    <svg {...FRAME}>
      {SCENE}
      <path d="M20 50 66 26 68 40 26 56z" fill="#d08a5a" fillOpacity="0.42" />
      <path d="M20 50 66 26M20 50 68 40" stroke="#d08a5a" strokeWidth="1" fill="none" />
      <circle cx="20" cy="50" r="4" fill="#F2F0EB" />
      <circle cx="20" cy="50" r="4" fill="none" stroke="#0D1310" strokeWidth="1" />
    </svg>
  ),

  /*
   * SUN ARC: the sun's path over this place, with the sun on it. The arc
   * crosses the whole tile because that is what it does on the map -- rising
   * off one edge and setting off the other.
   */
  sunArc: (
    <svg {...FRAME}>
      {SCENE}
      <path
        d="M2 48 Q35 2 68 48"
        fill="none"
        stroke="#ffd54a"
        strokeWidth="1.6"
        strokeDasharray="3 2.5"
        opacity="0.85"
      />
      <circle cx="51" cy="19" r="5" fill="#ffd54a" />
      <circle cx="51" cy="19" r="8" fill="#ffd54a" fillOpacity="0.22" />
    </svg>
  ),

  /*
   * SHADOWS: the scene's own two blocks, throwing shadows away from the sun.
   * Periwinkle rather than black, which is what the map paints: a shadow on
   * a sunlit day is blue, and a grey one reads as a hole in the imagery.
   */
  shadows: (
    <svg {...FRAME}>
      {SCENE}
      <path d="M32 53 21 59 32 59z" fill="#9aa7ff" fillOpacity="0.5" />
      <path d="M43 53 32 59 43 59 43 53z" fill="#9aa7ff" fillOpacity="0.5" />
      <path d="M45 56 36 61 53 61 53 56z" fill="#9aa7ff" fillOpacity="0.5" />
      <path d="M14 13 5 19 23 19 23 13z" fill="#9aa7ff" fillOpacity="0.5" />
      <rect x="32" y="44" width="11" height="9" fill={BUILDING_LIT} />
      <rect x="45" y="48" width="8" height="8" fill="#51564B" />
      <rect x="14" y="6" width="9" height="7" fill={BUILDING_LIT} />
    </svg>
  ),

  /*
   * CLOUD: translucent white over the ground, not an outlined cloud shape.
   * The layer paints cover, and cover is a thing you see THROUGH, so the
   * tile has to show the ground underneath it or it is the wrong picture.
   */
  cloud: (
    <svg {...FRAME}>
      {SCENE}
      <g fill="#F2F0EB">
        <ellipse cx="22" cy="20" rx="15" ry="9" fillOpacity="0.5" />
        <ellipse cx="38" cy="16" rx="11" ry="7" fillOpacity="0.42" />
        <ellipse cx="48" cy="44" rx="17" ry="10" fillOpacity="0.32" />
        <ellipse cx="14" cy="47" rx="10" ry="6" fillOpacity="0.24" />
      </g>
    </svg>
  ),

  /*
   * HAZARDS: a span between two poles, which is the mark this layer is most
   * often used for and the hardest thing to see from the ground. Red, the
   * one hue this app reserves, because that is what the map draws.
   */
  hazards: (
    <svg {...FRAME}>
      {SCENE}
      <path d="M14 46 14 18M56 40 56 12" stroke="#F2F0EB" strokeWidth="1.8" fill="none" />
      <path
        d="M14 20 56 14"
        stroke="#ff3b30"
        strokeWidth="2"
        strokeDasharray="4 3"
        fill="none"
      />
      <path d="M14 26 56 20" stroke="#ff3b30" strokeWidth="1.4" strokeDasharray="3 3" fill="none" opacity="0.6" />
    </svg>
  ),

  /*
   * BUILDINGS: the scene's roofs, extruded. Isometric rather than flat,
   * because what this layer adds to the map is HEIGHT -- the roofs are
   * already in the imagery, and the thing you turn it on for is knowing what
   * stands between the camera and the subject.
   */
  buildings: (
    <svg {...FRAME}>
      {SCENE}
      <g>
        <path d="M32 44 43 44 43 53 32 53z" fill="#6E746A" />
        <path d="M32 44 36 38 47 38 43 44z" fill="#8A9185" />
        <path d="M43 44 47 38 47 47 43 53z" fill="#555A51" />
      </g>
      <g>
        <path d="M14 30 24 30 24 40 14 40z" fill="#6E746A" />
        <path d="M14 30 18 24 28 24 24 30z" fill="#8A9185" />
        <path d="M24 30 28 24 28 34 24 40z" fill="#555A51" />
      </g>
      <g>
        <path d="M48 50 56 50 56 57 48 57z" fill="#636960" />
        <path d="M48 50 51 46 59 46 56 50z" fill="#7D837A" />
        <path d="M56 50 59 46 59 53 56 57z" fill="#4C514A" />
      </g>
    </svg>
  ),

  /*
   * LABELS: the same scene with the street names on. Nonsense words on
   * purpose -- the tile is a picture of "names are drawn here", and a real
   * street name would be a claim about a place this tile is not of.
   */
  labels: (
    <svg {...FRAME}>
      {SCENE}
      <text
        x="17"
        y="34"
        fontSize="6"
        fill="#F2F0EB"
        fontFamily="system-ui, sans-serif"
        transform="rotate(-73 17 34)"
        textAnchor="middle"
      >
        Main St
      </text>
      <text
        x="44"
        y="20"
        fontSize="5.5"
        fill="#C8CFD6"
        fontFamily="system-ui, sans-serif"
        textAnchor="middle"
      >
        River
      </text>
    </svg>
  ),

  /*
   * AIRSPACE: a dashed ring with its ceiling in it, which is exactly how a
   * LAANC grid cell is drawn on the map. The number is the thing people look
   * for, so it is in the ring rather than beside it.
   */
  airspace: (
    <svg {...FRAME}>
      {SCENE}
      <circle
        cx="35"
        cy="30"
        r="20"
        fill="#9aa7ff"
        fillOpacity="0.12"
        stroke="#9aa7ff"
        strokeWidth="1.6"
        strokeDasharray="4 3"
      />
      <text
        x="35"
        y="34"
        fontSize="12"
        fill="#C3CAFF"
        textAnchor="middle"
        fontFamily="monospace"
        fontWeight="700"
      >
        400
      </text>
    </svg>
  ),
} as const
