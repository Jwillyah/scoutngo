/*
 * THE JETTIES' OWN FACTORS (Batch DRONE, Section 1.3; CORE 8.1 addendum: "jetties
 * (Croatan, 1st St) catch N wind sea and shelter from N wind better than the
 * open beach. Seed them from field reports; default 1.0").
 *
 * Seeded ONLY from the looks the repo holds, each set against the open
 * beach (North End, the pier) seen the same hour, so the ratio is the
 * jetty's own and not the day's:
 *
 *   14 Nov 3:13 PM  Surfline's cams, as kept in src/core/surf.ts (Batch LIVE,
 *                   Section 9A): 1st St Jetty 2-3 ft, Croatan 1-2, North End 1-2
 *   16 Nov 10:50 AM fixtures/truth/2026-11-16-vb-surf.json: cams knee to thigh
 *                   at North End, Sandbridge, 1st St and Croatan, wind-chopped
 *                   in N 10-14 kt; Jwilly: "Croatan Jetty only one looks okay"
 *
 * SIZE. The middle of the jetty's band over the middle of the open beach's,
 * the median of the looks. A field report filed under the spot on this
 * phone (src/lib/beachFactorHere.ts) replaces the region's factor, and this
 * one with it, once it has three.
 *
 * SHELTER. A jetty breaks the wind from its side: from within
 * SHELTER_HALF_DEG of `fromDeg`, the wind on the water counts SHELTER_SHARE
 * of its speed (the shape and the quality words read it, src/lib/surfPageData.ts).
 */
export interface JettyLook {
  /** Where and when, and what was seen. */
  source: string
  /** The jetty's band and the open beach's, faces, feet. */
  jettyFt: [number, number]
  openFt: [number, number]
}

export interface Shelter {
  /** The wind it breaks comes from here, degrees. */
  fromDeg: number
  halfDeg: number
  /** The share of that wind's speed left on the water. */
  share: number
}

export interface Jetty {
  looks: readonly JettyLook[]
  shelter: Shelter | null
}

const L1114 = '14 Nov 3:13 PM, Surfline cams (src/core/surf.ts, Batch LIVE 9A)'
const L1116 = '16 Nov 10:50 AM, cams and Jwilly (fixtures/truth/2026-11-16-vb-surf.json)'
/* "Knee to thigh": the 16 Nov cams, the same band at every one of the four. */
const KNEE_THIGH: [number, number] = [1, 2]

/*
 * The N wind's lee. 16 Nov: N 10-14 kt chopped the open beach and 1st St;
 * Croatan, south of Rudee Inlet's jetties, was "the only one okay". A wind
 * under 10 kt (the quality words' line, src/core/surfCall.ts CHOP_WIND_KT)
 * did not chop it while 14 kt did elsewhere: at most 10/14 of the speed was
 * on its water. SHELTER_SHARE 0.7, from that day. SHELTER_HALF_DEG 45: the
 * day's wind ran NNW to NNE (the fixture's "N", the model's 330-15°); no
 * look says how far round the lee reaches, so no wider than that.
 */
export const SHELTER_SHARE = 0.7
export const SHELTER_HALF_DEG = 45

export const JETTIES: Readonly<Record<string, Jetty>> = {
  'vb-croatan': {
    looks: [
      { source: L1114, jettyFt: [1, 2], openFt: [1, 2] },
      { source: L1116, jettyFt: KNEE_THIGH, openFt: KNEE_THIGH },
    ],
    shelter: { fromDeg: 0, halfDeg: SHELTER_HALF_DEG, share: SHELTER_SHARE },
  },
  'vb-1st-street-jetty': {
    looks: [
      { source: L1114, jettyFt: [2, 3], openFt: [1, 2] },
      { source: L1116, jettyFt: KNEE_THIGH, openFt: KNEE_THIGH },
    ],
    /* 16 Nov: chopped like the open beach; no lee seen. */
    shelter: null,
  },
}

const mid = (b: readonly [number, number]) => (b[0] + b[1]) / 2
const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** A jetty's size factor (over the region's) and its shelter; null for a spot that is not one of these. */
export function jettyOf(spotId: string): { sizeFactor: number; shelter: Shelter | null } | null {
  const j = JETTIES[spotId]
  if (j === undefined) return null
  const ratios = j.looks.filter((l) => mid(l.openFt) > 0).map((l) => mid(l.jettyFt) / mid(l.openFt))
  return { sizeFactor: ratios.length === 0 ? 1 : median(ratios), shelter: j.shelter }
}

/** The wind's speed on the water at a sheltered spot: SHELTER_SHARE of it from the lee's side, all of it otherwise. */
export function shelteredMps(mps: number, fromDeg: number | null, shelter: Shelter | null): number {
  if (shelter === null || fromDeg === null) return mps
  const d = Math.abs(((((fromDeg - shelter.fromDeg) % 360) + 540) % 360) - 180)
  return d <= shelter.halfDeg ? mps * shelter.share : mps
}
